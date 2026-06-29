'use strict';

const BLOCK_PATTERN = /<nav\b[\s\S]*?<\/nav>|<(?:figure|picture)\b[\s\S]*?<\/(?:figure|picture)>|<img\b[^>]*>|<(?:a|button)\b[^>]*>[\s\S]*?<\/(?:a|button)>|<(?:h[1-6]|p|blockquote|ul|ol)\b[\s\S]*?<\/(?:h[1-6]|p|blockquote|ul|ol)>/gi;
const BODY_PATTERN = /<body\b[^>]*>([\s\S]*?)<\/body>/i;
const TAG_PATTERN = /<\/?[^>]+>/g;
const CLASS_PATTERN = /\bclass\s*=\s*["']([^"']+)["']/i;
const HREF_PATTERN = /\bhref\s*=\s*["']([^"']+)["']/i;
const SRC_PATTERN = /\bsrc\s*=\s*["']([^"']+)["']/i;
const ALT_PATTERN = /\balt\s*=\s*["']([^"']*)["']/i;
const UNSAFE_URL_PATTERN = /^(?:javascript|data|vbscript):/i;
const MAX_WIDGETS = 24;

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function decodeEntities(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value = '') {
  return decodeEntities(String(value).replace(TAG_PATTERN, ' ')).replace(/\s+/g, ' ').trim();
}

function safeAttribute(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch] || ch));
}

function safeUrlAttribute(value = '', fallback = '') {
  const raw = decodeEntities(String(value || '')).trim();
  if (!raw || UNSAFE_URL_PATTERN.test(raw) || raw.startsWith('//')) return fallback;
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^(?:https?:|mailto:|tel:)/i.test(raw)) return fallback;
  return safeAttribute(raw);
}

