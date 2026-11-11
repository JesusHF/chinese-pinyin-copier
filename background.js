/**
 * Chinese Pinyin Copier - Service Worker (Background Script)
 *
 * Listens for clicks on the pinned extension action icon in the Chrome toolbar.
 * Retrieves selected text from the active tab or Google Sheets cell range,
 * converts Chinese characters to Pinyin, preserves tabular structures,
 * copies the result to the system clipboard (in TSV and HTML table formats),
 * and displays user feedback.
 */

// Import the bundled pinyin-pro library and Erhua/Word helpers (in service worker context)
if (typeof importScripts === 'function') {
  importScripts('lib/pinyin-pro.js', 'lib/erhua.js', 'lib/segmenter.js');
}

// In Node environment, require helpers
const Erhua = typeof ErhuaHelper !== 'undefined'
  ? ErhuaHelper
  : (typeof require === 'function' ? require('./lib/erhua.js') : null);

const WordGrouping = typeof WordGroupingHelper !== 'undefined'
  ? WordGroupingHelper
  : (typeof require === 'function' ? require('./lib/segmenter.js') : null);

// Default user settings
const DEFAULT_SETTINGS = {
  toneType: 'symbol',     // 'symbol' (nǐ hǎo) | 'num' (ni3 hao3) | 'none' (ni hao)
  separator: ' ',         // syllable separator: ' ' | '-' | ''
  grouping: 'words',      // 'words' (xǐshǒujiān zài nǎlǐ) | 'syllables' (xǐ shǒu jiān zài nǎ lǐ)
  toneSandhi: true,       // whether tone sandhi rules are applied
  erhua: 'phonetic',      // 'phonetic' (diar) | 'standard' (dianr) | 'off' (diǎn ér)
  showToast: true,        // whether to display in-page floating toast
  toastDuration: 2500     // toast duration in milliseconds
};

// Regex detecting Unicode CJK Unified Ideographs and common Chinese character ranges
const CHINESE_REGEX = /[\u4e00-\u9fa5\u3400-\u4dbf\uf900-\ufaff]/u;

/**
 * Parses RFC-compliant TSV text into a 2D array of strings.
 * Handles embedded quotes (""), newlines, and tab delimiters.
 * @param {string} text
 * @returns {string[][]}
 */
function parseTSV(text) {
  if (typeof text !== 'string' || text.length === 0) {
    return [];
  }

  const rows = [];
  let currentRow = [];
  let currentCell = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        // Escaped double quote ("")
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentCell += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        currentCell += char;
        i++;
      }
    } else {
      if (char === '"' && currentCell.length === 0) {
        inQuotes = true;
        i++;
      } else if (char === '\t') {
        currentRow.push(currentCell);
        currentCell = '';
        i++;
      } else if (char === '\r') {
        if (i + 1 < text.length && text[i + 1] === '\n') {
          i++;
        }
        currentRow.push(currentCell);
        currentCell = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
      } else if (char === '\n') {
        currentRow.push(currentCell);
        currentCell = '';
        rows.push(currentRow);
        currentRow = [];
        i++;
      } else {
        currentCell += char;
        i++;
      }
    }
  }

  // Final cell and row if pending
  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
}

/**
 * Serializes a 2D matrix of strings into RFC-compliant TSV text.
 * Escapes quotes and wraps cells containing special characters in quotes.
 * @param {string[][]} matrix
 * @returns {string}
 */
function serializeTSV(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) return '';
  return matrix.map((row) => {
    return row.map((cell) => {
      const cellStr = cell === null || cell === undefined ? '' : String(cell);
      if (cellStr.includes('\t') || cellStr.includes('\n') || cellStr.includes('\r') || cellStr.includes('"')) {
        return '"' + cellStr.replace(/"/g, '""') + '"';
      }
      return cellStr;
    }).join('\t');
  }).join('\n');
}

