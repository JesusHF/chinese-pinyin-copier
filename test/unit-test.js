/**
 * Automated Unit Tests for Chinese Pinyin Copier
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Load bundled pinyin library
const pinyinPro = require('../lib/pinyin-pro.js');

// Load tabular and background utilities
const {
  CHINESE_REGEX,
  parseTSV,
  serializeTSV,
  escapeHtml,
  generateHTMLTable,
  isTabularData,
  convertMatrixToPinyin
} = require('../background.js');

// Load Erhua helper
const {
  applyErhua,
  convertWithErhua,
  NON_ERHUA_WORDS
} = require('../lib/erhua.js');

// Load Word Grouping helper
const {
  segmentChineseWords,
  convertWithWordGrouping
} = require('../lib/segmenter.js');

console.log('--- Running Tests for Chinese Pinyin Copier ---\n');

// 1. Manifest V3 Validation
console.log('1. Validating manifest.json...');
const manifestPath = path.join(__dirname, '../manifest.json');
assert(fs.existsSync(manifestPath), 'manifest.json must exist');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.strictEqual(manifest.manifest_version, 3, 'Must be Manifest V3');
assert(manifest.permissions.includes('activeTab'), 'Must include activeTab permission');
assert(manifest.permissions.includes('scripting'), 'Must include scripting permission');
assert(manifest.permissions.includes('clipboardWrite'), 'Must include clipboardWrite permission');
assert(manifest.permissions.includes('clipboardRead'), 'Must include clipboardRead permission for Google Sheets TSV reading');
assert(manifest.permissions.includes('storage'), 'Must include storage permission');
assert(manifest.action, 'Must define action');
assert(!manifest.action.default_popup, 'default_popup must NOT be defined so action.onClicked fires on pin click');
assert(manifest.background.service_worker, 'Must define background service worker');
console.log('✓ manifest.json is fully valid and configured with clipboardRead permission!\n');

// 2. Chinese Character Regex Validation
console.log('2. Testing Chinese Character Detection Regex...');
assert.strictEqual(CHINESE_REGEX.test('你好'), true, 'Should detect Simplified Chinese');
assert.strictEqual(CHINESE_REGEX.test('學習中文'), true, 'Should detect Traditional Chinese');
assert.strictEqual(CHINESE_REGEX.test('Hello 你好 World'), true, 'Should detect Chinese within mixed text');
assert.strictEqual(CHINESE_REGEX.test('Hello World!'), false, 'Should reject English text');
assert.strictEqual(CHINESE_REGEX.test('1234567890'), false, 'Should reject numbers');
assert.strictEqual(CHINESE_REGEX.test('!@#$%^&*()'), false, 'Should reject symbols');
assert.strictEqual(CHINESE_REGEX.test(''), false, 'Should reject empty string');
console.log('✓ Chinese regex detection passed!\n');

// 3. Pinyin Conversion Accuracy
console.log('3. Testing Pinyin Conversion Accuracy...');
const { pinyin } = pinyinPro;

// Tone Marks (default)
assert.strictEqual(
  pinyin('你好世界', { toneType: 'symbol', separator: ' ' }),
  'nǐ hǎo shì jiè',
  'Standard tone symbols failed'
);

// Tone Numbers
assert.strictEqual(
  pinyin('你好世界', { toneType: 'num', separator: ' ' }),
  'ni3 hao3 shi4 jie4',
  'Tone numbers failed'
);

// No Tones
assert.strictEqual(
  pinyin('你好世界', { toneType: 'none', separator: ' ' }),
  'ni hao shi jie',
  'No tones failed'
);

// Hyphen Separator
assert.strictEqual(
  pinyin('你好世界', { toneType: 'symbol', separator: '-' }),
  'nǐ-hǎo-shì-jiè',
  'Hyphen separator failed'
);

// No Separator
assert.strictEqual(
  pinyin('你好世界', { toneType: 'symbol', separator: '' }),
  'nǐhǎoshìjiè',
  'Empty separator failed'
);
console.log('✓ Tone and separator formats passed!\n');

// 4. Polyphonic Word Disambiguation
console.log('4. Testing Polyphonic Word Disambiguation (多音字)...');
assert.strictEqual(pinyin('银行'), 'yín háng', '银行 should be yín háng');
assert.strictEqual(pinyin('行走'), 'xíng zǒu', '行走 should be xíng zǒu');
assert.strictEqual(pinyin('音乐'), 'yīn yuè', '音乐 should be yīn yuè');
assert.strictEqual(pinyin('快乐'), 'kuài lè', '快乐 should be kuài lè');
assert.strictEqual(pinyin('重庆'), 'chóng qìng', '重庆 should be chóng qìng');
assert.strictEqual(pinyin('重要'), 'zhòng yào', '重要 should be zhòng yào');
assert.strictEqual(pinyin('长大'), 'zhǎng dà', '长大 should be zhǎng dà');
assert.strictEqual(pinyin('长河'), 'cháng hé', '长河 should be cháng hé');
console.log('✓ Polyphonic disambiguation passed!\n');

// 5. RFC-Compliant TSV Parsing & Serialization
console.log('5. Testing RFC-Compliant TSV Parsing & Serialization...');

// Simple 2x2 grid
const tsv1 = '北京\t上海\n广州\t深圳';
const matrix1 = parseTSV(tsv1);
assert.deepStrictEqual(matrix1, [
  ['北京', '上海'],
  ['广州', '深圳']
], 'Simple TSV parsing failed');

// CRLF line endings
const tsvCRLF = '北京\t上海\r\n广州\t深圳\r\n';
const matrixCRLF = parseTSV(tsvCRLF);
assert.deepStrictEqual(matrixCRLF, [
  ['北京', '上海'],
  ['广州', '深圳']
], 'CRLF TSV parsing failed');

// Quoted cells with embedded commas, tabs, and newlines
const tsvComplex = '"北京\t首都"\t"上海, 繁华"\n"第一行\n第二行"\t"测试 ""引号"""';
const matrixComplex = parseTSV(tsvComplex);
assert.deepStrictEqual(matrixComplex, [
  ['北京\t首都', '上海, 繁华'],
  ['第一行\n第二行', '测试 "引号"']
], 'Complex quoted TSV parsing failed');

// Empty cells and ragged rows
const tsvEmpty = 'A\t\tB\n\tC\t';
const matrixEmpty = parseTSV(tsvEmpty);
assert.deepStrictEqual(matrixEmpty, [
  ['A', '', 'B'],
  ['', 'C', '']
], 'TSV with empty cells failed');

// Round-trip serialization and re-parsing
const origData = [
  ['城市', '描述', '数据'],
  ['北京 "故宫"', '首都\n历史悠久', '2154万'],
  ['上海', '经济\t商贸', '2487万']
];
const serialized = serializeTSV(origData);
const parsedBack = parseTSV(serialized);
assert.deepStrictEqual(parsedBack, origData, 'TSV round-trip serialization failed');
console.log('✓ RFC-compliant TSV parsing and round-trip serialization passed!\n');

// 6. 2D Matrix Pinyin Conversion
console.log('6. Testing 2D Matrix Pinyin Conversion...');
const testGrid = [
  ['城市', '人口', 'Code'],
  ['北京', '2154万', 'BJ'],
  ['Shanghai', '2487万', 'SH'],
  ['', '100%', 'N/A']
];

const conversionResult = convertMatrixToPinyin(testGrid, pinyinPro.pinyin, {
  toneType: 'symbol',
  separator: ' '
});

assert.strictEqual(conversionResult.hasChinese, true, 'Should detect Chinese in matrix');
assert.strictEqual(conversionResult.rowCount, 4, 'Row count should be 4');
assert.strictEqual(conversionResult.colCount, 3, 'Col count should be 3');
assert.strictEqual(conversionResult.totalCells, 12, 'Total cells should be 12');
assert.strictEqual(conversionResult.convertedCount, 5, 'Converted count should be 5 (城市, 人口, 北京, 2154万, 2487万)');

assert.deepStrictEqual(conversionResult.matrix, [
  ['chéngshì', 'rénkǒu', 'Code'],
  ['běijīng', '2154 wàn', 'BJ'],
  ['Shanghai', '2487 wàn', 'SH'],
  ['', '100%', 'N/A']
], 'Matrix conversion should preserve non-Chinese cells exactly and align coordinates with word grouping');

// Test matrix conversion with syllables mode
const syllableGridResult = convertMatrixToPinyin(testGrid, pinyinPro.pinyin, {
  toneType: 'symbol',
  separator: ' ',
  grouping: 'syllables'
});
assert.strictEqual(syllableGridResult.matrix[0][0], 'chéng shì', 'Matrix in syllables mode separates characters');

// Matrix without Chinese
const nonChineseGrid = [
  ['City', 'Population', 'Code'],
  ['New York', '8330000', 'NYC']
];
const nonChineseResult = convertMatrixToPinyin(nonChineseGrid, pinyinPro.pinyin, {});
assert.strictEqual(nonChineseResult.hasChinese, false, 'Should flag hasChinese as false for non-Chinese matrix');
assert.strictEqual(nonChineseResult.convertedCount, 0, 'No cells should be converted');
assert.deepStrictEqual(nonChineseResult.matrix, nonChineseGrid, 'Non-Chinese matrix should remain identical');
console.log('✓ 2D Matrix Pinyin conversion passed!\n');

// 7. HTML Table Generator
console.log('7. Testing HTML Table Generator...');
const tableData = [
  ['城市', 'Pinyin & English'],
  ['北京', '<Old Capital> "BJ"']
];
const htmlTable = generateHTMLTable(tableData);
assert(htmlTable.startsWith('<table><tbody><tr><td>'), 'Table must start with <table><tbody><tr><td>');
assert(htmlTable.includes('<td>城市</td>'), 'Must contain cell with 城市');
assert(htmlTable.includes('&lt;Old Capital&gt;'), 'Must escape HTML brackets');
assert(htmlTable.includes('&quot;BJ&quot;'), 'Must escape HTML quotes');
assert(htmlTable.includes('Pinyin &amp; English'), 'Must escape ampersand');
assert(htmlTable.endsWith('</td></tr></tbody></table>'), 'Table must end with </td></tr></tbody></table>');
console.log('✓ HTML table generator passed!\n');

// 8. Tabular Data Detection
console.log('8. Testing Tabular Data Detection...');
assert.strictEqual(isTabularData('北京\t上海\t广州', false), true, 'Text with tab should be tabular');
assert.strictEqual(isTabularData('北京\n上海\n广州', true), true, 'Google Sheets should always be tabular');
assert.strictEqual(isTabularData('你好世界，欢迎使用插件', false), false, 'Normal text should not be tabular');
assert.strictEqual(isTabularData('第一行\n第二行', false), false, 'Normal multi-line text without tabs should not be tabular');
assert.strictEqual(isTabularData('', false), false, 'Empty text should not be tabular');
console.log('✓ Tabular data detection passed!\n');

// 9. Icons Verification
console.log('9. Verifying extension icons...');
const iconSizes = [16, 32, 48, 128];
for (const size of iconSizes) {
  const iconFile = path.join(__dirname, `../icons/icon${size}.png`);
  assert(fs.existsSync(iconFile), `icon${size}.png must exist`);
  const stat = fs.statSync(iconFile);
  assert(stat.size > 0, `icon${size}.png must not be empty`);
}
console.log('✓ All 4 extension icons (16, 32, 48, 128) verified!\n');

// 10. Erhua (儿化) Phonological Mergers & Lexical Exceptions
console.log('10. Testing Erhua (儿化) Support...');

// 10.1 Syllable merger rules
assert.strictEqual(applyErhua('diǎn', 'phonetic'), 'diǎr', 'Phonetic diǎn -> diǎr');
assert.strictEqual(applyErhua('dian', 'phonetic'), 'diar', 'Phonetic dian -> diar (user requirement)');
assert.strictEqual(applyErhua('dian3', 'phonetic'), 'dia3r', 'Phonetic dian3 -> dia3r');
assert.strictEqual(applyErhua('diǎn', 'standard'), 'diǎnr', 'Standard diǎn -> diǎnr');
assert.strictEqual(applyErhua('dian', 'standard'), 'dianr', 'Standard dian -> dianr');
assert.strictEqual(applyErhua('dian3', 'standard'), 'dian3r', 'Standard dian3 -> dian3r');

assert.strictEqual(applyErhua('wán', 'phonetic'), 'wár', 'Phonetic wán -> wár');
assert.strictEqual(applyErhua('wan2', 'phonetic'), 'wa2r', 'Phonetic wan2 -> wa2r');
assert.strictEqual(applyErhua('wán', 'standard'), 'wánr', 'Standard wán -> wánr');

assert.strictEqual(applyErhua('hái', 'phonetic'), 'hár', 'Phonetic hái -> hár');
assert.strictEqual(applyErhua('hai2', 'phonetic'), 'ha2r', 'Phonetic hai2 -> ha2r');
assert.strictEqual(applyErhua('hái', 'standard'), 'háir', 'Standard hái -> háir');

assert.strictEqual(applyErhua('huā', 'phonetic'), 'huār', 'huā -> huār');
assert.strictEqual(applyErhua('zhè', 'phonetic'), 'zhèr', 'zhè -> zhèr');
assert.strictEqual(applyErhua('ér', 'phonetic'), 'ér', 'ér should not get duplicate r');
console.log('✓ Syllable-level Erhua merger rules passed!');

// 10.2 Full phrase conversion
assert.strictEqual(
  convertWithErhua('一点儿', pinyin, { erhua: 'phonetic', toneType: 'symbol' }),
  'yì diǎr',
  '一点儿 phonetic symbol'
);
assert.strictEqual(
  convertWithErhua('一点儿', pinyin, { erhua: 'phonetic', toneType: 'none' }),
  'yi diar',
  '一点儿 phonetic none (dian + er -> diar)'
);
assert.strictEqual(
  convertWithErhua('一点儿', pinyin, { erhua: 'phonetic', toneType: 'num' }),
  'yi4 dia3r',
  '一点儿 phonetic num'
);
assert.strictEqual(
  convertWithErhua('一点儿', pinyin, { erhua: 'standard', toneType: 'symbol' }),
  'yì diǎnr',
  '一点儿 standard symbol'
);
assert.strictEqual(
  convertWithErhua('一点儿', pinyin, { erhua: 'off', toneType: 'symbol' }),
  'yì diǎn ér',
  '一点儿 off symbol'
);

assert.strictEqual(
  convertWithErhua('好玩儿的花儿', pinyin, { erhua: 'phonetic' }),
  'hǎo wár de huār',
  '好玩儿的花儿 phonetic'
);
assert.strictEqual(
  convertWithErhua('这儿和哪儿', pinyin, { erhua: 'phonetic' }),
  'zhèr hé nǎr',
  '这儿和哪儿'
);
console.log('✓ Full phrase Erhua conversions passed!');

// 10.3 Non-Erhua word exclusions
assert.strictEqual(
  convertWithErhua('婴儿和儿童', pinyin, { erhua: 'phonetic' }),
  'yīng ér hé ér tóng',
  '婴儿和儿童 must not be Erhua'
);
assert.strictEqual(
  convertWithErhua('孤儿在托儿所', pinyin, { erhua: 'phonetic' }),
  'gū ér zài tuō ér suǒ',
  '孤儿在托儿所 must not be Erhua'
);
assert.strictEqual(
  convertWithErhua('奥运健儿和混血儿', pinyin, { erhua: 'phonetic' }),
  'ào yùn jiàn ér hé hùn xuè ér',
  '健儿 and 混血儿 must not be Erhua'
);
console.log('✓ Non-Erhua word exclusions passed!');

// 10.4 2D Matrix conversion with Erhua (Google Sheets support)
const matrixWithErhua = [
  ['一点儿', '婴儿'],
  ['出去玩儿', '花儿']
];
const matrixResult = convertMatrixToPinyin(matrixWithErhua, pinyin, {
  toneType: 'symbol',
  separator: ' ',
  erhua: 'phonetic',
  grouping: 'syllables'
});
assert.strictEqual(matrixResult.matrix[0][0], 'yì diǎr', 'Cell [0][0] 一点儿 -> yì diǎr');
assert.strictEqual(matrixResult.matrix[0][1], 'yīng ér', 'Cell [0][1] 婴儿 -> yīng ér (not Erhua)');
assert.strictEqual(matrixResult.matrix[1][0], 'chū qù wár', 'Cell [1][0] 出去玩儿 -> chū qù wár');
assert.strictEqual(matrixResult.matrix[1][1], 'huār', 'Cell [1][1] 花儿 -> huār');
console.log('✓ Tabular 2D matrix Erhua conversions passed!\n');

// 11. Word-Level Grouping (分词连写)
console.log('11. Testing Word-Level Grouping (分词连写)...');

// 11.1 User explicit test cases
const ex1 = convertWithWordGrouping('洗手间在哪里', pinyin, { grouping: 'words' }, convertWithErhua);
assert.strictEqual(ex1, 'xǐshǒujiān zài nǎlǐ', 'Example 1: 洗手间在哪里 -> xǐshǒujiān zài nǎlǐ');

const ex2 = convertWithWordGrouping('你会说英文吗?', pinyin, { grouping: 'words' }, convertWithErhua);
assert.strictEqual(ex2, 'nǐ huì shuō yīngwén ma?', 'Example 2: 你会说英文吗? -> nǐ huì shuō yīngwén ma?');

const ex3 = convertWithWordGrouping('可以用支付宝吗?', pinyin, { grouping: 'words' }, convertWithErhua);
assert.strictEqual(ex3, 'kěyǐ yòng zhīfùbǎo ma?', 'Example 3: 可以用支付宝吗? -> kěyǐ yòng zhīfùbǎo ma?');
console.log('✓ User primary test examples passed!');

// 11.2 Tone styles with word grouping
assert.strictEqual(
  convertWithWordGrouping('洗手间在哪里', pinyin, { grouping: 'words', toneType: 'none' }, convertWithErhua),
  'xishoujian zai nali',
  'Word grouping with toneType: none'
);
assert.strictEqual(
  convertWithWordGrouping('你会说英文吗?', pinyin, { grouping: 'words', toneType: 'none' }, convertWithErhua),
  'ni hui shuo yingwen ma?',
  'Word grouping with toneType: none'
);
assert.strictEqual(
  convertWithWordGrouping('可以用支付宝吗?', pinyin, { grouping: 'words', toneType: 'none' }, convertWithErhua),
  'keyi yong zhifubao ma?',
  'Word grouping with toneType: none'
);

assert.strictEqual(
  convertWithWordGrouping('洗手间在哪里', pinyin, { grouping: 'words', toneType: 'num' }, convertWithErhua),
  'xi3shou3jian1 zai4 na3li3',
  'Word grouping with toneType: num'
);
console.log('✓ Tone styles with word grouping passed!');

// 11.3 Word grouping with Erhua integration
const erhuaSentence = '今天有一点儿冷，出去玩儿吧！';
const erhuaResult = convertWithWordGrouping(erhuaSentence, pinyin, { grouping: 'words', erhua: 'phonetic' }, convertWithErhua);
assert.strictEqual(erhuaResult, 'jīntiān yǒu yìdiǎr lěng, chūqù wár ba！', 'Word grouping with Erhua phonetic');
console.log('✓ Word grouping with Erhua integration passed!');

// 11.4 Syllables fallback mode
assert.strictEqual(
  convertWithWordGrouping('洗手间在哪里', pinyin, { grouping: 'syllables', separator: ' ' }, convertWithErhua),
  'xǐ shǒu jiān zài nǎ lǐ',
  'Grouping syllables mode separates each character'
);
console.log('✓ Syllable fallback mode passed!');

// 11.5 Matrix conversion with word grouping
const matrixWords = [
  ['洗手间在哪里', '可以用支付宝吗?'],
  ['你会说英文吗?', '今天有一点儿冷']
];
const matrixWordResult = convertMatrixToPinyin(matrixWords, pinyin, {
  grouping: 'words',
  toneType: 'symbol'
});
assert.strictEqual(matrixWordResult.matrix[0][0], 'xǐshǒujiān zài nǎlǐ', 'Matrix [0][0] grouped');
assert.strictEqual(matrixWordResult.matrix[0][1], 'kěyǐ yòng zhīfùbǎo ma?', 'Matrix [0][1] grouped');
assert.strictEqual(matrixWordResult.matrix[1][0], 'nǐ huì shuō yīngwén ma?', 'Matrix [1][0] grouped');
assert.strictEqual(matrixWordResult.matrix[1][1], 'jīntiān yǒu yìdiǎr lěng', 'Matrix [1][1] grouped');
console.log('✓ Tabular 2D matrix with word grouping passed!\n');

// 11.6 Punctuation spacing normalization (ASCII commas, exactly one space after)
assert.strictEqual(
  convertWithWordGrouping('差不多，我们', pinyin, { grouping: 'words' }, convertWithErhua),
  'chàbùduō, wǒmen',
  'Full-width comma becomes ASCII comma with one trailing space'
);
assert.strictEqual(
  convertWithWordGrouping('差不多，我们', pinyin, { grouping: 'syllables', separator: ' ' }, convertWithErhua),
  'chà bù duō, wǒ men',
  'Syllable grouping also uses ASCII commas with one trailing space'
);
assert.strictEqual(
  convertWithWordGrouping('你好，世界！', pinyin, { grouping: 'words' }, convertWithErhua),
  'nǐhǎo, shìjiè！',
  'Full-width comma normalized to ASCII with one trailing space'
);
assert.strictEqual(
  convertWithWordGrouping('你好 , 世界 !', pinyin, { grouping: 'words' }, convertWithErhua),
  'nǐhǎo, shìjiè!',
  'No space before half-width comma and exclamation'
);
assert.strictEqual(
  convertWithWordGrouping('今天，  我很开心。', pinyin, { grouping: 'words' }, convertWithErhua),
  'jīntiān, wǒ hěn kāixīn.',
  'Collapses multiple spaces after a comma to exactly one'
);
assert.strictEqual(
  convertWithWordGrouping('今天，我很开心。', pinyin, { grouping: 'words' }, convertWithErhua),
  'jīntiān, wǒ hěn kāixīn.',
  'Full sentence comma and period formatting'
);
console.log('✓ Punctuation spacing normalization (ASCII commas and periods) passed!');

console.log('🎉 ALL UNIT TESTS PASSED SUCCESSFULLY! 🎉');
