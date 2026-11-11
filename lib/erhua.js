/**
 * Chinese Pinyin Copier - Erhua (儿化) Phonological & Lexical Helper
 *
 * Provides phonological transformation rules and lexical exception detection
 * for Chinese Erhua (儿化音) syllables.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ErhuaHelper = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  /**
   * Curated list of non-Erhua compound words ending with '儿'.
   * In these words, '儿' represents an independent noun morpheme (infant/child/individual)
   * pronounced as a separate syllable 'ér', NOT an Erhua suffix.
   */
  const NON_ERHUA_WORDS = [
    '婴儿', '幼儿', '孤儿', '健儿', '胎儿', '宠儿', '混血儿', '新生儿',
    '早产儿', '脑瘫儿', '畸形儿', '聋哑儿', '超常儿', '弱智儿', '低能儿',
    '弃儿', '寄儿', '托儿所', '男儿', '女儿', '义儿', '私生儿', '适龄儿'
  ];

  /**
   * Characters that commonly follow '儿' in non-Erhua words starting with '儿'
   * (e.g. 儿童, 儿子, 儿女, 儿媳, 儿戏, 儿歌, 儿孙)
   */
  const INITIAL_ER_FOLLOWERS = ['童', '子', '女', '媳', '戏', '歌', '孙', '语', '科', '男'];

  /**
   * Applies Erhua sound merger to a single Pinyin syllable.
   *
   * @param {string} syllable - Base syllable (e.g. 'diǎn', 'dian3', 'dian', 'huā', 'hái')
   * @param {'phonetic'|'standard'|'off'} [mode='phonetic'] - Erhua mode
   * @returns {string} Merged syllable (e.g. 'diǎr', 'dia3r', 'diar', 'huār', 'hár')
   */
  function applyErhua(syllable, mode) {
    if (!syllable || mode === 'off') {
      return syllable;
    }

    const currentMode = mode || 'phonetic';

    // 1. Numeric tone format (e.g., 'dian3', 'wan2', 'hai2', 'hua1')
    const numMatch = syllable.match(/^([a-zǖü]+)([1-5]?)$/i);
    if (numMatch) {
      let [, base, tone] = numMatch;
      if (currentMode === 'phonetic') {
        // Drop nasal coda -n (e.g. dian -> dia, wan -> wa, men -> me)
        if (base.endsWith('n') && !base.endsWith('ng')) {
          base = base.slice(0, -1);
        } else if (/[aeo]i$/i.test(base)) {
          // Drop diphthong offglide -i (e.g. hai -> ha, pai -> pa, gai -> ga, kuai -> kua)
          base = base.slice(0, -1);
        }
      }
      return base + (tone || '') + 'r';
    }

    // 2. Symbol tone or tone-less format (e.g. 'diǎn', 'wán', 'hái', 'dian', 'wan')
    if (currentMode === 'phonetic') {
      // Drop nasal coda -n
      if (syllable.endsWith('n') && !syllable.endsWith('ng')) {
        return syllable.slice(0, -1) + 'r';
      }
      // Drop diphthong offglide -i
      if (/[aāáǎàeēéěèoōóǒò]i$/i.test(syllable)) {
        return syllable.slice(0, -1) + 'r';
      }
    }

    // Avoid duplicate 'r' if already present
    return syllable.endsWith('r') ? syllable : syllable + 'r';
  }

  /**
   * Converts Chinese text to Pinyin with Erhua (儿化) support.
   *
   * @param {string} text - Chinese text input
   * @param {Function} pinyinFn - Pinyin conversion function from pinyin-pro
   * @param {object} [options={}] - Conversion options
   * @param {'symbol'|'num'|'none'} [options.toneType='symbol']
   * @param {string} [options.separator=' ']
   * @param {boolean} [options.toneSandhi=true]
   * @param {'phonetic'|'standard'|'off'} [options.erhua='phonetic']
   * @returns {string} Formatted pinyin string
   */
  function convertWithErhua(text, pinyinFn, options) {
    if (!text || typeof text !== 'string') return '';
    if (typeof pinyinFn !== 'function') return text;

    const opts = options || {};
    const erhuaMode = opts.erhua || 'phonetic';
    const toneType = opts.toneType || 'symbol';
    const separator = opts.separator !== undefined ? opts.separator : ' ';
    const toneSandhi = opts.toneSandhi !== undefined ? opts.toneSandhi : true;

    // If Erhua processing is disabled, use standard pinyin-pro output
    if (erhuaMode === 'off') {
      return normalizeCommaSpacing(pinyinFn(text, {
        toneType,
        separator,
        toneSandhi,
        nonZh: 'consecutive'
      }));
    }

    // Retrieve per-character tokenized metadata
    const tokens = pinyinFn(text, {
      toneType,
      toneSandhi,
      type: 'all'
    });

    if (!Array.isArray(tokens) || tokens.length === 0) {
      return '';
    }

    // Identify non-Erhua word boundaries in source text
    const nonErhuaIndices = new Set();
    for (const word of NON_ERHUA_WORDS) {
      let pos = text.indexOf(word);
      while (pos !== -1) {
        for (let i = pos; i < pos + word.length; i++) {
          nonErhuaIndices.add(i);
        }
        pos = text.indexOf(word, pos + 1);
      }
    }

    // Merge Erhua '儿' tokens into preceding Chinese syllable
    const mergedTokens = [];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];

      const isErhuaSuffix =
        token.origin === '儿' &&
        i > 0 &&
        tokens[i - 1].isZh &&
        !nonErhuaIndices.has(i) &&
        !(i + 1 < tokens.length && INITIAL_ER_FOLLOWERS.includes(tokens[i + 1].origin));

      if (isErhuaSuffix && mergedTokens.length > 0) {
        const prev = mergedTokens[mergedTokens.length - 1];
        prev.pinyin = applyErhua(prev.pinyin, erhuaMode);
        prev.result = applyErhua(prev.result, erhuaMode);
        prev.origin = prev.origin + '儿';
      } else {
        mergedTokens.push({ ...token });
      }
    }

    // Join merged tokens with user's delimiter preference
    let result = '';
    for (let i = 0; i < mergedTokens.length; i++) {
      const cur = mergedTokens[i];
      const val = cur.isZh ? cur.result : cur.origin;

      if (i === 0) {
        result += val;
        continue;
      }

      const prev = mergedTokens[i - 1];
      const isClosingPunct = /^[,.:;?!，。、：；？！）》”’\]\}]/.test(val);
      if (isClosingPunct) {
        // Punctuation attaches directly without preceding separator/space
        result += val;
      } else if (prev.isZh && cur.isZh) {
        result += separator + val;
      } else if (prev.isZh && !cur.isZh) {
        result += (separator ? ' ' : '') + val;
      } else if (!prev.isZh && cur.isZh) {
        result += (separator ? ' ' : '') + val;
      } else {
        result += val;
      }
    }

    return normalizeCommaSpacing(result);
  }

  /**
   * Normalizes comma output:
   * - Converts full-width commas to ASCII commas and full-width periods to ASCII periods.
   * - Removes spaces before punctuation.
   * - Ensures exactly one space after commas when followed by a word.
   *
   * @param {string} str - Converted pinyin string
   * @returns {string} Normalized string
   */
  function normalizeCommaSpacing(str) {
    if (!str) return str;
    return str
      .replace(/，/g, ',')
      .replace(/。/g, '.')
      .replace(/[ \t]+([,.:;?!。、：；？！）》”’\]\}])/g, '$1')
      .replace(/,[ \t]*(?=[^\s,.:;?!。、：；？！）》”’\]\}])/g, ', ');
  }

  return {
    NON_ERHUA_WORDS,
    INITIAL_ER_FOLLOWERS,
    applyErhua,
    convertWithErhua
  };
});