/**
 * Escapes HTML characters for safe table markup generation
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str === null || str === undefined ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generates an HTML table from a 2D matrix of strings.
 * @param {string[][]} matrix
 * @returns {string}
 */
function generateHTMLTable(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) return '';
  const rowsHtml = matrix.map((row) => {
    const cellsHtml = row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('');
    return `<tr>${cellsHtml}</tr>`;
  }).join('');
  return `<table><tbody>${rowsHtml}</tbody></table>`;
}

/**
 * Checks whether the text represents tabular data
 * @param {string} text
 * @param {boolean} isGoogleSheets
 * @returns {boolean}
 */
function isTabularData(text, isGoogleSheets = false) {
  if (typeof text !== 'string' || text.length === 0) return false;
  if (isGoogleSheets) return true;
  return text.includes('\t');
}

/**
 * Converts Chinese characters within each cell of a 2D matrix into Pinyin.
 * Preserves non-Chinese cells (empty, numbers, English labels, symbols).
 * @param {string[][]} matrix
 * @param {Function} pinyinFn
 * @param {object} options
 * @returns {{ matrix: string[][], hasChinese: boolean, convertedCount: number, totalCells: number, rowCount: number, colCount: number }}
 */
function convertMatrixToPinyin(matrix, pinyinFn, options = {}) {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return {
      matrix: [],
      hasChinese: false,
      convertedCount: 0,
      totalCells: 0,
      rowCount: 0,
      colCount: 0
    };
  }

  let hasChinese = false;
  let convertedCount = 0;
  let totalCells = 0;

  const convertedMatrix = matrix.map((row) => {
    return row.map((cell) => {
      totalCells++;
      const cellStr = cell === null || cell === undefined ? '' : String(cell);
      if (CHINESE_REGEX.test(cellStr)) {
        hasChinese = true;
        convertedCount++;
        if (typeof pinyinFn === 'function') {
          const erhuaHelper = (typeof ErhuaHelper !== 'undefined') ? ErhuaHelper : Erhua;
          const wordHelper = (typeof WordGroupingHelper !== 'undefined') ? WordGroupingHelper : WordGrouping;
          const erhuaFn = erhuaHelper ? erhuaHelper.convertWithErhua : null;

          if (wordHelper && typeof wordHelper.convertWithWordGrouping === 'function') {
            return wordHelper.convertWithWordGrouping(cellStr, pinyinFn, {
              toneType: options.toneType || 'symbol',
              separator: options.separator !== undefined ? options.separator : ' ',
              grouping: options.grouping || 'words',
              toneSandhi: options.toneSandhi !== undefined ? options.toneSandhi : true,
              erhua: options.erhua || 'phonetic'
            }, erhuaFn);
          }

          if (erhuaFn) {
            return erhuaFn(cellStr, pinyinFn, {
              toneType: options.toneType || 'symbol',
              separator: options.separator !== undefined ? options.separator : ' ',
              toneSandhi: options.toneSandhi !== undefined ? options.toneSandhi : true,
              erhua: options.erhua || 'phonetic'
            });
          }
          return pinyinFn(cellStr, {
            toneType: options.toneType || 'symbol',
            separator: options.separator !== undefined ? options.separator : ' ',
            toneSandhi: options.toneSandhi !== undefined ? options.toneSandhi : true,
            nonZh: 'consecutive'
          });
        }
      }
      return cellStr;
    });
  });

  return {
    matrix: convertedMatrix,
    hasChinese,
    convertedCount,
    totalCells,
    rowCount: matrix.length,
    colCount: matrix.reduce((max, r) => Math.max(max, r.length), 0)
  };
}

/**
 * Retrieves user preferences from chrome.storage.sync
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (stored) => {
      resolve({ ...DEFAULT_SETTINGS, ...stored });
    });
  });
}

/**
 * Temporarily displays a badge on the extension icon
 * @param {number} tabId
 * @param {string} text
 * @param {string} backgroundColor
 */
