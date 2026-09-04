

const { BACKEND_EVENTS } = require('../../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../../contracts/backendEventContracts');const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const FORMAT = 'blogposter-static-site-assets';
const SCHEMA_VERSION = 1;
const MAX_ASSETS = 5000;
const MAX_PAGES = 2000;
const SAFE_PROTOCOL_PATTERN = /^https?:\/\//i;
const EXECUTABLE_PROTOCOL_PATTERN = /^(?:data|javascript|vbscript):/i;

const MIME_BY_EXTENSION = Object.freeze({
  '.apk': 'application/vnd.android.package-archive',
  '.avif': 'image/avif',
  '.css': 'text/css',
  '.eot': 'application/vnd.ms-fontobject',
  '.gif': 'image/gif',
  '.htm': 'text/html',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.zip': 'application/zip'
});

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function text(value, max = 1000) {
  if (value === null || typeof value === 'undefined') return '';
  return String(value).trim().slice(0, max);
}

function safeKey(value, fallback = 'static-site') {
  const normalized = text(value, 120)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeRelativePath(value, label) {
  const raw = text(value, 1400).replace(/\\/g, '/').replace(/^\.\//, '');
  if (!raw || raw === '.') return '';
  if (raw.startsWith('/') || /^[a-z]:\//i.test(raw) || raw.split('/').includes('..')) {
    throw new Error(`[staticSiteAssets:ASSET_PATH_INVALID] ${label} must be a relative storage path.`);
  }
  return raw.replace(/\/{2,}/g, '/');
}

function normalizePublicUrl(value, label) {
  const url = text(value, 2000);
  if (!url) return '';
  if (url.startsWith('//') || EXECUTABLE_PROTOCOL_PATTERN.test(url)) {
    throw new Error(`[staticSiteAssets:ASSET_URL_INVALID] ${label} uses an unsafe URL.`);
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !SAFE_PROTOCOL_PATTERN.test(url)) {
    throw new Error(`[staticSiteAssets:ASSET_URL_INVALID] ${label} must use HTTP(S) or a site-relative URL.`);
  }
  return url;
}

function normalizeSlug(value, label) {
  const slug = text(value, 160).replace(/^\/+|\/+$/g, '');
  if (!slug || slug.split('/').some(segment => !/^[a-z0-9][a-z0-9-]*$/.test(segment))) {
    throw new Error(`[staticSiteAssets:PAGE_SLUG_INVALID] ${label} has an invalid slug.`);
  }
  return slug;
}

function mimeFor(fileName, explicitMime = '') {
  return text(explicitMime, 160) || MIME_BY_EXTENSION[path.extname(fileName).toLowerCase()] || 'application/octet-stream';
}

function categoryFor(fileName, mimeType, explicitCategory = '') {
  if (explicitCategory) return safeKey(explicitCategory, 'asset');
  const extension = path.extname(fileName).toLowerCase();
  if (extension === '.apk') return 'download';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('font/')) return 'font';
  if (mimeType === 'text/css') return 'stylesheet';
  if (mimeType.includes('javascript')) return 'script';
  if (mimeType === 'application/pdf') return 'document';
  if (['.zip', '.tar', '.gz'].includes(extension)) return 'archive';
  return 'asset';
}

function fileTypeFor(category, mimeType) {
  if (category === 'download') return 'application';
  return mimeType.split('/')[0] || category || 'asset';
}

function normalizeStorage(storage, fallbackPath, fallbackUrl, index) {
  const source = isPlainObject(storage) ? storage : {};
  const objectKey = normalizeRelativePath(
    source.objectKey || source.key || fallbackPath,
    `assets[${index}].storage.objectKey`
  );
  const deliveryUrl = normalizePublicUrl(
    source.deliveryUrl || source.cdnUrl || fallbackUrl,
    `assets[${index}].storage.deliveryUrl`
  );
  const originUrl = normalizePublicUrl(source.originUrl || '', `assets[${index}].storage.originUrl`);
  return {
    provider: safeKey(source.provider || (deliveryUrl && SAFE_PROTOCOL_PATTERN.test(deliveryUrl) ? 'remote' : 'local')),
    objectKey,
    deliveryUrl,
    originUrl
  };
}

function normalizeArtifact(value) {
  if (!isPlainObject(value)) return null;
  const normalized = {
    kind: safeKey(value.kind || 'application-package', 'application-package'),
    platform: safeKey(value.platform || '', ''),
    architecture: safeKey(value.architecture || value.arch || '', ''),
    channel: safeKey(value.channel || '', ''),
    version: text(value.version, 120),
    build: text(value.build || value.buildNumber, 120),
    publishedAt: text(value.publishedAt, 80),
    signatureUrl: normalizePublicUrl(value.signatureUrl || '', 'asset.artifact.signatureUrl')
  };
  return Object.fromEntries(Object.entries(normalized).filter(([, entry]) => entry !== ''));
}

function normalizeUsedBy(value, index) {
  const values = Array.isArray(value) ? value : (value ? [value] : []);
  return values.map((entry, relationIndex) => {
    const source = isPlainObject(entry) ? entry : { pageSlug: entry };
    return {
      pageSlug: normalizeSlug(source.pageSlug || source.slug, `assets[${index}].usedBy[${relationIndex}]`),
      role: safeKey(source.role || '', ''),
      sortOrder: Number(source.sortOrder) || 0
    };
  });
}

function fileNameFromAsset(asset, storagePath, url) {
  const explicit = text(asset.fileName, 1200);
  if (explicit) return path.basename(explicit.replace(/\\/g, '/'));
  if (storagePath) return path.posix.basename(storagePath);
  try {
    return path.posix.basename(new URL(url, 'https://blogposter.invalid').pathname);
  } catch {
    return path.posix.basename(text(url, 1200).split('?')[0]);
  }
}

function normalizeAsset(asset, index, packageKey) {
  if (!isPlainObject(asset)) {
    throw new Error(`[staticSiteAssets:ASSET_INVALID] assets[${index}] must be an object.`);
  }
  const rawStoragePath = asset.storagePath || asset.path || asset.objectKey || '';
  const rawUrl = asset.deliveryUrl || asset.cdnUrl || asset.url || '';
  const storage = normalizeStorage(asset.storage, rawStoragePath, rawUrl, index);
  const storagePath = storage.objectKey;
  const url = storage.deliveryUrl || (storagePath.startsWith('public/')
    ? `/media/${storagePath.slice('public/'.length)}`
    : '');
  const fileName = fileNameFromAsset(asset, storagePath, url);
  if (!fileName || (!storagePath && !url)) {
    throw new Error(`[staticSiteAssets:ASSET_LOCATION_MISSING] assets[${index}] needs a storage path or URL.`);
  }
  const mimeType = mimeFor(fileName, asset.mimeType || asset.type);
  const category = categoryFor(fileName, mimeType, asset.category || asset.kind);
  const artifact = normalizeArtifact(asset.artifact || asset.release);
  const canonicalSource = text(asset.sourceId || storagePath || url, 1400);
  // Application packages are immutable release artifacts. Version, build or
  // checksum therefore contributes to identity instead of overwriting history.
  const artifactRevision = artifact
    ? text(artifact.version || artifact.build || asset.checksum || asset.hash, 200)
    : '';
  const sourceIdentity = artifactRevision ? `${canonicalSource}@${artifactRevision}` : canonicalSource;
  const sourceId = `${packageKey}:${stableHash(sourceIdentity).slice(0, 32)}`;
  return {
    sourceId,
    sourcePath: canonicalSource,
    fileName,
    fileType: fileTypeFor(category, mimeType),
    mimeType,
    url,
    storagePath,
    folder: normalizeRelativePath(asset.folder || path.posix.dirname(storagePath), `assets[${index}].folder`),
    title: text(asset.title || fileName, 240),
    altText: text(asset.altText || asset.alt, 500),
    caption: text(asset.caption, 1000),
    description: text(asset.description, 4000),
    credit: text(asset.credit, 240),
    category,
    status: text(asset.status || 'active', 40),
    visibility: text(asset.visibility || 'public', 40),
    sizeBytes: Math.max(0, Number(asset.sizeBytes || asset.size) || 0),
    width: Math.max(0, Number(asset.width) || 0),
    height: Math.max(0, Number(asset.height) || 0),
    checksum: text(asset.checksum || asset.hash, 160),
    role: safeKey(asset.role || '', ''),
    usedBy: normalizeUsedBy(asset.usedBy, index),
    storage,
    artifact,
    meta: isPlainObject(asset.meta) ? asset.meta : {}
  };
}

function pageContent(page) {
  const translations = Array.isArray(page.translations)
    ? page.translations
    : (isPlainObject(page.translation) ? [page.translation] : []);
  return [
    page.html,
    page.css,
    ...translations.flatMap(translation => [translation?.html, translation?.css])
  ].filter(Boolean).join('\n');
}

function normalizePage(page, index) {
  if (!isPlainObject(page)) {
    throw new Error(`[staticSiteAssets:PAGE_INVALID] pages[${index}] must be an object.`);
  }
  return {
    slug: normalizeSlug(page.slug || page.sourceId, `pages[${index}]`),
    lane: text(page.lane || 'public', 40),
    language: text(page.language || page.translation?.language || 'en', 40),
    content: pageContent(page)
  };
}

function referenceAliases(asset) {
  const aliases = new Set([
    asset.url,
    asset.storagePath,
    asset.sourcePath,
    asset.storagePath.startsWith('public/') ? `/media/${asset.storagePath.slice('public/'.length)}` : ''
  ].filter(Boolean));
  return [...aliases];
}

function inferredRole(asset) {
  if (asset.role) return asset.role;
  if (asset.category === 'download') return 'download';
  if (asset.category === 'stylesheet') return 'stylesheet';
  return 'inline';
}

function buildRelations(pages, assets) {
  const relations = [];
  const pageBySlug = new Map(pages.map(page => [page.slug, page]));
  for (const asset of assets) {
    const explicit = new Map(asset.usedBy.map(item => [item.pageSlug, item]));
    for (const page of pages) {
      const positions = referenceAliases(asset)
        .map(alias => page.content.indexOf(alias))
        .filter(position => position >= 0);
      if (!positions.length && !explicit.has(page.slug)) continue;
      const requested = explicit.get(page.slug);
      relations.push({
        assetSourceId: asset.sourceId,
        pageSlug: page.slug,
        lane: page.lane,
        language: page.language,
        role: requested?.role || inferredRole(asset),
        sortOrder: requested?.sortOrder || (positions.length ? Math.min(...positions) : 0)
      });
      explicit.delete(page.slug);
    }
    for (const requested of explicit.values()) {
      const page = pageBySlug.get(requested.pageSlug);
      relations.push({
        assetSourceId: asset.sourceId,
        pageSlug: requested.pageSlug,
        lane: page?.lane || 'public',
        language: page?.language || 'en',
        role: requested.role || inferredRole(asset),
        sortOrder: requested.sortOrder
      });
    }
  }
  return relations;
}

function validateManifest(manifest) {
  if (!isPlainObject(manifest)) {
    throw new Error('[staticSiteAssets:MANIFEST_INVALID] Manifest must be an object.');
  }
  if (manifest.format !== FORMAT || Number(manifest.schemaVersion) !== SCHEMA_VERSION) {
    throw new Error(`[staticSiteAssets:MANIFEST_FORMAT_UNSUPPORTED] Expected ${FORMAT} schema version ${SCHEMA_VERSION}.`);
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length > MAX_ASSETS) {
    throw new Error(`[staticSiteAssets:ASSET_COUNT_INVALID] assets must contain at most ${MAX_ASSETS} entries.`);
  }
  if (manifest.pages && (!Array.isArray(manifest.pages) || manifest.pages.length > MAX_PAGES)) {
    throw new Error(`[staticSiteAssets:PAGE_COUNT_INVALID] pages must contain at most ${MAX_PAGES} entries.`);
  }
}

function buildPlan(manifest) {
  validateManifest(manifest);
  const packageKey = safeKey(manifest.packageKey || manifest.source?.id || manifest.source || manifest.name);
  const pages = (manifest.pages || []).map(normalizePage);
  const assets = manifest.assets.map((asset, index) => normalizeAsset(asset, index, packageKey));
  const sourceIds = new Set();
  for (const asset of assets) {
    if (sourceIds.has(asset.sourceId)) {
      throw new Error(`[staticSiteAssets:ASSET_DUPLICATE] Duplicate asset source ${asset.sourcePath}.`);
    }
    sourceIds.add(asset.sourceId);
  }
  const relations = buildRelations(pages, assets);
  return {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    packageKey,
    assets,
    pages: pages.map(page => ({ slug: page.slug, lane: page.lane, language: page.language })),
    relations,
    totals: {
      assets: assets.length,
      pages: pages.length,
      relations: relations.length,
      downloads: assets.filter(asset => asset.category === 'download').length,
      remoteAssets: assets.filter(asset => SAFE_PROTOCOL_PATTERN.test(asset.url)).length
    }
  };
}

async function loadManifest(options = {}) {
  if (isPlainObject(options.manifest)) return options.manifest;
  let manifestPath = text(options.filePath || options.path, 2000);
  if (!manifestPath && options.packageDir) manifestPath = path.join(String(options.packageDir), 'manifest.json');
  if (!manifestPath) {
    throw new Error('[staticSiteAssets:MANIFEST_MISSING] Provide options.manifest, options.filePath or options.packageDir.');
  }
  try {
    return JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`[staticSiteAssets:MANIFEST_READ_FAILED] ${error.message}`);
  }
}

