/**
 * Chinese Pinyin Copier - Polyphonic Disambiguation Helper
 *
 * Dedicated handling for the character 了, which has three readings:
 *
 *   1. le   (neutral tone) - the by far most common reading.
 *      a) Dynamic/aspect particle (动态助词) after a verb, marking a completed
 *         action: 吃了饭 chī le fàn, 买了一本书 mǎi le yì běn shū, 看了看 kàn le kàn.
 *      b) Sentence-final modal particle (语气助词) marking a new situation or
 *         change of state: 他来了 tā lái le, 下雨了 xià yǔ le, 天亮了 tiān liàng le,
 *         好了 hǎo le, 算了 suàn le, 罢了 bà le, 得了 dé le ("all right").
 *      c) Fixed function words: 为了 wèi le, 除了 chú le, 对了 duì le, 没了 méi le,
 *         有了 yǒu le, 够了 gòu le.
 *
 *   2. liǎo (3rd tone) - a full lexical verb / result complement.
 *      a) "to finish, to end": 了解 liǎojiě, 了结 liǎojié, 了断 liǎoduàn,
 *         了却 liǎoquè, 了事 liǎoshì, 一了百了 yī liǎo bǎi liǎo,
 *         不了了之 bù liǎo liǎo zhī, 直截了当 zhí jié liǎo dàng.
 *      b) "to understand, to know clearly": 一目了然 yī mù liǎo rán,
 *         了如指掌 liǎo rú zhǐ zhǎng, 知了 zhī liǎo (cicada), 了然 liǎorán.
 *      c) Potential-result complement V得/不了 ("can / cannot manage to"):
 *         受不了 shòu bu liǎo, 去不了 qù bu liǎo, 办得了 bàn de liǎo,
 *         大不了 dà bu liǎo, 少不了 shǎo bu liǎo, 不得了 bù dé liǎo.
 *
 *   3. liào (4th tone) - only in 了望 (variant of 瞭望, "to look into the
 *      distance"): 了望台 liào wàng tái, 了望哨 liào wàng shào.
 *
 * Strategy
 * --------
 * pinyin-pro already resolves 了 correctly when it sees the WHOLE sentence,
 * but it defaults an isolated 了 to liǎo.  The extension's word-grouping
 * engine used to convert each segmented word on its own, which stripped that
 * context and produced the "liǎo instead of le" regression.  This module
 * provides:
 *   - pinyinWithPolyphony(): one context-aware entry point used by every
 *     conversion path, so the full text is always available to the engine.
 *   - classifyLe(): explicit, documented rules that override the handful of
 *     cases pinyin-pro still gets wrong (V得了, 了望, isolated 了).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PolyphonicHelper = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  const HAN_REGEX = /[\u4e00-\u9fa5\u3400-\u4dbf\uf900-\ufaff]/u;

  /** Words in which 了 is the lexical verb read as liǎo (3rd tone). */
  const LIAO_LEXICON = [
    // "finish / end"
    '了解', '了结', '了断', '了却', '了事', '了悟', '了了', '了当', '了得',
    '未了', '终了', '末了', '公了', '私了', '不了', '了不得',
    '不了了之', '一了百了', '一走了之', '一笑了之', '没完没了',
    '直截了当', '千了百当', '花事了',
    // "understand / know clearly"
    '了然', '了如指掌', '了若指掌', '一目了然', '知了',
    '了无', '了然无闻', '了不可见', '了不长进', '了身达命'
  ];

  /** Fixed words in which 了 is the neutral particle le. */
  const LE_LEXICON = [
    '为了', '除了', '罢了', '算了', '行了', '得了', '好了', '完了',
    '对了', '没了', '有了', '够了'
  ];

  /** Question / modal particles that force the preceding 了 to be le. */
  const MODAL_PARTICLES = new Set(['吗', '呢', '吧', '啊', '嘛', '呀']);

  /** Human-readable rule table (also exported for documentation/tests). */
  const LE_RULES = [
    { reading: 'liào', rule: '了 + 望 (瞭望 variant)', examples: ['了望台', '了望哨'] },
    { reading: 'liǎo', rule: 'Lexical verb "finish / understand"', examples: ['了解', '直截了当', '一目了然'] },
    { reading: 'liǎo', rule: 'Potential complement 不 + 了', examples: ['受不了', '去不了', '大不了'] },
    { reading: 'liǎo', rule: 'Potential complement V + 得 + 了', examples: ['办得了', '吃得了', '去得了'] },
    { reading: 'le', rule: 'Fixed function word', examples: ['为了', '除了', '算了', '罢了'] },
    { reading: 'le', rule: 'Aspect / sentence-final particle', examples: ['我吃了饭', '他来了', '下雨了'] },
    { reading: 'le', rule: 'Isolated 了 (no lexical cue)', examples: ['了', '了。', '了吗'] }
  ];

  /** Renderings of each reading for every toneType supported by pinyin-pro. */
  const READING_FORMS = {
    symbol: { le: 'le', liǎo: 'liǎo', liào: 'liào' },
    num: { le: 'le0', liǎo: 'liao3', liào: 'liao4' },
    none: { le: 'le', liǎo: 'liao', liào: 'liao' }
  };

  const READING_TONE_NUM = { le: 0, liǎo: 3, liào: 4 };

  function isHan(ch) {
    return typeof ch === 'string' && HAN_REGEX.test(ch);
  }

  /** True when `index` falls inside an occurrence of any word in `words`. */
  function matchesLexicon(text, index, words) {
    for (const word of words) {
      let pos = text.indexOf(word);
      while (pos !== -1) {
        if (index >= pos && index < pos + word.length) return true;
        pos = text.indexOf(word, pos + 1);
      }
    }
    return false;
  }

  /**
   * Classifies a single 了 character.
   *
   * @param {string} text - full text being converted (essential for context)
   * @param {number} index - offset of the 了 inside `text`
   * @returns {'le'|'liǎo'|'liào'|null} null means "defer to pinyin-pro"
   */
  function classifyLe(text, index) {
    if (typeof text !== 'string' || text[index] !== '了') return null;

    const prev = text[index - 1];
    const next = text[index + 1];

    // Rule 1: 了望 is the older spelling of 瞭望 -> liào (4th tone).
    if (next === '望') return 'liào';

    // Rule 2: curated lexical compounds -> liǎo (3rd tone).
    if (matchesLexicon(text, index, LIAO_LEXICON)) return 'liǎo';

    // Rule 3: result complement after 不 (受不了, 去不了, 大不了, 不得了 ...).
    if (prev === '不') return 'liǎo';

    // Rule 4: result complement after 得 (V得了).  A stand-alone "得了"
    // meaning "all right / that's enough" is le instead.
    if (prev === '得' && isHan(text[index - 2])) return 'liǎo';

    // Rule 5: fixed function words -> le.
    if (matchesLexicon(text, index, LE_LEXICON)) return 'le';

    // Rule 6: 了 at the start of an utterance followed by a modal particle
    // (了吗, 了吧, 了呢 ...) is the sentence particle le.
    if (!isHan(prev) && MODAL_PARTICLES.has(next)) return 'le';

    // Rule 7: when 了 is the only Chinese character in the input there is no
    // lexical evidence for liǎo, so use the overwhelmingly common particle le.
    let hanCount = 0;
    for (const ch of text) {
      if (isHan(ch)) hanCount++;
    }
    if (hanCount === 1) return 'le';

    // Otherwise pinyin-pro's full-sentence reading is authoritative.
    return null;
  }

  /**
   * Applies the 了 rules to pinyin-pro's per-character tokens.
   * Token positions are aligned by their `origin` field, which pinyin-pro
   * guarantees to reconstruct the input text exactly.
   *
   * @param {string} text
   * @param {object[]} tokens - output of pinyinFn(text, { type: 'all' })
   * @param {object} [options]
   * @returns {object[]} the same token array, corrected in place
   */
  function correctPolyphonicTokens(text, tokens, options) {
    if (!Array.isArray(tokens)) return tokens;
    const toneType = (options && options.toneType) || 'symbol';
    const forms = READING_FORMS[toneType] || READING_FORMS.symbol;

    let offset = 0;
    for (const token of tokens) {
      const origin = typeof token.origin === 'string' ? token.origin : '';
      const start = offset;
      offset += origin.length;

      if (origin !== '了') continue;
      const reading = classifyLe(text, start);
      if (!reading || !forms[reading]) continue;

      token.pinyin = forms[reading];
      token.result = forms[reading];
      token.num = READING_TONE_NUM[reading];
      if (Array.isArray(token.polyphonic) && token.polyphonic.length === 0) {
        token.polyphonic = [forms[reading]];
      }
    }
    return tokens;
  }

  /**
   * Context-aware replacement for pinyinPro.pinyin().
   *
   * Always asks pinyin-pro for the whole text in one call (so polyphonic
   * disambiguation and tone sandhi see the full sentence), then applies the
   * explicit 了 rules before formatting the requested output type.
   *
   * @param {string} text
   * @param {Function} pinyinFn - pinyin-pro's pinyin function
   * @param {object} [options] - standard pinyin-pro options
   * @returns {string|string[]|object[]}
   */
  function pinyinWithPolyphony(text, pinyinFn, options) {
    const opts = options || {};
    const type = opts.type === 'array' || opts.type === 'all' ? opts.type : 'string';

    if (typeof text !== 'string' || text.length === 0 || typeof pinyinFn !== 'function') {
      return type === 'all' ? [] : (type === 'array' ? [] : '');
    }

    // For exotic output modes, defer to pinyin-pro unchanged.
    if ((opts.pattern && opts.pattern !== 'pinyin') || opts.removeNonZh === true || opts.nonZh === 'removed') {
      return pinyinFn(text, opts);
    }

    // Unwrap an already polyphony-aware function to avoid redundant work.
    const rawFn = (typeof pinyinFn.__rawPinyinFn === 'function') ? pinyinFn.__rawPinyinFn : pinyinFn;

    let tokens;
    try {
      tokens = rawFn(text, { ...opts, type: 'all', nonZh: opts.nonZh || 'consecutive' });
    } catch (err) {
      return rawFn(text, opts);
    }

    if (!Array.isArray(tokens)) {
      return rawFn(text, opts);
    }

    correctPolyphonicTokens(text, tokens, { toneType: opts.toneType || 'symbol' });

    if (type === 'all') return tokens;

    const separator = opts.separator !== undefined ? opts.separator : ' ';
    const values = tokens.map((token) => {
      if (token.isZh) {
        return token.result !== undefined ? token.result : token.pinyin;
      }
      return typeof token.origin === 'string' ? token.origin : '';
    });

    return type === 'array' ? values : values.join(separator);
  }

  /**
   * Wraps a raw pinyin-pro function so every caller gets context-aware output.
   */
  function createContextAwarePinyin(pinyinFn) {
    if (typeof pinyinFn !== 'function') return pinyinFn;
    if (typeof pinyinFn.__rawPinyinFn === 'function') return pinyinFn;
    const wrapped = function (text, options) {
      return pinyinWithPolyphony(text, pinyinFn, options);
    };
    wrapped.__rawPinyinFn = pinyinFn;
    return wrapped;
  }

  /** Loads this module from either the service worker globals or Node. */
  function getPolyphonicHelper() {
    if (typeof PolyphonicHelper !== 'undefined' && PolyphonicHelper) return PolyphonicHelper;
    if (typeof require === 'function') {
      try {
        return require('./polyphonic.js');
      } catch (err) {
        return null;
      }
    }
    return null;
  }

  return {
    LE_RULES,
    LIAO_LEXICON,
    LE_LEXICON,
    READING_FORMS,
    classifyLe,
    correctPolyphonicTokens,
    pinyinWithPolyphony,
    createContextAwarePinyin,
    getPolyphonicHelper
  };
});