function setTemporaryBadge(tabId, text, backgroundColor) {
  try {
    chrome.action.setBadgeText({ tabId, text });
    chrome.action.setBadgeBackgroundColor({ tabId, color: backgroundColor });
    setTimeout(() => {
      chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {});
    }, 2000);
  } catch (err) {
    // Tab may have closed
  }
}

/**
 * Checks whether an extension script can be injected into the tab
 * @param {chrome.tabs.Tab} tab
 * @returns {boolean}
 */
function isInjectableTab(tab) {
  if (!tab || !tab.id || !tab.url) return false;
  const restrictedProtocols = ['chrome:', 'chrome-extension:', 'edge:', 'devtools:', 'view-source:', 'about:'];
  const isRestrictedUrl = restrictedProtocols.some((protocol) => tab.url.startsWith(protocol));
  const isWebStore = tab.url.includes('chromewebstore.google.com') || tab.url.includes('chrome.google.com/webstore');
  return !isRestrictedUrl && !isWebStore;
}

/**
 * Main click handler for the pinned extension action icon
 */
if (typeof chrome !== 'undefined' && chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(async (tab) => {
    if (!isInjectableTab(tab)) {
      console.warn('[Chinese Pinyin Copier] Cannot execute on restricted browser page:', tab?.url);
      if (tab?.id) {
        setTemporaryBadge(tab.id, 'ERR', '#EF4444');
      }
      return;
    }

    const tabId = tab.id;
    const settings = await loadSettings();
    const isGoogleSheets = Boolean(tab.url && tab.url.includes('docs.google.com/spreadsheets'));

    try {
      let selectedText = '';

      if (isGoogleSheets) {
        const [execResult] = await chrome.scripting.executeScript({
          target: { tabId },
          func: extractSelectionFromGoogleSheets
        });
        selectedText = execResult?.result || '';
      } else {
        const [execResult] = await chrome.scripting.executeScript({
          target: { tabId },
          func: getSelectedTextFromPage
        });
        selectedText = execResult?.result || '';
      }

      // Validate selection
      if (!selectedText || selectedText.trim().length === 0) {
        setTemporaryBadge(tabId, '!', '#F59E0B');
        if (settings.showToast) {
          await chrome.scripting.executeScript({
            target: { tabId },
            func: renderInPageToast,
            args: [{
              type: 'warning',
              title: isGoogleSheets ? 'No Cells Selected' : 'No Text Selected',
              message: isGoogleSheets
                ? 'Highlight Chinese cells in Google Sheets first.'
                : 'Highlight Chinese text with your mouse first.',
              duration: settings.toastDuration
            }]
          });
        }
        return;
      }

      const pinyinFn = (typeof self !== 'undefined' && self.pinyinPro && self.pinyinPro.pinyin)
        ? self.pinyinPro.pinyin
        : (typeof pinyinPro !== 'undefined' ? pinyinPro.pinyin : null);

      if (!pinyinFn) {
        throw new Error('pinyin-pro library is not available');
      }

      const isTabular = isTabularData(selectedText, isGoogleSheets);

      if (isTabular) {
        const matrix = parseTSV(selectedText);
        if (matrix.length === 0 || (matrix.length === 1 && matrix[0].length === 0)) {
          setTemporaryBadge(tabId, '!', '#F59E0B');
          if (settings.showToast) {
            await chrome.scripting.executeScript({
              target: { tabId },
              func: renderInPageToast,
              args: [{
                type: 'warning',
                title: isGoogleSheets ? 'No Cells Selected' : 'No Text Selected',
                message: isGoogleSheets
                  ? 'Highlight Chinese cells in Google Sheets first.'
                  : 'Highlight Chinese text with your mouse first.',
                duration: settings.toastDuration
              }]
            });
          }
          return;
        }

        const result = convertMatrixToPinyin(matrix, pinyinFn, settings);

        // Verify at least one cell contained Chinese
        if (!result.hasChinese) {
          setTemporaryBadge(tabId, '!', '#F59E0B');
          if (settings.showToast) {
            await chrome.scripting.executeScript({
              target: { tabId },
              func: renderInPageToast,
              args: [{
                type: 'warning',
                title: 'No Chinese Characters',
                message: isGoogleSheets
                  ? 'The selected cells do not contain Chinese characters.'
                  : 'The selected table cells do not contain Chinese characters.',
                duration: settings.toastDuration
              }]
            });
          }
          return;
        }

        const isMultiCell = (result.rowCount > 1 || result.colCount > 1);
        const pinyinTSV = serializeTSV(result.matrix);
        const htmlTable = generateHTMLTable(result.matrix);

        // Find first Chinese cell for preview
        let firstOrig = '';
        let firstPinyin = '';
        outerLoop: for (let r = 0; r < matrix.length; r++) {
          for (let c = 0; c < matrix[r].length; c++) {
            if (CHINESE_REGEX.test(matrix[r][c])) {
              firstOrig = matrix[r][c];
              firstPinyin = result.matrix[r][c];
              break outerLoop;
            }
          }
        }

        const rowLabel = result.rowCount === 1 ? '1 row' : `${result.rowCount} rows`;
        const colLabel = result.colCount === 1 ? '1 column' : `${result.colCount} columns`;
        const dimensions = isMultiCell ? `${rowLabel} × ${colLabel}` : null;
        const dimensionDetail = isMultiCell
          ? `${rowLabel} × ${colLabel} - ${result.totalCells} cells (${result.convertedCount} converted)`
          : null;

        await chrome.scripting.executeScript({
          target: { tabId },
          func: copyPinyinAndNotify,
          args: [{
            pinyinText: pinyinTSV,
            originalText: firstOrig || selectedText,
            pinyinPreview: firstPinyin,
            htmlTable,
            isTabular: true,
            dimensions,
            dimensionDetail,
            showToast: settings.showToast,
            duration: settings.toastDuration
          }]
        });

        setTemporaryBadge(tabId, '✓', '#10B981');
      } else {
        // Standard non-tabular text
        if (!CHINESE_REGEX.test(selectedText)) {
          setTemporaryBadge(tabId, '!', '#F59E0B');
          if (settings.showToast) {
            await chrome.scripting.executeScript({
              target: { tabId },
              func: renderInPageToast,
              args: [{
                type: 'warning',
                title: 'No Chinese Characters',
                message: 'The selected text does not contain Chinese characters.',
                duration: settings.toastDuration
              }]
            });
          }
          return;
        }

        const erhuaHelper = (typeof ErhuaHelper !== 'undefined') ? ErhuaHelper : Erhua;
        const wordHelper = (typeof WordGroupingHelper !== 'undefined') ? WordGroupingHelper : WordGrouping;
        const erhuaFn = erhuaHelper ? erhuaHelper.convertWithErhua : null;

        let pinyinText = '';
        if (wordHelper && typeof wordHelper.convertWithWordGrouping === 'function') {
          pinyinText = wordHelper.convertWithWordGrouping(selectedText, pinyinFn, {
            toneType: settings.toneType,
            separator: settings.separator,
            grouping: settings.grouping || 'words',
            toneSandhi: settings.toneSandhi,
            erhua: settings.erhua || 'phonetic'
          }, erhuaFn);
        } else if (erhuaFn) {
          pinyinText = erhuaFn(selectedText, pinyinFn, {
            toneType: settings.toneType,
            separator: settings.separator,
            toneSandhi: settings.toneSandhi,
            erhua: settings.erhua || 'phonetic'
          });
        } else {
          pinyinText = pinyinFn(selectedText, {
            toneType: settings.toneType,
            separator: settings.separator,
            toneSandhi: settings.toneSandhi,
            nonZh: 'consecutive'
          });
        }

        await chrome.scripting.executeScript({
          target: { tabId },
          func: copyPinyinAndNotify,
          args: [{
            pinyinText,
            originalText: selectedText,
            pinyinPreview: pinyinText,
            htmlTable: null,
            isTabular: false,
            dimensions: null,
            dimensionDetail: null,
            showToast: settings.showToast,
            duration: settings.toastDuration
          }]
        });

        setTemporaryBadge(tabId, '✓', '#10B981');
      }
    } catch (error) {
      console.error('[Chinese Pinyin Copier] Error processing request:', error);
      setTemporaryBadge(tabId, 'ERR', '#EF4444');
    }
  });
}