function resultId(result) {
  return result?.id ?? result?.attachmentId ?? result?.insertedId ?? null;
}

async function applyPlan(plan, options = {}) {
  const { motherEmitter, jwt, decodedJWT } = options;
  if (!motherEmitter) {
    throw new Error('[staticSiteAssets:EMITTER_MISSING] Applying an import requires motherEmitter.');
  }
  const mediaBase = { jwt, decodedJWT, moduleName: 'mediaManager', moduleType: 'core' };
  const pageBase = { jwt, decodedJWT, moduleName: 'pagesManager', moduleType: 'core' };
  const attachmentIds = new Map();
  const applied = { assets: [], relations: [], warnings: [] };

  for (const asset of plan.assets) {
    const result = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CREATE_MEDIA_ATTACHMENT, {
      ...mediaBase,
      fileName: asset.fileName,
      fileType: asset.fileType,
      mimeType: asset.mimeType,
      url: asset.url,
      storagePath: asset.storagePath,
      folder: asset.folder,
      title: asset.title,
      altText: asset.altText,
      caption: asset.caption,
      description: asset.description,
      credit: asset.credit,
      category: asset.category,
      status: asset.status,
      visibility: asset.visibility,
      sizeBytes: asset.sizeBytes,
      width: asset.width,
      height: asset.height,
      checksum: asset.checksum,
      sourceModule: 'staticSiteAssets',
      sourceId: asset.sourceId,
      meta: {
        ...asset.meta,
        import: { importer: 'staticSiteAssets', packageKey: plan.packageKey, sourcePath: asset.sourcePath },
        storage: asset.storage,
        ...(asset.artifact ? { artifact: asset.artifact } : {})
      }
    });
    const attachmentId = resultId(result);
    if (!attachmentId) {
      throw new Error(`[staticSiteAssets:ATTACHMENT_ID_MISSING] Media Manager returned no id for ${asset.sourcePath}.`);
    }
    attachmentIds.set(asset.sourceId, attachmentId);
    applied.assets.push({ sourceId: asset.sourceId, attachmentId });
  }

  const pageCache = new Map();
  for (const relation of plan.relations) {
    const pageKey = `${relation.lane}:${relation.language}:${relation.pageSlug}`;
    if (!pageCache.has(pageKey)) {
      const page = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_PAGE_BY_SLUG, {
        ...pageBase,
        slug: relation.pageSlug,
        lane: relation.lane,
        language: relation.language
      });
      pageCache.set(pageKey, page || null);
    }
    const page = pageCache.get(pageKey);
    const pageId = page?.id ?? page?.pageId ?? null;
    if (!pageId) {
      applied.warnings.push({
        code: 'STATIC_SITE_ASSET_PAGE_NOT_FOUND',
        pageSlug: relation.pageSlug,
        assetSourceId: relation.assetSourceId
      });
      continue;
    }
    const attachmentId = attachmentIds.get(relation.assetSourceId);
    const linked = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.LINK_MEDIA_TO_CONTENT, {
      ...mediaBase,
      attachmentId,
      targetType: 'source',
      targetId: `pagesManager:${pageId}`,
      sourceModule: 'pagesManager',
      sourceId: String(pageId),
      role: relation.role,
      sortOrder: relation.sortOrder,
      meta: { pageSlug: relation.pageSlug, importedBy: 'staticSiteAssets' }
    });
    applied.relations.push({
      attachmentId,
      pageId,
      pageSlug: relation.pageSlug,
      role: relation.role,
      result: linked
    });
  }

  return {
    applied: true,
    packageKey: plan.packageKey,
    totals: {
      assets: applied.assets.length,
      relations: applied.relations.length,
      warnings: applied.warnings.length
    },
    ...applied
  };
}

module.exports = {
  name: 'staticSiteAssets',
  description: 'Register a provider-neutral static-site asset catalog in Media Manager and link assets to existing pages.',
  async import(options = {}) {
    const manifest = await loadManifest(options);
    const plan = buildPlan(manifest);
    if (options.dryRun !== false) return { applied: false, plan };
    return applyPlan(plan, options);
  },
  _internals: {
    applyPlan,
    buildPlan,
    buildRelations,
    loadManifest,
    normalizeAsset
  }
};
