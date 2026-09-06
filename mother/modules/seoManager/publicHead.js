'use strict';

function escapeAttribute(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function absolutePublicUrl(value, baseUrl) {
  const raw = String(value || '').trim();
  if (!raw || /[\s\\\x00-\x1f\x7f]/.test(raw) || raw.startsWith('//')
      || !(/^(?:https?:\/\/|\/)/i.test(raw))) return '';
  try {
    const url = new URL(raw, baseUrl);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

/** Serialize resolved metadata into the initial head; crawlers need no JS. */
function renderPublicSeoHead(meta = {}, { baseUrl, pathname = '/' } = {}) {
  const canonical = absolutePublicUrl(meta.canonicalUrl, baseUrl) || absolutePublicUrl(pathname, baseUrl);
  const image = absolutePublicUrl(meta.seoImage, baseUrl);
  const tags = [];
  const add = (attribute, key, value) => {
    if (value) tags.push(`<meta ${attribute}="${key}" content="${escapeAttribute(value)}">`);
  };
  add('name', 'description', meta.seoDesc);
  add('name', 'keywords', meta.seoKeywords);
  add('name', 'robots', meta.robots);
  add('property', 'og:type', 'website');
  add('property', 'og:title', meta.seoTitle);
  add('property', 'og:description', meta.seoDesc);
  add('property', 'og:url', canonical);
  add('property', 'og:image', image);
  add('name', 'twitter:card', image ? 'summary_large_image' : 'summary');
  add('name', 'twitter:title', meta.seoTitle);
  add('name', 'twitter:description', meta.seoDesc);
  add('name', 'twitter:image', image);
  if (canonical) tags.push(`<link rel="canonical" href="${escapeAttribute(canonical)}">`);
  return tags.join('\n');
}

module.exports = { renderPublicSeoHead, absolutePublicUrl };