function safeHtmlFragment(fragment = '') {
  return String(fragment)
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\s+(?:href|src)\s*=\s*(['"])\s*(?:javascript|data|vbscript):[\s\S]*?\1/gi, '')
    .trim();
}

function firstAttr(fragment, pattern) {
  const match = String(fragment || '').match(pattern);
  return match ? decodeEntities(match[1]).trim() : '';
}

function classList(fragment = '') {
  const raw = firstAttr(fragment, CLASS_PATTERN);
  return raw.split(/\s+/).map(item => item.trim().toLowerCase()).filter(Boolean);
}

function extractBody(html = '') {
  const match = String(html || '').match(BODY_PATTERN);
  return match ? match[1] : String(html || '');
}

function fragmentWeight(fragment = '') {
  const text = stripTags(fragment);
  const media = /<img\b|<picture\b|<video\b/i.test(fragment) ? 60 : 0;
  return text.length + media;
}

function isButtonLike(fragment = '') {
  if (/^<button\b/i.test(fragment)) return true;
  const classes = classList(fragment).join(' ');
  return /\b(btn|button|cta|call-to-action|wp-block-button)\b/i.test(classes) || /\brole\s*=\s*["']button["']/i.test(fragment);
}

function isGalleryLike(fragment = '') {
  const classes = classList(fragment).join(' ');
  return /\b(gallery|wp-block-gallery|blocks-gallery|elementor-gallery)\b/i.test(classes);
}

function widgetHeight(widgetId, fragment) {
  const weight = fragmentWeight(fragment);
  if (widgetId === 'navigationMenu') return 7;
  if (widgetId === 'buttonLink') return 8;
  if (widgetId === 'mediaBlock') return clamp(22 + Math.round(weight / 40), 26, 48);
  if (widgetId === 'gallery') return 48;
  if (widgetId === 'htmlBlock') return clamp(24 + Math.round(weight / 80), 30, 70);
  return clamp(12 + Math.round(weight / 70), 14, 36);
}

function widgetWidth(widgetId) {
  if (widgetId === 'buttonLink') return 36;
  if (widgetId === 'navigationMenu') return 92;
  return 90;
}

function widgetX(widgetId) {
  return widgetId === 'buttonLink' ? 5 : 5;
}

function blockCss(kind) {
  return `
.bp-wp-import-${kind} {
  width: 100%;
  min-height: 100%;
  box-sizing: border-box;
}
.bp-wp-import-${kind} img {
  max-width: 100%;
  height: auto;
  display: block;
}
  `.trim();
}

function textWidget(fragment) {
  return {
    widgetId: 'textBox',
    code: {
      html: `<div class="bp-wp-import-text editable" data-text-editable>${safeHtmlFragment(fragment)}</div>`,
      css: blockCss('text'),
      meta: {
        label: 'Imported Text',
        source: 'wordpress-visual-mapper',
        settings: { html: safeHtmlFragment(fragment) }
      }
    }
  };
}

function mediaWidget(fragment) {
  const src = firstAttr(fragment, SRC_PATTERN);
  const alt = firstAttr(fragment, ALT_PATTERN);
  const safeSrc = safeUrlAttribute(src);
  return {
    widgetId: 'mediaBlock',
    code: {
      html: safeSrc
        ? `<figure class="bp-wp-import-media"><img src="${safeSrc}" alt="${safeAttribute(alt)}"></figure>`
        : `<div class="bp-wp-import-media">${safeHtmlFragment(fragment)}</div>`,
      css: blockCss('media'),
      meta: {
        label: 'Imported Media',
        source: 'wordpress-visual-mapper',
        settings: { src, altText: alt }
      }
    }
  };
}

function buttonWidget(fragment) {
  const href = firstAttr(fragment, HREF_PATTERN) || '#';
  const label = stripTags(fragment) || 'Link';
  return {
    widgetId: 'buttonLink',
    code: {
      html: `<a class="bp-wp-import-button editable" href="${safeUrlAttribute(href, '#')}" role="button">${safeAttribute(label)}</a>`,
      css: `
.bp-wp-import-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0.75rem 1.15rem;
  border-radius: 8px;
  text-decoration: none;
}
      `.trim(),
      meta: {
        label: 'Imported Button',
        source: 'wordpress-visual-mapper',
        settings: { label, href }
      }
    }
  };
}

function htmlWidget(fragment, label = 'Imported HTML') {
  return {
    widgetId: 'htmlBlock',
    code: {
      html: `<div class="bp-wp-import-html">${safeHtmlFragment(fragment)}</div>`,
      css: blockCss('html'),
      meta: {
        label,
        source: 'wordpress-visual-mapper',
        fallback: true
      }
    }
  };
}

function nativeHtmlWidget(widgetId, fragment, label) {
  return {
    widgetId,
    code: {
      html: `<div class="bp-wp-import-${widgetId}">${safeHtmlFragment(fragment)}</div>`,
      css: blockCss(widgetId),
      meta: {
        label,
        source: 'wordpress-visual-mapper',
        fallback: true
      }
    }
  };
}

function classifyFragment(fragment) {
  if (!fragment || fragmentWeight(fragment) < 1) return null;
  if (/^<nav\b/i.test(fragment)) return nativeHtmlWidget('navigationMenu', fragment, 'Imported Navigation');
  if (isGalleryLike(fragment)) return nativeHtmlWidget('gallery', fragment, 'Imported Gallery');
  if (/^<(figure|picture)\b/i.test(fragment) || /^<img\b/i.test(fragment)) return mediaWidget(fragment);
  if (/^<(a|button)\b/i.test(fragment)) return isButtonLike(fragment) ? buttonWidget(fragment) : null;
  return textWidget(fragment);
}

function fragmentMatches(html) {
  const body = extractBody(html);
  return Array.from(body.matchAll(BLOCK_PATTERN))
    .map(match => ({ index: match.index || 0, fragment: match[0] }))
    .sort((left, right) => left.index - right.index);
}

function buildWidgetInstance(seed, yPercent, position) {
  const hPercent = widgetHeight(seed.widgetId, seed.code.html);
  return {
    id: `wp-import-${position + 1}`,
    widgetId: seed.widgetId,
    xPercent: widgetX(seed.widgetId),
    yPercent,
    wPercent: widgetWidth(seed.widgetId),
    hPercent,
    zIndex: position + 1,
    behavior: 'scroll',
    elementName: seed.code.meta?.label || seed.widgetId,
    code: seed.code
  };
}

function buildDesignerDraft({ title, slug, normalizedHtml = '', renderedHtml = '', page = {}, styleHints = null, behaviorHints = null } = {}) {
  const sourceHtml = normalizedHtml || renderedHtml || '';
  const fragments = fragmentMatches(sourceHtml);
  const seeds = [];
  const seen = new Set();

  for (const { fragment } of fragments) {
    if (seeds.length >= MAX_WIDGETS) break;
    const clean = safeHtmlFragment(fragment);
    const fingerprint = stripTags(clean).slice(0, 120) || clean.slice(0, 120);
    if (!fingerprint || seen.has(fingerprint)) continue;
    const seed = classifyFragment(clean);
    if (!seed) continue;
    seen.add(fingerprint);
    seeds.push(seed);
  }

  if (!seeds.length && sourceHtml.trim()) {
    seeds.push(htmlWidget(sourceHtml, 'Imported Page HTML'));
  }

  let y = 4;
  const widgets = seeds.map((seed, index) => {
    const item = buildWidgetInstance(seed, y, index);
    y += item.hPercent + 3;
    return item;
  });

  const nativeWidgets = widgets.filter(widget => widget.widgetId !== 'htmlBlock').length;
  const fallbackWidgets = widgets.length - nativeWidgets;

  return {
    version: 1,
    source: 'wordpress-visual-mapper',
    strategy: 'neutralized-html-to-designer-widgets',
    title: title || page.title || slug || 'Imported WordPress Page',
    slug: slug || page.slug || '',
    summary: {
      widgets: widgets.length,
      nativeWidgets,
      fallbackWidgets,
      confidence: widgets.length
        ? Number((nativeWidgets / widgets.length).toFixed(2))
        : 0
    },
    styleHints: styleHints && typeof styleHints === 'object'
      ? {
        source: styleHints.source || 'wordpress-style-hints',
        tokens: styleHints.tokens || {}
      }
      : null,
    behaviorHints: behaviorHints && typeof behaviorHints === 'object'
      ? {
        source: behaviorHints.source || 'wordpress-behavior-hints',
        summary: behaviorHints.summary || {},
        behaviors: Array.isArray(behaviorHints.behaviors) ? behaviorHints.behaviors : []
      }
      : null,
    widgets
  };
}

module.exports = {
  _internals: {
    classifyFragment,
    fragmentMatches,
    safeUrlAttribute,
    stripTags
  },
  buildDesignerDraft
};
