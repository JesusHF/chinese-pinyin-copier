# Chinese Pinyin Copier (Chrome Extension)

A Google Chrome extension (Manifest V3) that converts selected Chinese characters into Mandarin Pinyin and copies them directly into your clipboard when you click the pinned extension button in the Chrome toolbar.

---

## ✨ Features

- **One-Click Pinned Action**: No cumbersome popups. Just select text and click the pinned icon in the toolbar.
- **Accurate Pinyin Engine**: Powered by offline `pinyin-pro`, supporting diacritics, polyphonic context disambiguation (多音字), and tone sandhi (变调).
- **Google Sheets & Spreadsheet Range Support**: Highlight any multi-cell row/column range in Google Sheets or web tables. Accurately converts Chinese cells while preserving numbers, empty cells, and labels in their exact 2D grid coordinates.
- **Dual-MIME Clipboard Delivery**: Writes both TSV (`text/plain`) and HTML table (`text/html`) to the clipboard so pasting into Google Sheets, Excel, or Numbers aligns cells perfectly without spilling.
- **Universal Selection Support**: Works across standard webpage text, links, and text within `<input>` and `<textarea>` elements.
- **Direct Clipboard Integration**: Copies Pinyin into your clipboard with focus-resilient fallback copying.
- **In-Page Floating Toast HUD**: Renders a sleek floating notification on the active page showing the original Chinese characters and their Pinyin equivalent.
- **Toolbar Badge Feedback**: Instant badge cues on the extension icon (`✓` for success, `!` for warning, `ERR` for restricted pages).
- **Customizable Formatting**: Choose between tone marks (`nǐ hǎo`), tone numbers (`ni3 hao3`), or tone-less (`ni hao`), custom separators, and toast timings.
- **100% Offline & Private**: Zero external network requests; all conversions happen locally in your browser.

---

## 🚀 Quick Start / How to Install

1. **Open Chrome Extensions**:
   In Google Chrome, navigate to:
   ```text
   chrome://extensions
   ```
2. **Enable Developer Mode**:
   Toggle on the **Developer mode** switch in the top-right corner.
3. **Load Unpacked Extension**:
   - Click the **Load unpacked** button in the top-left corner.
   - Select the `ChineseExtension` directory:
     ```text
     /Users/jesus.hernandez02/Repos/_Personal/ChineseExtension
     ```
4. **Pin the Extension**:
   - Click the **Extensions puzzle icon** (`🧩`) in Chrome's top-right toolbar.
   - Click the **Pin icon** (`📌`) next to **Chinese Pinyin Copier**.
   - The red "拼" icon is now permanently pinned to your browser toolbar!

---

## 🧪 Testing the Extension

1. Open the included test page directly in Chrome:
   - Press `Cmd+O` in Chrome and select:
     ```text
     /Users/jesus.hernandez02/Repos/_Personal/ChineseExtension/test/test-page.html
     ```
2. Highlight any of the Chinese phrases (e.g. `你好世界` or `重庆`).
3. Click the **pinned extension icon** in your toolbar.
4. Watch the confirmation badge (`✓`) and the floating toast appear.
5. Paste (`Cmd+V` / `Ctrl+V`) into any application or the test page's verification box!
6. **Spreadsheet Multi-Cell Test**:
   - In Section 5 of the test page (or in a real [Google Sheet](https://docs.google.com/spreadsheets/)), select a multi-cell range.
   - Click the pinned icon; notice the toast showing `Pinyin Copied! (3 rows × 4 columns)`.
   - Paste into the Multi-Cell Inspector or Google Sheets to verify that 2D grid coordinates are completely preserved.

---

## ⚙️ Options & Preferences

Right-click the pinned icon and select **Options** (or go to `chrome://extensions` → Details → Extension options):
- **Tone Accent Style**: Tone marks (`nǐ hǎo`), numbers (`ni3 hao3`), or none (`ni hao`).
- **Syllable Separator**: Space (` `), hyphen (`-`), or continuous (``).
- **Tone Sandhi**: Toggle automatic phonetic third-tone and inflection shifts.
- **In-Page Toast HUD**: Toggle notifications and adjust duration.
- **Live Preview Sandbox**: Type any Chinese text to preview output immediately.

---

## 🔬 Automated Testing

Run the automated test suite in your terminal:
```bash
npm test
```

This verifies:
- Manifest V3 configuration & permission schema.
- Chinese CJK Unicode regex accuracy.
- Tone formatting, separators, and polyphonic disambiguation (多音字).
- Icon asset dimensions and integrity.

---

## 📄 Specification Document

For the comprehensive technical specification, architecture diagrams, and error-handling matrix, consult [`SPECIFICATION.md`](file:///Users/jesus.hernandez02/Repos/_Personal/ChineseExtension/SPECIFICATION.md).
