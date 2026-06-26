'use strict';

require('dotenv').config();

const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');
const {
  ensureSeoDatabase,
  ensureSeoSchema,
  seedSeoDefaults,
  seoDbSelect,
  seoDbUpdate
} = require('./seoService');

const MODULE_NAME = 'seoManager';
const MODULE_TYPE = 'core';
const VALID_TARGET_TYPES = new Set(['global', 'entry', 'path', 'source']);
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/;
const DEFAULT_BASE_URL = 'https://example.com';

function assertCorePayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[seoManager] ${eventName} => invalid meltdown payload.`);
  }
}

function requirePermission(payload, permission) {
  if (payload?.decodedJWT && !hasPermission(payload.decodedJWT, permission)) {
    throw new Error(`Forbidden - missing permission: ${permission}`);
  }
}

function normalizeText(value = '', max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function normalizeUrl(value = '') {
  const url = String(value || '').trim().slice(0, 1000);
  if (!url) return '';
  if (CONTROL_CHAR_PATTERN.test(url) || /\s/.test(url) || url.includes('\\') || url.startsWith('//')) {
    return '';
  }
  if (url.startsWith('/')) {
    return url;
  }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    return '';
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return '';
  }
  return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
}

function normalizePath(value = '') {
  const path = String(value || '/').trim();
  if (!path || path === '/') return '/';
  return `/${path.replace(/^\/+|\/+$/g, '')}`;
}

function normalizeKeywords(value = '') {
  if (Array.isArray(value)) {
    return value.map(item => normalizeText(item, 80)).filter(Boolean).join(',');
  }
  return normalizeText(value, 500);
}

function normalizeRobots(value = 'index,follow') {
  const robots = normalizeText(value || 'index,follow', 120).toLowerCase();
  const allowed = new Set(['index', 'noindex', 'follow', 'nofollow', 'noarchive', 'nosnippet']);
  const parts = robots.split(',').map(part => part.trim()).filter(part => allowed.has(part));
  return parts.length ? Array.from(new Set(parts)).join(',') : 'index,follow';
}

function normalizeTarget(payload = {}) {
  if (payload.entryId || payload.contentEntryId || payload.entry_id) {
    return { targetType: 'entry', targetKey: String(payload.entryId || payload.contentEntryId || payload.entry_id) };
  }

  const sourceModule = normalizeText(payload.sourceModule || payload.source_module || '', 120);
  const sourceId = normalizeText(payload.sourceId || payload.source_id || '', 160);
  if (sourceModule && sourceId) {
    return { targetType: 'source', targetKey: `${sourceModule}:${sourceId}` };
  }

  if (payload.path || payload.permalink || payload.url) {
    return { targetType: 'path', targetKey: normalizePath(payload.path || payload.permalink || payload.url) };
  }

  const targetType = normalizeText(payload.targetType || payload.target_type || 'global', 40).toLowerCase();
  const safeTargetType = VALID_TARGET_TYPES.has(targetType) ? targetType : 'global';
  const targetKey = safeTargetType === 'path'
    ? normalizePath(payload.targetKey || payload.target_key || '/')
    : normalizeText(payload.targetKey || payload.target_key || 'default', 200);
  return { targetType: safeTargetType, targetKey: targetKey || 'default' };
}

function normalizeSeoInput(payload = {}, fallback = {}) {
  const target = normalizeTarget({ ...fallback, ...payload });
  return {
    ...target,
    title: normalizeText(payload.title ?? fallback.title ?? '', 240),
    description: normalizeText(payload.description ?? fallback.description ?? '', 500),
    keywords: normalizeKeywords(payload.keywords ?? fallback.keywords ?? ''),
    canonicalUrl: normalizeUrl(payload.canonicalUrl ?? payload.canonical_url ?? fallback.canonical_url ?? ''),
    robots: normalizeRobots(payload.robots ?? fallback.robots ?? 'index,follow'),
    ogImage: normalizeUrl(payload.ogImage ?? payload.og_image ?? fallback.og_image ?? ''),
    structuredData: payload.structuredData ?? payload.structured_data ?? fallback.structured_data ?? {},
    meta: payload.meta ?? fallback.meta ?? {}
  };
}

function mergeSeoMeta(defaults = {}, content = {}, explicit = {}) {
  return {
    title: explicit.title || content.title || defaults.title || '',
    description: explicit.description || content.description || defaults.description || '',
    keywords: explicit.keywords || content.keywords || defaults.keywords || '',
    canonicalUrl: explicit.canonical_url || explicit.canonicalUrl || content.canonicalUrl || defaults.canonical_url || '',
    robots: explicit.robots || content.robots || defaults.robots || 'index,follow',
    ogImage: explicit.og_image || explicit.ogImage || content.ogImage || defaults.og_image || '',
    structuredData: explicit.structured_data || explicit.structuredData || content.structuredData || defaults.structured_data || {},
    meta: {
      ...(defaults.meta || {}),
      ...(content.meta || {}),
      ...(explicit.meta || {})
    }
  };
}

function escapeXml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function baseUrl(value = process.env.APP_BASE_URL || DEFAULT_BASE_URL) {
  const raw = String(value || DEFAULT_BASE_URL).trim();
  if (CONTROL_CHAR_PATTERN.test(raw) || /\s/.test(raw) || raw.includes('\\')) {
    return DEFAULT_BASE_URL;
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return DEFAULT_BASE_URL;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return DEFAULT_BASE_URL;
  }
  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

function buildSitemapXml(entries = [], rootUrl = baseUrl()) {
  const urls = (Array.isArray(entries) ? entries : [])
    .filter(entry => entry && entry.permalink)
    .map(entry => {
      const loc = `${rootUrl}/${String(entry.permalink).replace(/^\/+/, '')}`;
      const lastmod = entry.updated_at || entry.updatedAt || entry.published_at || entry.publishedAt || new Date().toISOString();
      return [
        '  <url>',
        `    <loc>${escapeXml(loc)}</loc>`,
        `    <lastmod>${escapeXml(new Date(lastmod).toISOString())}</lastmod>`,
        '    <changefreq>weekly</changefreq>',
        '  </url>'
      ].join('\n');
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

async function getContentEntryForSeo(motherEmitter, jwt, payload) {
  if (payload.entryId || payload.contentEntryId || payload.entry_id) {
    return await new Promise(resolve => {
      motherEmitter.emit('getContentEntry', {
        jwt,
        moduleName: 'contentEngine',
        moduleType: 'core',
        entryId: payload.entryId || payload.contentEntryId || payload.entry_id
      }, (err, entry) => resolve(err ? null : entry));
    });
  }

  if (payload.sourceModule && payload.sourceId) {
    return await new Promise(resolve => {
      motherEmitter.emit('getContentEntryBySource', {
        jwt,
        moduleName: 'contentEngine',
        moduleType: 'core',
        sourceModule: payload.sourceModule,
        sourceId: payload.sourceId
      }, (err, entry) => resolve(err ? null : entry));
    });
  }

  if (payload.path || payload.permalink) {
    return await new Promise(resolve => {
      motherEmitter.emit('resolveContentPermalink', {
        jwt,
        moduleName: 'contentEngine',
        moduleType: 'core',
        permalink: payload.path || payload.permalink,
        language: payload.language || 'en'
      }, (err, entry) => resolve(err ? null : entry));
    });
  }

  return null;
}

function contentEntrySeo(entry) {
  if (!entry) return {};
  const meta = entry.meta || {};
  return {
    title: meta.seoTitle || meta.title || entry.title || '',
    description: meta.metaDesc || meta.description || entry.excerpt || '',
    keywords: meta.seoKeywords || meta.keywords || '',
    canonicalUrl: entry.permalink || '',
    robots: meta.robots || 'index,follow',
    ogImage: meta.ogImage || meta.seoImage || '',
    structuredData: meta.structuredData || {},
    meta: {
      contentTypeKey: entry.content_type_key,
      entryId: entry.id
    }
  };
}

function setupSeoEvents(motherEmitter) {
  motherEmitter.on('setSeoDefaults', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'setSeoDefaults');
      requirePermission(payload, 'seo.manage');
      const result = await seoDbUpdate(motherEmitter, payload.jwt, 'UPSERT_SEO_META', normalizeSeoInput({
        ...payload,
        targetType: 'global',
        targetKey: 'default'
      }));
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getSeoDefaults', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getSeoDefaults');
      const result = await seoDbSelect(motherEmitter, payload.jwt, 'GET_SEO_META', {
        targetType: 'global',
        targetKey: 'default'
      });
      callback(null, Array.isArray(result) ? result[0] || null : result || null);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('upsertSeoMeta', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'upsertSeoMeta');
      requirePermission(payload, 'seo.manage');
      const result = await seoDbUpdate(motherEmitter, payload.jwt, 'UPSERT_SEO_META', normalizeSeoInput(payload));
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getSeoMeta', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'getSeoMeta');
      const result = await seoDbSelect(motherEmitter, payload.jwt, 'GET_SEO_META', normalizeTarget(payload));
      callback(null, Array.isArray(result) ? result[0] || null : result || null);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('listSeoMeta', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listSeoMeta');
      requirePermission(payload, 'seo.manage');
      const result = await seoDbSelect(motherEmitter, payload.jwt, 'LIST_SEO_META', {
        targetType: payload.targetType ? normalizeTarget(payload).targetType : '',
        limit: Math.min(Number(payload.limit) || 50, 100),
        offset: Math.max(Number(payload.offset) || 0, 0)
      });
      callback(null, result || []);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('deleteSeoMeta', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'deleteSeoMeta');
      requirePermission(payload, 'seo.manage');
      const result = await seoDbUpdate(motherEmitter, payload.jwt, 'DELETE_SEO_META', normalizeTarget(payload));
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('resolveSeoMeta', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'resolveSeoMeta');
      const defaults = await seoDbSelect(motherEmitter, payload.jwt, 'GET_SEO_META', {
        targetType: 'global',
        targetKey: 'default'
      });
      const target = normalizeTarget(payload);
      const explicit = await seoDbSelect(motherEmitter, payload.jwt, 'GET_SEO_META', target);
      const entry = await getContentEntryForSeo(motherEmitter, payload.jwt, payload);
      callback(null, {
        target,
        entry,
        seo: mergeSeoMeta(
          Array.isArray(defaults) ? defaults[0] : defaults,
          contentEntrySeo(entry),
          Array.isArray(explicit) ? explicit[0] : explicit
        )
      });
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('generateSeoSitemap', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'generateSeoSitemap');
      const entries = await new Promise((resolve, reject) => {
        motherEmitter.emit('listContentEntries', {
          jwt: payload.jwt,
          moduleName: 'contentEngine',
          moduleType: 'core',
          contentTypeKey: payload.contentTypeKey || payload.contentType || '',
          status: 'published',
          language: payload.language || '',
          limit: Math.min(Number(payload.limit) || 100, 100),
          offset: Math.max(Number(payload.offset) || 0, 0)
        }, (err, result) => (err ? reject(err) : resolve(result || [])));
      });
      callback(null, buildSitemapXml(entries, baseUrl(payload.baseUrl)));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('generateRobotsTxt', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'generateRobotsTxt');
      const defaults = await seoDbSelect(motherEmitter, payload.jwt, 'GET_SEO_META', {
        targetType: 'global',
        targetKey: 'default'
      });
      const defaultsRecord = Array.isArray(defaults) ? defaults[0] : defaults;
      const meta = defaultsRecord?.meta || {};
      const robots = defaultsRecord?.robots || meta.robots || '';
      const lines = ['User-agent: *'];
      const disallow = Array.isArray(meta.disallow) ? meta.disallow : [];
      if (String(robots).includes('noindex') || meta.disallowAll === true) {
        lines.push('Disallow: /');
      } else if (disallow.length) {
        for (const rule of disallow) lines.push(`Disallow: ${normalizePath(rule)}`);
      } else {
        lines.push('Allow: /');
      }
      lines.push(`Sitemap: ${baseUrl(payload.baseUrl)}/sitemap.xml`);
      callback(null, `${lines.join('\n')}\n`);
    } catch (err) {
      callback(err);
    }
  });
}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt, nonce }) {
    if (!isCore) {
      throw new Error('[SEO MANAGER] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[SEO MANAGER] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[SEO MANAGER] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[SEO MANAGER] Initializing SEO Manager...');
    await ensureSeoDatabase(motherEmitter, jwt, nonce);
    await ensureSeoSchema(motherEmitter, jwt);
    setupSeoEvents(motherEmitter);
    await seedSeoDefaults(motherEmitter, jwt);
    console.log('[SEO MANAGER] Initialized successfully.');
  },
  setupSeoEvents,
  _internals: {
    baseUrl,
    buildSitemapXml,
    contentEntrySeo,
    mergeSeoMeta,
    normalizeSeoInput,
    normalizeTarget,
    normalizeUrl
  }
};