/**
 * Script executed in active tab context:
 * Focuses Google Sheets event target, triggers execCommand('copy'),
 * and reads the TSV payload from the clipboard.
 */
async function extractSelectionFromGoogleSheets() {
  // 1. Focus the Google Sheets event target iframe or active element
  try {
    const iframe = document.querySelector('iframe.docs-texteventtarget-iframe');
    if (iframe) {
      if (iframe.contentWindow) iframe.contentWindow.focus();
      if (iframe.contentDocument && iframe.contentDocument.body) {
        iframe.contentDocument.body.focus();
      }
    } else {
      const activeEl = document.querySelector('.cell-input') ||
                       document.querySelector('[role="grid"]') ||
                       document.querySelector('.waffle-border-container') ||
                       document.activeElement;
      if (activeEl && typeof activeEl.focus === 'function') {
        activeEl.focus();
      }
    }
  } catch (err) {
    console.warn('[Chinese Pinyin Copier] Focus error in Google Sheets:', err);
  }

  // 2. Trigger native Google Sheets copy command
  try {
    document.execCommand('copy');
  } catch (err) {
    console.warn('[Chinese Pinyin Copier] execCommand copy error:', err);
  }

  // Brief pause to allow Google Sheets' copy handler to populate the clipboard
  await new Promise((resolve) => setTimeout(resolve, 60));

  // 3. Read the TSV from the clipboard
  let text = '';
  if (navigator.clipboard && navigator.clipboard.readText) {
    try {
      text = await navigator.clipboard.readText();
    } catch (err) {
      console.warn('[Chinese Pinyin Copier] Failed to read clipboard:', err);
    }
  }

  // 4. Fallback: check standard selection if user was in formula/cell edit mode
  if (!text || text.trim().length === 0) {
    try {
      const sel = window.getSelection ? window.getSelection().toString() : '';
      if (sel && sel.trim().length > 0) {
        text = sel;
      }
    } catch (e) {}
  }

  return text || '';
}

