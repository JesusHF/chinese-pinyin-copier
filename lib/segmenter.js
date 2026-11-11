/**
 * Chinese Pinyin Copier - Word Grouping & Segmentation Engine
 *
 * Implements standard Chinese orthographic word segmentation (分词连写),
 * joining characters within a lexical word without spaces (e.g. 洗手间 -> xǐshǒujiān)
 * and delimiting distinct words with spaces (e.g. 洗手间在哪里 -> xǐshǒujiān zài nǎlǐ).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.WordGroupingHelper = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : this), function () {
  'use strict';

  /**
   * Common multi-character proper nouns, brands, and technical terms
   * that should be preserved as single lexical words.
   */
  const CUSTOM_WORDS = [
    '支付宝', '微信支付', '双十一', '拼多多', '小红书', '哔哩哔哩',
    '中关村', '天安门', '紫禁城', '兵马俑', '高铁站', '飞机场'
  ];

  /**
   * Modal and auxiliary verbs that should be split from the following main verb
   * (e.g. 会说 -> 会 + 说, 想去 -> 想 + 去, 能来 -> 能 + 来)
   */
  const MODAL_VERBS = new Set(['会', '能', '想', '要', '得', '敢', '肯']);

  /**
   * Punctuation regex for clean formatting
   */
  const CLOSING_PUNCT = /^[.,?!:;?!，。？！；：）》”’\]\}]/;
  const OPENING_PUNCT = /^[（《“‘\[\{]/;

  /**
   * Cleans punctuation spacing:
   * - Eliminates spaces before commas and other closing punctuation.
   * - Ensures a trailing space after punctuation if directly followed by word characters.
   *
   * @param {string} str - Raw converted string
   * @returns {string} Cleaned string
   */
  function cleanPunctuationSpacing(str) {
    if (!str) return str;
    return str
      .replace(/[ \t]+([,.:;?!，。、：；？！）》”’\]\}])/g, '$1')
      .replace(/([（《“‘\[\{])[ \t]+/g, '$1')
      .replace(/([,.:;?!，。、：；？！])([^\s,.:;?!，。、：；？！）》”’\]\}])/g, '$1 $2');
  }

  /**
   * Segments Chinese text into lexical words using Intl.Segmenter with
   * custom brand dictionary and modal verb rules.
   *
   * @param {string} text - Source text
   * @returns {string[]} Array of word segments
   */
  function segmentChineseWords(text) {
    if (!text || typeof text !== 'string') return [];

    if (typeof Intl === 'undefined' || !Intl.Segmenter) {
      // Fallback: character-by-character segmentation
      return Array.from(text);
    }

    const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
    const rawSegments = Array.from(segmenter.segment(text)).map(s => s.segment);
    const segments = [];

    for (let i = 0; i < rawSegments.length; i++) {
      // 1. Check custom words
      let matchedCustom = false;
      const currentOffset = rawSegments.slice(0, i).join('').length;
      for (const cw of CUSTOM_WORDS) {
        if (text.startsWith(cw, currentOffset)) {
          let combined = '';
          let count = 0;
          while (i + count < rawSegments.length && combined.length < cw.length) {
            combined += rawSegments[i + count];
            count++;
          }
          if (combined === cw) {
            segments.push(cw);
            i += count - 1;
            matchedCustom = true;
            break;
          }
        }
      }
      if (matchedCustom) continue;

      // 2. Check '有一' followed by '点儿' (有 + 一点儿)
      if (rawSegments[i] === '有一' && i + 1 < rawSegments.length && rawSegments[i + 1] === '点儿') {
        segments.push('有');
        segments.push('一点儿');
        i++;
        continue;
      }

      // 3. Re-combine Erhua '儿' if split
      if (rawSegments[i] === '儿' && segments.length > 0 && /[\u4e00-\u9fa5]/u.test(segments[segments.length - 1])) {
        const prev = segments[segments.length - 1];
        const combined = prev + '儿';
        if (!['婴儿', '孤儿', '健儿', '胎儿', '幼儿', '宠儿', '女儿'].includes(combined)) {
          segments[segments.length - 1] = combined;
          continue;
        }
      }

      // 4. Split modal verb + action verb (e.g. 会说 -> 会 + 说)
      const seg = rawSegments[i];
      if (seg.length > 1 && MODAL_VERBS.has(seg[0]) && /[\u4e00-\u9fa5]/u.test(seg[1])) {
        segments.push(seg[0]);
        segments.push(seg.slice(1));
        continue;
      }

      segments.push(seg);
    }

    return segments;
  }

  /**
   * Converts Chinese text to Pinyin with word grouping.
   *
   * @param {string} text - Chinese text
   * @param {Function} pinyinFn - Pinyin conversion function from pinyin-pro
   * @param {object} [options={}] - Options
   * @param {Function} [convertWithErhuaFn] - Erhua conversion function
   * @returns {string} Pinyin string with words grouped together
   */
  function convertWithWordGrouping(text, pinyinFn, options, convertWithErhuaFn) {
    if (!text || typeof text !== 'string') return '';
    if (typeof pinyinFn !== 'function') return text;

    const opts = options || {};
    const grouping = opts.grouping || 'words';

    // If grouping is set to individual syllables, use standard/erhua conversion directly
    if (grouping === 'syllables') {
      let raw = '';
      if (typeof convertWithErhuaFn === 'function') {
        raw = convertWithErhuaFn(text, pinyinFn, opts);
      } else {
        raw = pinyinFn(text, {
          toneType: opts.toneType || 'symbol',
          separator: opts.separator !== undefined ? opts.separator : ' ',
          toneSandhi: opts.toneSandhi !== undefined ? opts.toneSandhi : true,
          nonZh: 'consecutive'
        });
      }
      return cleanPunctuationSpacing(raw);
    }

    // Segment into lexical words
    const segments = segmentChineseWords(text);
    let result = '';

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      let converted = '';

      if (/[\u4e00-\u9fa5]/u.test(seg)) {
        // Convert word with syllables joined continuously
        if (typeof convertWithErhuaFn === 'function') {
          converted = convertWithErhuaFn(seg, pinyinFn, {
            ...opts,
            separator: ''
          });
        } else {
          converted = pinyinFn(seg, {
            toneType: opts.toneType || 'symbol',
            separator: '',
            toneSandhi: opts.toneSandhi !== undefined ? opts.toneSandhi : true,
            nonZh: 'consecutive'
          });
        }
      } else {
        converted = seg;
      }

      if (i === 0) {
        result += converted;
        continue;
      }

      const prev = segments[i - 1];
      const prevIsZh = /[\u4e00-\u9fa5]/u.test(prev);
      const curIsZh = /[\u4e00-\u9fa5]/u.test(seg);

      if (CLOSING_PUNCT.test(converted)) {
        // Closing punctuation attaches directly to preceding word (no space before comma, etc.)
        result = result.replace(/[ \t]+$/, '') + converted;
      } else if (OPENING_PUNCT.test(prev)) {
        // Opening punctuation attaches directly to following word
        result += converted;
      } else if (prevIsZh && curIsZh) {
        // Word boundary between Chinese words: insert space
        result += ' ' + converted;
      } else if (prevIsZh && !curIsZh) {
        // Chinese word followed by non-Chinese (e.g. English word)
        if (/^\s/.test(converted)) {
          result += converted;
        } else {
          result += ' ' + converted;
        }
      } else if (!prevIsZh && curIsZh) {
        // Non-Chinese word followed by Chinese word
        if (/\s$/.test(prev)) {
          result += converted;
        } else {
          result += ' ' + converted;
        }
      } else {
        result += converted;
      }
    }

    return cleanPunctuationSpacing(result);
  }

  return {
    CUSTOM_WORDS,
    MODAL_VERBS,
    cleanPunctuationSpacing,
    segmentChineseWords,
    convertWithWordGrouping
  };
});
