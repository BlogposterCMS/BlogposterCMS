'use strict';

/** Localized projections retain the canonical entry id, permalink and publication state. */
function localizedContent(entry, language) {
  if (!entry) return null;
  const locale = String(language || entry.language || 'en').toLowerCase();
  const translations = Array.isArray(entry.content?.translations) ? entry.content.translations : [];
  const translation = translations.find(row => String(row?.language || '').toLowerCase() === locale);
  if (!translation) return locale === String(entry.language || 'en').toLowerCase() ? entry : null;
  return { ...entry, language: locale, title: translation.title || entry.title,
    excerpt: translation.metaDesc || translation.meta_desc || '',
    content: { ...entry.content, html: translation.html || '', css: translation.css || '', translations: [translation] } };
}

function contentLocales(entry) {
  const translations = Array.isArray(entry.content?.translations) ? entry.content.translations : [];
  if (translations.length > 64) throw Object.assign(new Error('CONTENT_LOCALES_INVALID: At most 64 translations can be indexed.'), {code:'CONTENT_LOCALES_INVALID'});
  return [...new Set([entry.language || 'en', ...translations.map(row => row?.language).filter(Boolean)]
    .map(language => String(language).toLowerCase()))].map(language => localizedContent(entry, language)).filter(Boolean);
}

module.exports = { localizedContent, contentLocales };