/**
 * Script executed in active tab context:
 * Extracts selected text from either window selection or active input/textarea.
 */
function getSelectedTextFromPage() {
  // Check standard window selection
  const selection = window.getSelection();
  const text = selection ? selection.toString() : '';
  if (text && text.trim().length > 0) {
    return text.trim();
  }

  // Check active input or textarea
  const activeEl = document.activeElement;
  if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
    const start = activeEl.selectionStart;
    const end = activeEl.selectionEnd;
    if (typeof start === 'number' && typeof end === 'number' && start !== end) {
      return activeEl.value.substring(start, end).trim();
    }
  }

  return '';
}

/**
 * Script executed in active tab context:
 * Copies text (TSV + HTML table) to clipboard and triggers the Shadow DOM toast notification.
 */
async function copyPinyinAndNotify({
  pinyinText,
  originalText,
  pinyinPreview,
  htmlTable,
  isTabular,
  dimensions,
  dimensionDetail,
  showToast,
  duration
}) {
  let copied = false;

  // Attempt 1: Modern Async Clipboard API with ClipboardItem for text/plain AND text/html
  if (htmlTable && typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
    try {
      const textBlob = new Blob([pinyinText], { type: 'text/plain' });
      const htmlBlob = new Blob([htmlTable], { type: 'text/html' });
      const item = new ClipboardItem({
        'text/plain': textBlob,
        'text/html': htmlBlob
      });
      await navigator.clipboard.write([item]);
      copied = true;
    } catch (err) {
      console.warn('[Chinese Pinyin Copier] ClipboardItem write failed, trying writeText:', err);
    }
  }

  // Attempt 2: Modern Async Clipboard API writeText (plain text / TSV)
  if (!copied && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(pinyinText);
      copied = true;
    } catch (err) {
      // May fail if tab temporarily lost focus
    }
  }

  // Attempt 3: Fallback via temporary textarea + execCommand('copy')
  if (!copied) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = pinyinText;
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      copied = document.execCommand('copy');
      document.body.removeChild(textarea);
    } catch (fallbackErr) {
      console.error('[Chinese Pinyin Copier] Clipboard copy failed:', fallbackErr);
    }
  }

  // Display floating toast if enabled
  if (showToast) {
    const previewOriginal = (originalText || '').length > 35 ? (originalText || '').slice(0, 35) + '...' : (originalText || '');
    const previewPinyin = pinyinPreview
      ? (pinyinPreview.length > 45 ? pinyinPreview.slice(0, 45) + '...' : pinyinPreview)
      : (pinyinText.length > 50 ? pinyinText.slice(0, 50) + '...' : pinyinText);

    const toastTitle = dimensions ? `Pinyin Copied! (${dimensions})` : 'Pinyin Copied to Clipboard';

    createAndShowToast({
      type: 'success',
      title: toastTitle,
      dimensionDetail: dimensionDetail || null,
      original: previewOriginal,
      pinyin: previewPinyin,
      duration: duration || 2500
    });
  }

  return { copied, pinyinText };

  // Helper definition within injected script scope
  function createAndShowToast(options) {
    const CONTAINER_ID = 'chinese-pinyin-copier-host';
    let host = document.getElementById(CONTAINER_ID);

    if (!host) {
      host = document.createElement('div');
      host.id = CONTAINER_ID;
      host.style.position = 'fixed';
      host.style.top = '20px';
      host.style.left = '50%';
      host.style.transform = 'translateX(-50%)';
      host.style.zIndex = '2147483647';
      host.style.pointerEvents = 'none';
      document.documentElement.appendChild(host);
    }

    let shadow = host.shadowRoot;
    if (!shadow) {
      shadow = host.attachShadow({ mode: 'open' });
    }

    // Clear previous toasts
    shadow.innerHTML = '';

    const isSuccess = options.type === 'success';
    const accentColor = isSuccess ? '#10B981' : '#F59E0B';
    const iconSvg = isSuccess
      ? `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#10B981"/><path d="M6 10.5L8.5 13L14 7.5" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
      : `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#F59E0B"/><path d="M10 6V11M10 14H10.01" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/></svg>`;

    const toast = document.createElement('div');
    toast.className = 'toast';

    let contentHtml = `
      <style>
        .toast {
          pointer-events: auto;
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(18, 24, 38, 0.94);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-left: 4px solid ${accentColor};
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.35), 0 4px 10px rgba(0, 0, 0, 0.2);
          border-radius: 12px;
          padding: 12px 18px;
          color: #F9FAFB;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
          font-size: 13px;
          max-width: 520px;
          min-width: 280px;
          animation: slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          cursor: pointer;
          user-select: none;
        }
        .toast.closing {
          animation: slideOut 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .icon {
          flex-shrink: 0;
          display: flex;
          align-items: center;
        }
        .content {
          display: flex;
          flex-direction: column;
          gap: 3px;
          overflow: hidden;
        }
        .title {
          font-weight: 600;
          font-size: 13px;
          color: #FFFFFF;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .dimension-detail {
          font-size: 11px;
          color: #34D399;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .preview-box {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #9CA3AF;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pinyin-val {
          color: #34D399;
          font-weight: 600;
        }
        .orig-val {
          color: #D1D5DB;
        }
        .message-text {
          font-size: 12px;
          color: #D1D5DB;
        }
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateY(-16px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes slideOut {
          from {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      </style>
      <div class="icon">${iconSvg}</div>
      <div class="content">
        <div class="title">${options.title}</div>
        ${
          options.dimensionDetail
            ? `<div class="dimension-detail"><span>📊</span><span>${options.dimensionDetail}</span></div>`
            : ''
        }
        ${
          options.pinyin
            ? `<div class="preview-box">
                <span class="orig-val">${options.original}</span>
                <span>→</span>
                <span class="pinyin-val">${options.pinyin}</span>
              </div>`
            : `<div class="message-text">${options.message || ''}</div>`
        }
      </div>
    `;

    toast.innerHTML = contentHtml;
    shadow.appendChild(toast);

    function dismiss() {
      toast.classList.add('closing');
      setTimeout(() => {
        if (host && host.parentNode && shadow.contains(toast)) {
          shadow.removeChild(toast);
          if (shadow.childNodes.length === 0) {
            host.parentNode.removeChild(host);
          }
        }
      }, 200);
    }

    toast.addEventListener('click', dismiss);
    setTimeout(dismiss, options.duration || 2500);
  }
}

