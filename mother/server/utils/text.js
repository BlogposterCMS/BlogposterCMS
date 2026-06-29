'use strict';

function sanitizeSlug(str) {
  const cleaned = String(str)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('/')
    .map(seg => seg.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('/');
  return cleaned.substring(0, 96);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function injectDevBanner(html) {
  if (process.env.NODE_ENV !== 'production') {
    return html.replace(
      '</body>',
      '<script type="module" src="/build/devBanner.js"></script></body>'
    );
  }
  return html;
}

module.exports = {
  escapeHtml,
  injectDevBanner,
  sanitizeSlug
};
