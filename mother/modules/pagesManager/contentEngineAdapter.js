'use strict';

const OPTIONAL_EMIT_TIMEOUT_MS = 1000;

function once(originalCb) {
  let fired = false;
  return (...args) => {
    if (fired) return;
    fired = true;
    if (typeof originalCb === 'function') originalCb(...args);
  };
}

function emitOptional(motherEmitter, eventName, payload) {
  return new Promise(resolve => {
    let settled = false;
    let timer = null;
    const finish = value => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(value);
    };

    if (typeof motherEmitter.listenerCount === 'function' && motherEmitter.listenerCount(eventName) === 0) {
      return finish({ skipped: true });
    }

    timer = setTimeout(() => finish({ skipped: true, reason: 'timeout' }), OPTIONAL_EMIT_TIMEOUT_MS);

    let emitted = false;
    try {
      emitted = motherEmitter.emit(eventName, payload, once((err, result) => {
        finish({ err: err || null, result });
      }));
    } catch (err) {
      return finish({ err });
    }

    if (!emitted) {
      finish({ skipped: true });
    }
  });
}

function firstDefined(...values) {
  for (const value of values) {
    if (typeof value !== 'undefined' && value !== null) return value;
  }
  return undefined;
}

function hasContentEngineMirrorListeners(motherEmitter) {
  if (!motherEmitter || typeof motherEmitter.listenerCount !== 'function') return true;
  return ['getContentEntryBySource', 'createContentEntry', 'updateContentEntry']
    .some(eventName => motherEmitter.listenerCount(eventName) > 0);
}

function hasContentEngineTrashListeners(motherEmitter) {
  if (!motherEmitter || typeof motherEmitter.listenerCount !== 'function') return true;
  return ['getContentEntryBySource', 'trashContentEntry']
    .some(eventName => motherEmitter.listenerCount(eventName) > 0);
}

function normalizeMeta(meta) {
  if (!meta) return {};
  if (typeof meta === 'string') {
    try {
      return JSON.parse(meta) || {};
    } catch {
      return {};
    }
  }
  return typeof meta === 'object' ? { ...meta } : {};
}

function normalizeTranslation(translation = {}, fallbackLanguage = 'en') {
  return {
    language: String(translation.language || fallbackLanguage || 'en').toLowerCase(),
    title: String(translation.title || ''),
    html: String(translation.html || ''),
    css: String(translation.css || ''),
    metaDesc: String(translation.metaDesc || translation.meta_desc || ''),
    seoTitle: String(translation.seoTitle || translation.seo_title || ''),
    seoKeywords: String(translation.seoKeywords || translation.seo_keywords || '')
  };
}

function pagePermalink(slug, lane = 'public') {
  const clean = String(slug || '').replace(/^\/+|\/+$/g, '');
  if (lane === 'admin') return `/admin/${clean}`;
  return `/${clean}`;
}

function buildPageDataFromPageRow(jwt, row, fallback = {}) {
  if (!row || typeof row !== 'object') return null;
  const pageId = firstDefined(row.id, row.pageId, row.page_id, row._id, fallback.pageId);
  if (!pageId) return null;

  const language = String(firstDefined(row.language, fallback.language, 'en')).toLowerCase();
  const rowTranslation = row.translation && typeof row.translation === 'object' ? row.translation : {};
  const translation = normalizeTranslation({
    language,
    title: firstDefined(row.trans_title, rowTranslation.title, row.title, fallback.title, ''),
    html: firstDefined(row.html, rowTranslation.html, ''),
    css: firstDefined(row.css, rowTranslation.css, ''),
    metaDesc: firstDefined(row.meta_desc, rowTranslation.meta_desc, rowTranslation.metaDesc, ''),
    seoTitle: firstDefined(row.seo_title, rowTranslation.seo_title, rowTranslation.seoTitle, ''),
    seoKeywords: firstDefined(row.seo_keywords, rowTranslation.seo_keywords, rowTranslation.seoKeywords, '')
  }, language);

  const fallbackTranslations = Array.isArray(fallback.translations) ? fallback.translations : [];

  return {
    ...fallback,
    jwt: jwt || fallback.jwt,
    pageId,
    title: firstDefined(row.title, translation.title, fallback.title, ''),
    slug: firstDefined(row.slug, fallback.slug, ''),
    status: firstDefined(row.status, fallback.status, 'draft'),
    seo_image: firstDefined(row.seo_image, row.seoImage, fallback.seo_image, fallback.seoImage, ''),
    translations: fallbackTranslations.length > 0 ? fallbackTranslations : [translation],
    parent_id: firstDefined(row.parent_id, row.parentId, fallback.parent_id, fallback.parentId, null),
    is_content: firstDefined(row.is_content, row.isContent, fallback.is_content, fallback.isContent, false),
    lane: firstDefined(row.lane, fallback.lane, 'public'),
    language,
    meta: firstDefined(row.meta, fallback.meta, null),
    weight: firstDefined(row.weight, fallback.weight, 0)
  };
}