/**
 * Script executed in active tab context:
 * Shows a standalone warning/info toast when selection is invalid.
 */
function renderInPageToast(options) {
  const CONTAINER_ID = 'chinese-pinyin-copier-host';
  let host = document.getElementById(CONTAINER_ID);

  if (!host) {
    host = document.createElement('div');
    host.id = CONTAINER_ID;
    host.style.position = 'fixed';
    host.style.top = '20px';
    host.style.left = '50%';
    host.style.transform = 'translateX(-50%)';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';
    document.documentElement.appendChild(host);
  }

  let shadow = host.shadowRoot;
  if (!shadow) {
    shadow = host.attachShadow({ mode: 'open' });
  }

  shadow.innerHTML = '';

  const accentColor = options.type === 'warning' ? '#F59E0B' : '#EF4444';
  const iconSvg = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="${accentColor}"/><path d="M10 6V11M10 14H10.01" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/></svg>`;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <style>
      .toast {
        pointer-events: auto;
        display: flex;
        align-items: center;
        gap: 12px;
        background: rgba(18, 24, 38, 0.94);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-left: 4px solid ${accentColor};
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.35), 0 4px 10px rgba(0, 0, 0, 0.2);
        border-radius: 12px;
        padding: 12px 18px;
        color: #F9FAFB;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
        font-size: 13px;
        max-width: 440px;
        min-width: 260px;
        animation: slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        cursor: pointer;
        user-select: none;
      }
      .toast.closing {
        animation: slideOut 0.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      .icon {
        flex-shrink: 0;
        display: flex;
        align-items: center;
      }
      .content {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .title {
        font-weight: 600;
        font-size: 13px;
        color: #FFFFFF;
      }
      .message-text {
        font-size: 12px;
        color: #9CA3AF;
      }
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(-16px) scale(0.96);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      @keyframes slideOut {
        from {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateY(-12px) scale(0.96);
        }
      }
    </style>
    <div class="icon">${iconSvg}</div>
    <div class="content">
      <div class="title">${options.title}</div>
      <div class="message-text">${options.message}</div>
    </div>
  `;

  shadow.appendChild(toast);

  function dismiss() {
    toast.classList.add('closing');
    setTimeout(() => {
      if (host && host.parentNode && shadow.contains(toast)) {
        shadow.removeChild(toast);
        if (shadow.childNodes.length === 0) {
          host.parentNode.removeChild(host);
        }
      }
    }, 200);
  }

  toast.addEventListener('click', dismiss);
  setTimeout(dismiss, options.duration || 2500);
}

// Export internal functions for unit testing in Node environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_SETTINGS,
    CHINESE_REGEX,
    parseTSV,
    serializeTSV,
    escapeHtml,
    generateHTMLTable,
    isTabularData,
    convertMatrixToPinyin,
    Erhua,
    WordGrouping
  };
}
