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

function isDevelopmentHtmlInjectionEnabled() {
  return process.env.APP_ENV !== 'production' &&
    process.env.NODE_ENV !== 'production' &&
    process.env.NODE_ENV !== 'test';
}

function injectScriptBeforeBody(html, scriptTag) {
  if (html.includes(scriptTag)) return html;
  if (html.includes('</body>')) {
    return html.replace('</body>', `${scriptTag}</body>`);
  }
  return `${html}${scriptTag}`;
}

function injectDevBanner(html) {
  if (!isDevelopmentHtmlInjectionEnabled()) return html;
  return injectScriptBeforeBody(
    html,
    '<script type="module" src="/build/devBanner.js"></script>'
  );
}

function injectDevReload(html) {
  if (!isDevelopmentHtmlInjectionEnabled()) return html;
  return injectScriptBeforeBody(
    html,
    '<script type="module" src="/build/devReload.js"></script>'
  );
}

module.exports = {
  escapeHtml,
  injectDevBanner,
  injectDevReload,
  isDevelopmentHtmlInjectionEnabled,
  sanitizeSlug
};