function hasEnoughForFirstMirror(pageData = {}) {
  const title = String(pageData.title || pageData.translations?.[0]?.title || '').trim();
  const slug = String(pageData.slug || '').trim();
  return Boolean(slug && title);
}

function buildPageContentEntryPayload({
  jwt,
  pageId,
  title,
  slug,
  status = 'draft',
  seo_image = '',
  translations = [],
  parent_id = null,
  is_content = false,
  lane = 'public',
  language = 'en',
  meta = null,
  weight = 0
}) {
  const normalizedTranslations = (Array.isArray(translations) ? translations : [])
    .map(t => normalizeTranslation(t, language));
  const primary = normalizedTranslations.find(t => t.language === String(language || 'en').toLowerCase())
    || normalizedTranslations[0]
    || normalizeTranslation({}, language);
  const pageMeta = normalizeMeta(meta);

  return {
    jwt,
    moduleName: 'contentEngine',
    moduleType: 'core',
    contentTypeKey: 'page',
    title: title || primary.title || slug,
    slug,
    permalink: pagePermalink(slug, lane),
    status,
    language: String(language || primary.language || 'en').toLowerCase(),
    sourceModule: 'pagesManager',
    sourceId: String(pageId),
    excerpt: primary.metaDesc || pageMeta.metaDesc || '',
    content: {
      html: primary.html || '',
      css: primary.css || '',
      translations: normalizedTranslations
    },
    meta: {
      ...pageMeta,
      sourcePageId: pageId,
      sourceLane: lane,
      sourceParentId: parent_id || null,
      isContent: Boolean(is_content),
      weight: Number(weight) || 0,
      seoImage: seo_image || '',
      seoTitle: primary.seoTitle || pageMeta.seoTitle || '',
      seoKeywords: primary.seoKeywords || pageMeta.seoKeywords || ''
    },
    publishedAt: status === 'published' ? new Date().toISOString() : null
  };
}

async function mirrorPageToContentEngine(motherEmitter, pageData) {
  if (!hasContentEngineMirrorListeners(motherEmitter)) {
    return { skipped: true };
  }

  if (!pageData?.jwt || !pageData?.pageId) {
    return { skipped: true };
  }

  const sourceLookup = await emitOptional(motherEmitter, 'getContentEntryBySource', {
    jwt: pageData.jwt,
    moduleName: 'contentEngine',
    moduleType: 'core',
    sourceModule: 'pagesManager',
    sourceId: String(pageData.pageId)
  });

  if (sourceLookup.err) {
    return { err: sourceLookup.err };
  }

  const entryPayload = buildPageContentEntryPayload(pageData);
  if (sourceLookup.result?.id) {
    return emitOptional(motherEmitter, 'updateContentEntry', {
      ...entryPayload,
      entryId: sourceLookup.result.id
    });
  }

  if (!hasEnoughForFirstMirror(pageData)) {
    return { skipped: true, reason: 'incomplete-page-data' };
  }

  return emitOptional(motherEmitter, 'createContentEntry', entryPayload);
}

async function trashPageContentEntry(motherEmitter, pageData = {}) {
  if (!hasContentEngineTrashListeners(motherEmitter)) {
    return { skipped: true };
  }

  if (!pageData?.jwt || !pageData?.pageId) {
    return { skipped: true };
  }

  const sourceLookup = await emitOptional(motherEmitter, 'getContentEntryBySource', {
    jwt: pageData.jwt,
    moduleName: 'contentEngine',
    moduleType: 'core',
    sourceModule: 'pagesManager',
    sourceId: String(pageData.pageId)
  });

  if (sourceLookup.err) {
    return { err: sourceLookup.err };
  }

  const entry = Array.isArray(sourceLookup.result) ? sourceLookup.result[0] : sourceLookup.result;
  const entryId = firstDefined(entry?.id, entry?.entryId, entry?._id);
  if (!entryId) {
    return { skipped: true, reason: 'missing-content-entry' };
  }

  return emitOptional(motherEmitter, 'trashContentEntry', {
    jwt: pageData.jwt,
    moduleName: 'contentEngine',
    moduleType: 'core',
    entryId,
    deletedBy: firstDefined(pageData.deletedBy, pageData.userId, null)
  });
}

module.exports = {
  buildPageDataFromPageRow,
  buildPageContentEntryPayload,
  hasContentEngineMirrorListeners,
  hasContentEngineTrashListeners,
  mirrorPageToContentEngine,
  trashPageContentEntry
};
