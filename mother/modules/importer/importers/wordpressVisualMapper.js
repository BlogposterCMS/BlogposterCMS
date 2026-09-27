'use strict';

const sanitizeHtml = require('sanitize-html');
const { parseDocument, DomUtils } = require('htmlparser2');

const BLOCK_PATTERN = /<nav\b[\s\S]*?<\/nav>|<(?:figure|picture)\b[\s\S]*?<\/(?:figure|picture)>|<img\b[^>]*>|<(?:a|button)\b[^>]*>[\s\S]*?<\/(?:a|button)>|<(?:h[1-6]|p|blockquote|ul|ol)\b[\s\S]*?<\/(?:h[1-6]|p|blockquote|ul|ol)>/gi;
const BODY_PATTERN = /<body\b[^>]*>([\s\S]*?)<\/body>/i;
const TAG_PATTERN = /<\/?[^>]+>/g;
const CLASS_PATTERN = /\bclass\s*=\s*["']([^"']+)["']/i;
const HREF_PATTERN = /\bhref\s*=\s*["']([^"']+)["']/i;
const SRC_PATTERN = /\bsrc\s*=\s*["']([^"']+)["']/i;
const ALT_PATTERN = /\balt\s*=\s*["']([^"']*)["']/i;
const MAX_WIDGETS = 24;
const SAFE_URL_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);
const WORDPRESS_STYLE_PROPERTIES = new Set(('color background-color border border-color border-radius border-style border-width '
  + 'display font-family font-size font-style font-weight height line-height margin margin-bottom margin-left margin-right '
  + 'margin-top max-height max-width min-height min-width opacity padding padding-bottom padding-left padding-right '
  + 'padding-top text-align text-decoration text-transform width').split(' '));
const WORDPRESS_ALLOWED_TAGS = sanitizeHtml.defaults.allowedTags.concat(['img', 'button', 'picture', 'source']);
const WORDPRESS_ALLOWED_ATTRIBUTES = {
  ...sanitizeHtml.defaults.allowedAttributes,
  '*': ['class', 'id', 'title', 'role', 'data-*', 'aria-*', 'style'],
  a: [...(sanitizeHtml.defaults.allowedAttributes.a || []), 'class', 'rel'],
  button: ['class', 'type', 'disabled', 'name', 'value'],
  img: sanitizeHtml.defaults.allowedAttributes.img,
  source: ['src', 'srcset', 'type', 'media', 'sizes']
};

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function decodeEntities(value = '') {
  // Decode exactly one HTML parsing layer. Nested entity text remains text and
  // cannot become an executable scheme after this value is escaped again.
  const escapedMarkup = String(value).replace(/[<>"']/g, character => `&#${character.charCodeAt(0)};`);
  return DomUtils.textContent(parseDocument(escapedMarkup, { decodeEntities: true }));
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
  if (!raw || raw.startsWith('//')) return fallback;

  const separator = raw.indexOf(':');
  if (separator >= 0) {
    let scheme = '';
    for (let index = 0; index < separator; index += 1) {
      const code = raw.charCodeAt(index);
      const whitespace = code <= 0x20 || code === 0x7f || code === 0xa0
        || code === 0x1680 || (code >= 0x2000 && code <= 0x200a)
        || code === 0x2028 || code === 0x2029 || code === 0x202f
        || code === 0x205f || code === 0x3000 || code === 0xfeff;
      if (!whitespace) scheme += raw[index].toLowerCase();
    }
    const validScheme = scheme.length > 0
      && scheme[0] >= 'a' && scheme[0] <= 'z'
      && Array.from(scheme.slice(1)).every(character => (
        (character >= 'a' && character <= 'z')
        || (character >= '0' && character <= '9')
        || character === '+' || character === '.' || character === '-'
      ));
    if (validScheme && !SAFE_URL_SCHEMES.has(scheme)) return fallback;
  }
  return safeAttribute(raw);
}

function safeInlineStyle(value = '') {
  const declarations = [];
  for (const part of String(value).split(';')) {
    const separator = part.indexOf(':');
    if (separator <= 0) continue;
    const property = part.slice(0, separator).trim().toLowerCase();
    const propertyValue = part.slice(separator + 1).trim();
    const lowerValue = propertyValue.toLowerCase();
    if (!WORDPRESS_STYLE_PROPERTIES.has(property) || !propertyValue || propertyValue.length > 2000) continue;
    if (/[{}<>\\@\u0000-\u001f]/.test(propertyValue)
      || lowerValue.includes('expression') || lowerValue.includes('url(')
      || lowerValue.includes('javascript:') || lowerValue.includes('data:')
      || lowerValue.includes('vbscript:') || lowerValue.includes('file:')
      || lowerValue.includes('blob:')) continue;
    declarations.push(`${property}:${propertyValue}`);
  }
  return declarations.join(';');
}

function safeHtmlFragment(fragment = '') {
  return sanitizeHtml(String(fragment), {
    allowedTags: WORDPRESS_ALLOWED_TAGS,
    allowedAttributes: WORDPRESS_ALLOWED_ATTRIBUTES,
    allowedSchemes: [...SAFE_URL_SCHEMES],
    allowProtocolRelative: false,
    transformTags: {
      '*': (tagName, attributes) => {
        const safe = { ...attributes };
        if (safe.style) {
          safe.style = safeInlineStyle(safe.style);
          if (!safe.style) delete safe.style;
        }
        return { tagName, attribs: safe };
      }
    }
  }).trim();
}

function firstAttr(fragment, pattern, decode = true) {
  const match = String(fragment || '').match(pattern);
  if (!match) return '';
  return (decode ? decodeEntities(match[1]) : match[1]).trim();
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
  const rawSrc = firstAttr(fragment, SRC_PATTERN, false);
  const src = decodeEntities(rawSrc);
  const alt = firstAttr(fragment, ALT_PATTERN);
  const safeSrc = safeUrlAttribute(rawSrc);
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
  const rawHref = firstAttr(fragment, HREF_PATTERN, false) || '#';
  const href = decodeEntities(rawHref);
  const label = stripTags(fragment) || 'Link';
  return {
    widgetId: 'buttonLink',
    code: {
      html: `<a class="bp-wp-import-button editable" href="${safeUrlAttribute(rawHref, '#')}" role="button">${safeAttribute(label)}</a>`,
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
    decodeEntities,
    fragmentMatches,
    safeHtmlFragment,
    safeInlineStyle,
    safeUrlAttribute,
    stripTags
  },
  buildDesignerDraft
};
