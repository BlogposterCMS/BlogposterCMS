'use strict';

require('dotenv').config();

const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');

const MODULE_NAME = 'exportManager';
const MODULE_TYPE = 'core';
const CONTENT_PAGE_SIZE = 100;
const MEDIA_PAGE_SIZE = 200;
const DEFAULT_CONTENT_STATUSES = [];
const DEFAULT_MEDIA_STATUSES = Object.freeze(['active', 'draft', 'archived', 'deleted']);
const DEFAULT_MEDIA_VISIBILITIES = Object.freeze(['public', 'private', 'hidden']);
const CONTROL_OPTION_KEYS = new Set([
  'motherEmitter',
  'jwt',
  'decodedJWT',
  'exportPayload'
]);

function assertCorePayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[exportManager] ${eventName} => invalid meltdown payload.`);
  }
}

function requirePermission(payload, permission) {
  if (payload?.decodedJWT && !hasPermission(payload.decodedJWT, permission)) {
    throw new Error(`Forbidden - missing permission: ${permission}`);
  }
}

function emitCore(motherEmitter, jwt, eventName, moduleName, params = {}) {
  return new Promise((resolve, reject) => {
    if (typeof motherEmitter.listenerCount === 'function' && motherEmitter.listenerCount(eventName) === 0) {
      resolve([]);
      return;
    }
    motherEmitter.emit(eventName, {
      jwt,
      moduleName,
      moduleType: MODULE_TYPE,
      ...params
    }, onceCallback((err, result) => {
      if (err) return reject(err);
      resolve(result);
    }));
  });
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(item => item != null) : [value];
}

function stringArray(value, fallback = []) {
  const values = toArray(value).map(item => String(item || '').trim()).filter(Boolean);
  return values.length ? values : [...fallback];
}

function boolOption(options, key, fallback) {
  return typeof options[key] === 'boolean' ? options[key] : fallback;
}

function assertPlainOptions(raw) {
  if (typeof raw === 'undefined' || raw === null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw) || (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw))) {
    throw new Error('[exportManager] runExport options must be an object.');
  }
  return raw;
}

function sanitizeExportFileName(rawFileName = '') {
  const value = String(rawFileName || '').trim();
  if (!value) return '';
  if (
    value.includes('/') ||
    value.includes('\\') ||
    value.includes(':') ||
    value === '.' ||
    value === '..' ||
    value.includes('..') ||
    /[\0-\x1f\x7f]/.test(value)
  ) {
    throw new Error('[exportManager] Invalid export fileName.');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,179}$/.test(value)) {
    throw new Error('[exportManager] Invalid export fileName.');
  }
  return value;
}

function sanitizeSiteUrl(rawSiteUrl = '') {
  const value = String(rawSiteUrl || '').trim().replace(/\/+$/g, '');
  if (!value) return '';
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('[exportManager] Invalid export siteUrl.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('[exportManager] Invalid export siteUrl.');
  }
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/+$/g, '');
}

function sanitizeRunExportOptions(raw = {}) {
  const options = { ...assertPlainOptions(raw) };
  for (const key of CONTROL_OPTION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(options, key)) {
      throw new Error(`[exportManager] runExport options cannot override ${key}.`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(options, 'fileName')) {
    options.fileName = sanitizeExportFileName(options.fileName);
  }
  if (Object.prototype.hasOwnProperty.call(options, 'siteUrl')) {
    options.siteUrl = sanitizeSiteUrl(options.siteUrl);
  }
  return options;
}

function normalizeExportOptions(raw = {}, defaults = {}) {
  const options = assertPlainOptions(raw);
  return {
    includeContent: boolOption(options, 'includeContent', defaults.includeContent ?? true),
    includeContentTypes: boolOption(options, 'includeContentTypes', defaults.includeContentTypes ?? true),
    includeRevisions: boolOption(options, 'includeRevisions', defaults.includeRevisions ?? true),
    includeMedia: boolOption(options, 'includeMedia', defaults.includeMedia ?? true),
    includeMediaVariants: boolOption(options, 'includeMediaVariants', defaults.includeMediaVariants ?? true),
    includeMediaRelations: boolOption(options, 'includeMediaRelations', defaults.includeMediaRelations ?? true),
    includeSettings: boolOption(options, 'includeSettings', defaults.includeSettings ?? true),
    includeMetadata: boolOption(options, 'includeMetadata', defaults.includeMetadata ?? true),
    includeTrashed: boolOption(options, 'includeTrashed', defaults.includeTrashed ?? false),
    contentTypeKey: String(options.contentTypeKey || options.contentType || '').trim(),
    language: String(options.language || '').trim().toLowerCase(),
    statuses: stringArray(options.statuses || options.status, defaults.statuses || DEFAULT_CONTENT_STATUSES),
    mediaStatuses: stringArray(options.mediaStatuses || options.mediaStatus, defaults.mediaStatuses || DEFAULT_MEDIA_STATUSES),
    mediaVisibilities: stringArray(options.mediaVisibilities || options.mediaVisibility, defaults.mediaVisibilities || DEFAULT_MEDIA_VISIBILITIES),
    settingsPrefix: String(options.settingsPrefix || '').trim(),
    siteUrl: sanitizeSiteUrl(options.siteUrl || ''),
    fileName: sanitizeExportFileName(options.fileName || '')
  };
}

async function collectPaged({ motherEmitter, jwt, eventName, moduleName, baseParams = {}, pageSize = 100, offsetKey = 'offset' }) {
  const rows = [];
  let offset = 0;

  while (true) {
    const page = await emitCore(motherEmitter, jwt, eventName, moduleName, {
      ...baseParams,
      limit: pageSize,
      [offsetKey]: offset
    });
    const list = Array.isArray(page) ? page : toArray(page);
    rows.push(...list);
    if (list.length < pageSize) break;
    offset += pageSize;
  }

  return rows;
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function entryId(entry = {}) {
  return entry.id || entry.entryId || entry.entry_id || null;
}

function attachmentId(attachment = {}) {
  return attachment.id || attachment.attachmentId || attachment.attachment_id || null;
}

async function collectContentEntries(motherEmitter, jwt, options) {
  const baseParams = {
    contentTypeKey: options.contentTypeKey,
    language: options.language
  };
  const statuses = options.statuses.length ? options.statuses : [''];
  const entries = [];

  for (const status of statuses) {
    entries.push(...await collectPaged({
      motherEmitter,
      jwt,
      eventName: 'listContentEntries',
      moduleName: 'contentEngine',
      pageSize: CONTENT_PAGE_SIZE,
      baseParams: {
        ...baseParams,
        status
      }
    }));
  }

  if (options.includeTrashed) {
    entries.push(...await collectPaged({
      motherEmitter,
      jwt,
      eventName: 'listTrashedContentEntries',
      moduleName: 'contentEngine',
      pageSize: CONTENT_PAGE_SIZE,
      baseParams
    }));
  }

  return uniqueBy(entries, item => String(entryId(item) || `${item.content_type_key || item.contentTypeKey}:${item.slug}:${item.language}`));
}

async function collectEntryDetails(motherEmitter, jwt, entries, options) {
  const revisionsByEntryId = {};
  const metadataByEntryId = {};

  for (const entry of entries) {
    const id = entryId(entry);
    if (!id) continue;
    if (options.includeRevisions) {
      revisionsByEntryId[id] = await emitCore(motherEmitter, jwt, 'getContentRevisions', 'contentEngine', { entryId: id });
    }
    if (options.includeMetadata) {
      metadataByEntryId[id] = await emitCore(motherEmitter, jwt, 'getMetadata', 'metadataManager', {
        targetType: 'contentEntry',
        targetId: String(id),
        public: false,
        limit: 250
      });
    }
  }

  return { revisionsByEntryId, metadataByEntryId };
}

async function collectMedia(motherEmitter, jwt, options) {
  if (!options.includeMedia) {
    return { attachments: [], variantsByAttachmentId: {}, relationsByAttachmentId: {}, metadataByAttachmentId: {} };
  }

  const attachments = [];
  for (const status of options.mediaStatuses) {
    for (const visibility of options.mediaVisibilities) {
      attachments.push(...await collectPaged({
        motherEmitter,
        jwt,
        eventName: 'listMediaAttachments',
        moduleName: 'mediaManager',
        pageSize: MEDIA_PAGE_SIZE,
        baseParams: { status, visibility }
      }));
    }
  }

  const uniqueAttachments = uniqueBy(attachments, item => String(attachmentId(item) || `${item.source_module || item.sourceModule}:${item.source_id || item.sourceId}:${item.url}`));
  const variantsByAttachmentId = {};
  const relationsByAttachmentId = {};
  const metadataByAttachmentId = {};

  for (const attachment of uniqueAttachments) {
    const id = attachmentId(attachment);
    if (!id) continue;
    if (options.includeMediaVariants) {
      variantsByAttachmentId[id] = await emitCore(motherEmitter, jwt, 'listMediaVariants', 'mediaManager', { attachmentId: id });
    }
    if (options.includeMediaRelations) {
      relationsByAttachmentId[id] = await emitCore(motherEmitter, jwt, 'listContentForMedia', 'mediaManager', { attachmentId: id });
    }
    if (options.includeMetadata) {
      metadataByAttachmentId[id] = await emitCore(motherEmitter, jwt, 'getMetadata', 'metadataManager', {
        targetType: 'mediaAttachment',
        targetId: String(id),
        public: false,
        limit: 250
      });
    }
  }

  return {
    attachments: uniqueAttachments,
    variantsByAttachmentId,
    relationsByAttachmentId,
    metadataByAttachmentId
  };
}

async function buildBlogposterPackage({ motherEmitter, jwt, options, exporterName }) {
  const generatedAt = new Date().toISOString();
  const contentTypes = options.includeContentTypes
    ? await emitCore(motherEmitter, jwt, 'listContentTypes', 'contentEngine')
    : [];
  const entries = options.includeContent
    ? await collectContentEntries(motherEmitter, jwt, options)
    : [];
  const entryDetails = options.includeContent
    ? await collectEntryDetails(motherEmitter, jwt, entries, options)
    : { revisionsByEntryId: {}, metadataByEntryId: {} };
  const media = await collectMedia(motherEmitter, jwt, options);
  const settings = options.includeSettings
    ? await emitCore(motherEmitter, jwt, 'listSettings', 'settingsManager', { prefix: options.settingsPrefix })
    : [];
  const metaFields = options.includeMetadata
    ? await emitCore(motherEmitter, jwt, 'listMetaFields', 'metadataManager', { public: false, limit: 250 })
    : [];

  const manifest = {
    generator: 'BlogposterCMS',
    exporter: exporterName,
    format: 'blogposter-json',
    version: 1,
    generatedAt,
    counts: {
      contentTypes: contentTypes.length || 0,
      entries: entries.length,
      mediaAttachments: media.attachments.length,
      settings: settings.length || 0,
      metaFields: metaFields.length || 0
    }
  };

  return {
    manifest,
    data: {
      contentTypes: Array.isArray(contentTypes) ? contentTypes : [],
      entries,
      revisions: entryDetails.revisionsByEntryId,
      entryMetadata: entryDetails.metadataByEntryId,
      media,
      settings: Array.isArray(settings) ? settings : [],
      metaFields: Array.isArray(metaFields) ? metaFields : []
    }
  };
}

function settingsMap(rows = []) {
  return rows.reduce((acc, row) => {
    if (row && typeof row.key !== 'undefined') acc[row.key] = row.value;
    return acc;
  }, {});
}

function xmlEscape(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function cdata(value = '') {
  return `<![CDATA[${String(value ?? '').replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

function isoDate(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString();
}

function sqlDate(value) {
  const date = value ? new Date(value) : new Date();
  const valid = Number.isNaN(date.getTime()) ? new Date() : date;
  return valid.toISOString().slice(0, 19).replace('T', ' ');
}

function contentHtml(entry = {}) {
  const content = entry.content || {};
  if (typeof content === 'string') return content;
  if (content.html) return content.html;
  if (content.body) return content.body;
  if (content.text) return content.text;
  return '';
}

function wordpressStatus(status = 'draft') {
  const map = {
    published: 'publish',
    scheduled: 'future',
    deleted: 'trash',
    archived: 'trash',
    private: 'private',
    review: 'pending',
    draft: 'draft'
  };
  return map[String(status || '').toLowerCase()] || 'draft';
}

function wordpressPostType(entry = {}) {
  const key = entry.content_type_key || entry.contentTypeKey || 'post';
  return key === 'page' ? 'page' : key;
}

function wxrItem(entry, packageData, siteUrl) {
  const id = entryId(entry);
  const permalink = entry.permalink || '';
  const link = siteUrl && permalink ? `${siteUrl}${permalink.startsWith('/') ? permalink : `/${permalink}`}` : permalink;
  const metadata = packageData.data.entryMetadata[id] || [];
  const postMeta = metadata.map(meta => [
    '    <wp:postmeta>',
    `      <wp:meta_key>${xmlEscape(meta.meta_key || meta.metaKey || meta.key || '')}</wp:meta_key>`,
    `      <wp:meta_value>${cdata(typeof meta.value === 'string' ? meta.value : JSON.stringify(meta.value ?? ''))}</wp:meta_value>`,
    '    </wp:postmeta>'
  ].join('\n'));

  return [
    '  <item>',
    `    <title>${xmlEscape(entry.title || '')}</title>`,
    `    <link>${xmlEscape(link)}</link>`,
    `    <pubDate>${xmlEscape(isoDate(entry.published_at || entry.publishedAt || entry.updated_at || entry.created_at))}</pubDate>`,
    `    <dc:creator>${cdata(entry.author_id || entry.authorId || 'admin')}</dc:creator>`,
    `    <guid isPermaLink="false">${xmlEscape(`blogposter:content:${id || entry.slug || ''}`)}</guid>`,
    '    <description></description>',
    `    <content:encoded>${cdata(contentHtml(entry))}</content:encoded>`,
    `    <excerpt:encoded>${cdata(entry.excerpt || '')}</excerpt:encoded>`,
    `    <wp:post_id>${xmlEscape(id || '')}</wp:post_id>`,
    `    <wp:post_date>${xmlEscape(sqlDate(entry.created_at || entry.createdAt))}</wp:post_date>`,
    `    <wp:post_date_gmt>${xmlEscape(sqlDate(entry.created_at || entry.createdAt))}</wp:post_date_gmt>`,
    '    <wp:comment_status>open</wp:comment_status>',
    '    <wp:ping_status>closed</wp:ping_status>',
    `    <wp:post_name>${xmlEscape(entry.slug || '')}</wp:post_name>`,
    `    <wp:status>${xmlEscape(wordpressStatus(entry.status))}</wp:status>`,
    `    <wp:post_parent>${xmlEscape(entry.parent_id || entry.parentId || 0)}</wp:post_parent>`,
    '    <wp:menu_order>0</wp:menu_order>',
    `    <wp:post_type>${xmlEscape(wordpressPostType(entry))}</wp:post_type>`,
    '    <wp:post_password></wp:post_password>',
    '    <wp:is_sticky>0</wp:is_sticky>',
    ...postMeta,
    '  </item>'
  ].join('\n');
}

function buildWordpressWxr(packageData, options) {
  const settings = settingsMap(packageData.data.settings);
  const siteUrl = options.siteUrl || String(settings.SITE_URL || settings.HOME_URL || '').replace(/\/+$/g, '');
  const title = settings.SITE_TITLE || 'Blogposter Export';
  const description = settings.SITE_DESCRIPTION || '';
  const language = settings.DEFAULT_LANGUAGE || options.language || 'en';
  const itemNodes = packageData.data.entries.map(entry => wxrItem(entry, packageData, siteUrl)).join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8" ?>',
    '<rss version="2.0"',
    '  xmlns:excerpt="http://wordpress.org/export/1.2/excerpt/"',
    '  xmlns:content="http://purl.org/rss/1.0/modules/content/"',
    '  xmlns:wfw="http://wellformedweb.org/CommentAPI/"',
    '  xmlns:dc="http://purl.org/dc/elements/1.1/"',
    '  xmlns:wp="http://wordpress.org/export/1.2/">',
    '<channel>',
    `  <title>${xmlEscape(title)}</title>`,
    `  <link>${xmlEscape(siteUrl)}</link>`,
    `  <description>${xmlEscape(description)}</description>`,
    `  <pubDate>${xmlEscape(isoDate(packageData.manifest.generatedAt))}</pubDate>`,
    `  <language>${xmlEscape(language)}</language>`,
    '  <wp:wxr_version>1.2</wp:wxr_version>',
    `  <wp:base_site_url>${xmlEscape(siteUrl)}</wp:base_site_url>`,
    `  <wp:base_blog_url>${xmlEscape(siteUrl)}</wp:base_blog_url>`,
    itemNodes,
    '</channel>',
    '</rss>'
  ].filter(Boolean).join('\n');
}

async function exportBlogposterJson({ motherEmitter, jwt, options }) {
  const normalized = normalizeExportOptions(options, {
    includeRevisions: true,
    statuses: DEFAULT_CONTENT_STATUSES
  });
  const packageData = await buildBlogposterPackage({
    motherEmitter,
    jwt,
    options: normalized,
    exporterName: 'blogposterJson'
  });
  const fileName = normalized.fileName || `blogposter-export-${packageData.manifest.generatedAt.slice(0, 10)}.json`;
  const content = JSON.stringify(packageData, null, 2);

  return {
    exporter: 'blogposterJson',
    format: 'blogposter-json',
    mimeType: 'application/json',
    fileName,
    generatedAt: packageData.manifest.generatedAt,
    manifest: packageData.manifest,
    data: packageData.data,
    content
  };
}

async function exportWordpressWxr({ motherEmitter, jwt, options }) {
  const normalized = normalizeExportOptions(options, {
    includeMedia: false,
    includeMediaVariants: false,
    includeMediaRelations: false,
    includeRevisions: false,
    includeMetadata: true,
    statuses: ['published']
  });
  const packageData = await buildBlogposterPackage({
    motherEmitter,
    jwt,
    options: normalized,
    exporterName: 'wordpressWxr'
  });
  const content = buildWordpressWxr(packageData, normalized);
  const fileName = normalized.fileName || `wordpress-export-${packageData.manifest.generatedAt.slice(0, 10)}.xml`;

  return {
    exporter: 'wordpressWxr',
    format: 'wordpress-wxr',
    mimeType: 'application/xml',
    fileName,
    generatedAt: packageData.manifest.generatedAt,
    manifest: {
      ...packageData.manifest,
      format: 'wordpress-wxr'
    },
    content
  };
}

const EXPORTERS = Object.freeze({
  blogposterJson: Object.freeze({
    name: 'blogposterJson',
    label: 'Blogposter JSON',
    description: 'Full BlogposterCMS backup package with content, media, settings and metadata.',
    formats: ['application/json'],
    run: exportBlogposterJson
  }),
  wordpressWxr: Object.freeze({
    name: 'wordpressWxr',
    label: 'WordPress WXR',
    description: 'WordPress-compatible XML export for published content.',
    formats: ['application/xml'],
    run: exportWordpressWxr
  })
});

const EXPORTER_ALIASES = Object.freeze({
  json: 'blogposterJson',
  blogposter: 'blogposterJson',
  blogposterJson: 'blogposterJson',
  wordpress: 'wordpressWxr',
  wxr: 'wordpressWxr',
  wordpressWxr: 'wordpressWxr'
});

function resolveExporterName(raw) {
  const key = String(raw || 'blogposterJson').trim();
  return EXPORTER_ALIASES[key] || key;
}

function listExporterMetadata() {
  return Object.values(EXPORTERS).map(({ name, label, description, formats }) => ({
    name,
    label,
    description,
    formats
  }));
}

function setupExportEvents(motherEmitter) {
  motherEmitter.on('listExporters', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'listExporters');
      requirePermission(payload, 'exporters.list');
      callback(null, listExporterMetadata());
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('runExport', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertCorePayload(payload, 'runExport');
      requirePermission(payload, 'exporters.run');
      const exporterName = resolveExporterName(payload.exporterName || payload.exporter || payload.format);
      const exporter = EXPORTERS[exporterName];
      if (!exporter) throw new Error(`Unknown exporter: ${exporterName}`);
      const options = sanitizeRunExportOptions(payload.options || {});
      const result = await exporter.run({
        motherEmitter,
        jwt: payload.jwt,
        options
      });
      callback(null, result);
    } catch (err) {
      callback(err);
    }
  });
}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt }) {
    if (!isCore) {
      throw new Error('[EXPORT MANAGER] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[EXPORT MANAGER] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[EXPORT MANAGER] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[EXPORT MANAGER] Initializing...');
    setupExportEvents(motherEmitter);
    console.log('[EXPORT MANAGER] Ready.');
  },
  setupExportEvents,
  _internals: {
    buildWordpressWxr,
    normalizeExportOptions,
    sanitizeExportFileName,
    sanitizeRunExportOptions,
    sanitizeSiteUrl,
    resolveExporterName,
    listExporterMetadata
  }
};
