'use strict';

const sanitizeHtml = require('sanitize-html');
const { normalizeLayoutTree } = require('../../../ui/shared/layout/layoutDocument.js');
// Node 24 consumes the same DOM-free presentation helpers as browser ESM.
const { sanitizeCss } = require('../../../ui/shared/sanitize/sanitizer.js');
const {
  PUBLIC_CANVAS_STYLE_ID, PUBLIC_CANVAS_CSS, publicCanvasStyle, publicItemStyle
} = require('../../../ui/shared/layout/publicCanvasPresentation.js');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function scriptJson(value) {
  // A script text node is parsed as HTML before JavaScript/JSON is decoded.
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,
    char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

function safeCss(value) {
  return sanitizeCss(String(value || '')).replace(/</g, '\\3c ');
}

function sanitizePublicHtml(value) {
  const sanitized = sanitizeHtml(String(value || ''), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'main', 'header', 'footer',
      'nav', 'section', 'article', 'aside', 'img', 'picture', 'source', 'video', 'audio',
      'track', 'button', 'input', 'select', 'option', 'textarea', 'label', 'form',
      'link', 'style', 'svg', 'g', 'path', 'circle', 'rect', 'line', 'polyline',
      'polygon', 'ellipse', 'defs', 'linearGradient', 'stop', 'use', 'symbol'],
    // Styles are authored page presentation. Scripts are never accepted here;
    // the existing client executeJs/CSP-nonce path owns interactive code.
    allowVulnerableTags: true,
    allowedAttributes: false,
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesAppliedToAttributes: ['href', 'src', 'action', 'formaction', 'poster', 'xlink:href', 'cite', 'background'],
    parseStyleAttributes: false,
    transformTags: {
      '*': (tagName, attribs) => {
        const safe = { ...attribs };
        for (const name of Object.keys(safe)) {
          if (/^on/i.test(name) || /^(nonce|srcdoc)$/i.test(name)) delete safe[name];
        }
        if (/^bp-(?:initial|public-bootstrap)/i.test(safe.id || '')) delete safe.id;
        if (safe.style) safe.style = sanitizeCss(safe.style, true);
        if (tagName === 'link' && safe.rel !== 'stylesheet') return { tagName: 'span', attribs: {} };
        return { tagName, attribs: safe };
      }
    }
  });
  // sanitize-html deliberately skips textFilter for raw style text. Only after
  // its HTML parser has normalized tags/escaped attributes, apply the shared CSS
  // policy to those style bodies, preserving their position in the cascade.
  return sanitized.replace(/(<style(?:\s[^>]*)?>)([\s\S]*?)(<\/style>)/gi,
    (_match, open, css, close) => open + safeCss(css) + close);
}

function styleAttribute(style) {
  return escapeHtml(Object.entries(style).map(([key, value]) => `${key}:${value}`).join(';'));
}

// Only a saved content host makes the body part of a shared layout. Workarea
// selection is transient editor state and must not change public composition.
function hasPageContentHost(tree) {
  if (!tree) return false;
  return tree.isDynamicHost === true || (tree.children || []).some(hasPageContentHost);
}

// Typography follows the article when the client adopts it into a content host.
// Only outer spacing belongs to its temporary first-response position. Zero
// specificity lets authored article/theme rules override these readable defaults.
const INITIAL_ARTICLE_CSS = `
:where(body > #bp-initial-html) {
  box-sizing:border-box;max-width:76rem;margin:0 auto;padding:32px 24px;
}
:where(.bp-page-html) {
  font:16px/1.7 var(--font-body,ui-sans-serif,system-ui,sans-serif);
  overflow-wrap:anywhere;
}
:where(.bp-page-html) :where(h1,h2,h3) {line-height:1.25}
:where(.bp-page-html) :where(p,ul,ol) {margin-block:0 1.25em}
:where(.bp-page-html) :where(li + li) {margin-block-start:.65em}
:where(.bp-page-html) :where(img,video) {max-width:100%;height:auto}
:where(.bp-page-html) :where(pre) {overflow:auto}
:where(.bp-page-html) :where(aside a) {display:block}
`;

/** Resolve only published public facade data; widgets still fetch their own data. */
async function loadPublicPresentation(requestPublic, slug, language) {
  const envelope = await requestPublic('pages', 'envelope', { slug, language });
  if (!envelope || !Array.isArray(envelope.attachments)) {
    throw new Error('PUBLIC_PRESENTATION_ENVELOPE_INVALID: Published page envelope missing.');
  }
  const design = envelope.attachments.find(item => item.type === 'design');
  const htmlAttachment = envelope.attachments.find(item => item.type === 'html');
  const layoutRef = design?.descriptor?.layoutRef;
  let layout = null;
  if (layoutRef) {
    try {
      layout = await requestPublic('designer', 'getLayout', { layoutRef });
    } catch (error) {
      // Preserve the existing HTML fallback when a referenced design is gone.
      console.warn('PUBLIC_PRESENTATION_LAYOUT_FAILED: Using the existing page fallback.', error.message);
    }
  }
  const styles = (design?.descriptor?.css || []).filter(href =>
    typeof href === 'string' && /^\/(?!\/)[^<>"'\s]*$/.test(href)
  ).map(href => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join('');
  const hasLayout = Boolean(layout?.items?.length);
  const inline = htmlAttachment?.descriptor?.inline || {};
  const contentSlot = htmlAttachment?.descriptor?.contentSlot
    && hasPageContentHost(normalizeLayoutTree(layout?.document?.layoutTree));
  // Keep article content in the first HTML response for readers and crawlers.
  // The client adopts this node into the same document's saved content host.
  const renderHtml = Boolean(inline.html) && (contentSlot || design?.descriptor?.requiresContentSlot
    || !(htmlAttachment?.descriptor?.fallbackOnly && hasLayout));
  let head = styles;
  let body = '';
  if (renderHtml) {
    head += `<style id="bp-initial-page-css">${INITIAL_ARTICLE_CSS}${safeCss(inline.css)}</style>`;
    body = `<div id="bp-initial-html" class="bp-page-html">${sanitizePublicHtml(inline.html)}</div>`;
  } else if (hasLayout) {
    head += `<style id="${PUBLIC_CANVAS_STYLE_ID}">${PUBLIC_CANVAS_CSS}</style>`;
    const items = layout.items.map((item, index) =>
      `<div class="canvas-item" data-bp-initial-item="${index}" aria-busy="true" style="${styleAttribute(publicItemStyle(item))}"><div class="widget-placeholder" role="status">Loading</div></div>`
    ).join('');
    body = `<div id="bp-grid" class="bp-public-canvas" data-bp-initial-layout="true" style="${styleAttribute(publicCanvasStyle(layout))}">${items}</div>`;
  }
  // Version 2 references the sanitized DOM already present in this response.
  // Canonical envelopes stay intact for CSR, previews and older clients.
  const bootstrapEnvelope = renderHtml ? {
    ...envelope,
    attachments: envelope.attachments.map(attachment => {
      if (attachment !== htmlAttachment) return attachment;
      const { html: _html, ...remainingInline } = attachment.descriptor.inline;
      return {
        ...attachment,
        descriptor: { ...attachment.descriptor, htmlFromInitialResponse: true, inline: remainingInline }
      };
    })
  } : envelope;
  return {
    head, body,
    bootstrap: {
      version: renderHtml ? 2 : 1, slug, language, envelope: bootstrapEnvelope,
      layout, layoutResolved: true, htmlRendered: renderHtml
    }
  };
}

module.exports = { loadPublicPresentation, escapeHtml, scriptJson, sanitizePublicHtml };
