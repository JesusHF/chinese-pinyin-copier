/**
 * Chinese Pinyin Copier - Options Controller
 */

const DEFAULT_SETTINGS = {
  toneType: 'symbol',
  separator: ' ',
  grouping: 'words',
  toneSandhi: true,
  erhua: 'phonetic',
  showToast: true,
  toastDuration: 2500
};

// DOM Elements
const toneTypeEl = document.getElementById('toneType');
const separatorEl = document.getElementById('separator');
const groupingEl = document.getElementById('grouping');
const toneSandhiEl = document.getElementById('toneSandhi');
const erhuaEl = document.getElementById('erhua');
const showToastEl = document.getElementById('showToast');
const toastDurationEl = document.getElementById('toastDuration');
const durationGroupEl = document.getElementById('durationGroup');
const testInputEl = document.getElementById('testInput');
const previewOutputEl = document.getElementById('previewOutput');
const copyTestBtn = document.getElementById('copyTestBtn');
const saveBtn = document.getElementById('saveBtn');
const resetBtn = document.getElementById('resetBtn');
const statusMessageEl = document.getElementById('statusMessage');

/**
 * Updates the live preview box based on current input and configuration
 */
function updatePreview() {
  const text = testInputEl.value || '';
  if (!text.trim()) {
    previewOutputEl.textContent = '(enter Chinese characters above to preview)';
    previewOutputEl.style.color = '#94A3B8';
    return;
  }

  try {
    if (window.pinyinPro && window.pinyinPro.pinyin) {
      let result = '';
      const erhuaFn = (window.ErhuaHelper && typeof window.ErhuaHelper.convertWithErhua === 'function')
        ? window.ErhuaHelper.convertWithErhua
        : null;

      if (window.WordGroupingHelper && typeof window.WordGroupingHelper.convertWithWordGrouping === 'function') {
        result = window.WordGroupingHelper.convertWithWordGrouping(text, window.pinyinPro.pinyin, {
          toneType: toneTypeEl.value,
          separator: separatorEl.value,
          grouping: groupingEl ? groupingEl.value : 'words',
          toneSandhi: toneSandhiEl.checked,
          erhua: erhuaEl ? erhuaEl.value : 'phonetic'
        }, erhuaFn);
      } else if (erhuaFn) {
        result = erhuaFn(text, window.pinyinPro.pinyin, {
          toneType: toneTypeEl.value,
          separator: separatorEl.value,
          toneSandhi: toneSandhiEl.checked,
          erhua: erhuaEl ? erhuaEl.value : 'phonetic'
        });
      } else {
        result = window.pinyinPro.pinyin(text, {
          toneType: toneTypeEl.value,
          separator: separatorEl.value,
          toneSandhi: toneSandhiEl.checked,
          nonZh: 'consecutive'
        });
      }
      previewOutputEl.textContent = result || '(no result)';
      previewOutputEl.style.color = '#10B981';
    } else {
      previewOutputEl.textContent = 'pinyin-pro engine not ready';
    }
  } catch (err) {
    previewOutputEl.textContent = 'Preview error: ' + err.message;
    previewOutputEl.style.color = '#EF4444';
  }
}

/**
 * Loads saved settings from chrome.storage.sync
 */
function restoreSettings() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
      applyFormValues(settings);
    });
  } else {
    // Standalone / preview mode
    applyFormValues(DEFAULT_SETTINGS);
  }
}

/**
 * Populates UI inputs with settings object
 */
function applyFormValues(settings) {
  toneTypeEl.value = settings.toneType ?? DEFAULT_SETTINGS.toneType;
  separatorEl.value = settings.separator ?? DEFAULT_SETTINGS.separator;
  if (groupingEl) {
    groupingEl.value = settings.grouping ?? DEFAULT_SETTINGS.grouping;
  }
  toneSandhiEl.checked = settings.toneSandhi ?? DEFAULT_SETTINGS.toneSandhi;
  if (erhuaEl) {
    erhuaEl.value = settings.erhua ?? DEFAULT_SETTINGS.erhua;
  }
  showToastEl.checked = settings.showToast ?? DEFAULT_SETTINGS.showToast;
  toastDurationEl.value = String(settings.toastDuration ?? DEFAULT_SETTINGS.toastDuration);

  // Sync conditional visibility
  toggleDurationVisibility();
  updatePreview();
}

/**
 * Toggles the duration field visibility based on toast checkbox
 */
function toggleDurationVisibility() {
  if (showToastEl.checked) {
    durationGroupEl.style.display = 'flex';
  } else {
    durationGroupEl.style.display = 'none';
  }
}

/**
 * Displays temporary status message
 */
function showStatus(text, type = 'success') {
  statusMessageEl.textContent = text;
  statusMessageEl.className = 'status-message ' + type;
  setTimeout(() => {
    statusMessageEl.textContent = '';
  }, 2500);
}

/**
 * Saves settings to chrome.storage.sync
 */
function saveSettings() {
  const settings = {
    toneType: toneTypeEl.value,
    separator: separatorEl.value,
    grouping: groupingEl ? groupingEl.value : DEFAULT_SETTINGS.grouping,
    toneSandhi: toneSandhiEl.checked,
    erhua: erhuaEl ? erhuaEl.value : DEFAULT_SETTINGS.erhua,
    showToast: showToastEl.checked,
    toastDuration: Number(toastDurationEl.value)
  };

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.set(settings, () => {
      showStatus('✓ Settings saved successfully!', 'success');
    });
  } else {
    showStatus('✓ Settings saved (local test)', 'success');
  }
}

/**
 * Resets settings back to defaults
 */
function resetSettings() {
  applyFormValues(DEFAULT_SETTINGS);
  saveSettings();
  showStatus('↺ Settings reset to default values', 'info');
}

/**
 * Copies the preview text to clipboard
 */
async function copyPreviewToClipboard() {
  const text = previewOutputEl.textContent;
  if (!text || text.startsWith('(')) return;

  try {
    await navigator.clipboard.writeText(text);
    const origText = copyTestBtn.innerHTML;
    copyTestBtn.innerHTML = '<span>✓ Copied!</span>';
    setTimeout(() => {
      copyTestBtn.innerHTML = origText;
    }, 1500);
  } catch (err) {
    console.error('Failed to copy test text:', err);
  }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', restoreSettings);

toneTypeEl.addEventListener('change', updatePreview);
separatorEl.addEventListener('change', updatePreview);
if (groupingEl) {
  groupingEl.addEventListener('change', updatePreview);
}
toneSandhiEl.addEventListener('change', updatePreview);
if (erhuaEl) {
  erhuaEl.addEventListener('change', updatePreview);
}
testInputEl.addEventListener('input', updatePreview);

showToastEl.addEventListener('change', () => {
  toggleDurationVisibility();
});

saveBtn.addEventListener('click', saveSettings);
resetBtn.addEventListener('click', resetSettings);
copyTestBtn.addEventListener('click', copyPreviewToClipboard);
