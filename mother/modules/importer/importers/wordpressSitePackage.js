'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const wordpressImporter = require('./wordpress');
const { buildDesignerDraft } = require('./wordpressVisualMapper');
const { extractStyleHints } = require('./wordpressStyleHints');
const { buildBehaviorHints } = require('./wordpressBehaviorHints');

const PACKAGE_FORMATS = new Set([
  'blogposter-wordpress-site-package',
  'wordpress-site-package',
  'wordpressSitePackage'
]);
const STATUS_MAP = {
  publish: 'published',
  published: 'published',
  private: 'private',
  draft: 'draft',
  pending: 'draft',
  future: 'scheduled',
  scheduled: 'scheduled'
};
const REMOTE_URL_PATTERN = /^(?:https?:)?\/\//i;
const UNSAFE_URL_PATTERN = /^(?:javascript|data|vbscript):/i;

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'undefined' || value === null) return [];
  return [value];
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeSlug(raw, fallback = 'imported-page') {
  const slug = String(raw || fallback)
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^https?:\/\/[^/]+/i, '')
    .split(/[?#]/)[0]
    .split('/')
    .map(part => part.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('/')
    .slice(0, 160);
  return slug || fallback;
}

function normalizeStatus(raw) {
  const key = String(raw || '').trim().toLowerCase();
  return STATUS_MAP[key] || 'draft';
}

function normalizeLanguage(raw, fallback = 'en') {
  const value = String(raw || fallback || 'en').trim().replace(/_/g, '-').toLowerCase();
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(value) ? value : 'en';
}

function normalizeOptionalLanguage(raw) {
  const value = String(raw || '').trim().replace(/_/g, '-').toLowerCase();
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(value) ? value : '';
}

function toPackagePath(raw, label) {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const normalized = raw.trim().replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (
    normalized.includes('\0') ||
    normalized.startsWith('/') ||
    /^[A-Za-z]:/.test(normalized) ||
    REMOTE_URL_PATTERN.test(normalized) ||
    normalized.split('/').some(part => part === '..')
  ) {
    throw new Error(`[wordpressSitePackage] ${label} must be a safe relative package path.`);
  }
  return normalized;
}

function pathFromEntry(value, keys, label) {
  if (typeof value === 'string') return toPackagePath(value, label);
  if (!isPlainObject(value)) return '';
  for (const key of keys) {
    if (typeof value[key] === 'string') return toPackagePath(value[key], `${label}.${key}`);
  }
  return '';
}

function textFromEntry(value, keys) {
  if (typeof value === 'string') return value;
  if (!isPlainObject(value)) return '';
  for (const key of keys) {
    if (typeof value[key] === 'string') return value[key];
  }
  return '';
}

function assetPaths(values, label) {
  return asArray(values)
    .map((value, index) => {
      const raw = typeof value === 'string'
        ? value
        : isPlainObject(value)
          ? textFromEntry(value, ['path', 'file', 'href', 'src'])
          : '';
      if (!raw) return '';
      const trimmed = raw.trim();
      if (REMOTE_URL_PATTERN.test(trimmed) || UNSAFE_URL_PATTERN.test(trimmed)) return trimmed;
      return toPackagePath(trimmed, `${label}[${index}]`);
    })
    .filter(Boolean);
}

async function createDirectoryReader(rootDir) {
  const root = path.resolve(rootDir);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  async function resolvePackagePath(relativePath) {
    const clean = toPackagePath(relativePath, 'package path');
    const target = path.resolve(root, clean);
    const compareRoot = process.platform === 'win32' ? root.toLowerCase() : root;
    const comparePrefix = process.platform === 'win32' ? rootPrefix.toLowerCase() : rootPrefix;
    const compareTarget = process.platform === 'win32' ? target.toLowerCase() : target;
    if (compareTarget !== compareRoot && !compareTarget.startsWith(comparePrefix)) {
      throw new Error(`[wordpressSitePackage] package path escapes source directory: ${clean}`);
    }
    return target;
  }

  return {
    type: 'directory',
    root,
    async has(relativePath) {
      return fs.existsSync(await resolvePackagePath(relativePath));
    },
    async readText(relativePath) {
      return fs.promises.readFile(await resolvePackagePath(relativePath), 'utf8');
    },
    async readBuffer(relativePath) {
      return fs.promises.readFile(await resolvePackagePath(relativePath));
    }
  };
}

function createZipReader(zipPath) {
  const zip = new AdmZip(zipPath);
  const entries = new Map();
  for (const entry of zip.getEntries()) {
    if (!entry.isDirectory) entries.set(entry.entryName.replace(/\\/g, '/'), entry);
  }

  return {
    type: 'zip',
    root: path.resolve(zipPath),
    async has(relativePath) {
      return entries.has(toPackagePath(relativePath, 'package path'));
    },
    async readText(relativePath) {
      const clean = toPackagePath(relativePath, 'package path');
      const entry = entries.get(clean);
      if (!entry) throw new Error(`[wordpressSitePackage] missing package file: ${clean}`);
      return entry.getData().toString('utf8');
    },
    async readBuffer(relativePath) {
      const clean = toPackagePath(relativePath, 'package path');
      const entry = entries.get(clean);
      if (!entry) throw new Error(`[wordpressSitePackage] missing package file: ${clean}`);
      return entry.getData();
    }
  };
}

async function createPackageReader(options = {}) {
  const packagePath = options.packageDir || options.sourceDir || options.dir || options.path || options.filePath || options.zipPath;
  if (!packagePath && isPlainObject(options.manifest)) {
    return null;
  }
  if (!packagePath) {
    throw new Error('[wordpressSitePackage] Pass options.packageDir, options.sourceDir, options.filePath, options.zipPath or options.manifest.');
  }

  const resolved = path.resolve(packagePath);
  const stat = await fs.promises.stat(resolved);
  if (stat.isDirectory()) return createDirectoryReader(resolved);
  if (stat.isFile() && /\.zip$/i.test(resolved)) return createZipReader(resolved);
  throw new Error(`[wordpressSitePackage] Unsupported package source: ${resolved}`);
}

async function loadManifest(reader, options = {}) {
  if (isPlainObject(options.manifest)) return options.manifest;
  const manifestPath = toPackagePath(options.manifestPath || 'manifest.json', 'options.manifestPath');
  const raw = await reader.readText(manifestPath);
  return JSON.parse(raw);
}

function validateManifest(manifest) {
  if (!isPlainObject(manifest)) {
    throw new Error('[wordpressSitePackage] manifest must be an object.');
  }
  const format = manifest.format || manifest.packageFormat || manifest.type;
  if (!PACKAGE_FORMATS.has(format)) {
    throw new Error(`[wordpressSitePackage] unsupported package format: ${format || 'missing'}`);
  }
}

function themeStylePaths(theme) {
  return [
    ...assetPaths(theme.styles || theme.globalStyles || theme.css, 'theme.styles'),
    ...assetPaths(theme.assets?.css, 'theme.assets.css'),
    ...assetPaths(theme.assets?.scss, 'theme.assets.scss')
  ].filter((item, index, all) => all.indexOf(item) === index);
}

function inspectThemePolicy(theme = {}) {
  const blocked = [];
  const warnings = [];
  const stylePaths = themeStylePaths(theme);
  const scriptPaths = [
    ...assetPaths(theme.scripts || theme.js || theme.javascript, 'theme.scripts'),
    ...assetPaths(theme.assets?.js, 'theme.assets.js')
  ];

  for (const scriptPath of scriptPaths) {
    blocked.push(`THEME_SCRIPT_ASSET: ${scriptPath} - themes cannot carry JavaScript behavior`);
  }
  for (const stylePath of stylePaths) {
    if (REMOTE_URL_PATTERN.test(stylePath) || UNSAFE_URL_PATTERN.test(stylePath)) {
      blocked.push(`THEME_UNSAFE_STYLE_ASSET: ${stylePath} - theme styles must be local presentation assets`);
    }
  }
  if (scriptPaths.length) {
    warnings.push('Theme scripts were found in the site package and must be converted to widgets, modules or apps.');
  }

  return {
    blocked,
    warnings,
    styles: stylePaths,
    scripts: scriptPaths
  };
}

async function pageHtmlInfo(page, reader) {
  const htmlPath = pathFromEntry(
    page.rendered || page,
    ['htmlPath', 'renderedHtmlPath', 'file', 'path'],
    `pages.${page.slug || page.title || 'page'}.html`
  );
  const inlineHtml = textFromEntry(page.rendered || page, ['html', 'renderedHtml']);
  const normalizedSource = page.normalized || page.mapping?.normalized || page;
  const normalizedHtmlPath = pathFromEntry(
    normalizedSource,
    ['htmlPath', 'normalizedHtmlPath', 'file', 'path'],
    `pages.${page.slug || page.title || 'page'}.normalizedHtml`
  );
  const inlineNormalizedHtml = textFromEntry(normalizedSource, ['html', 'normalizedHtml']);
  const sourcePath = pathFromEntry(
    page.normalized || page.mapping?.source || page.source || {},
    ['sourcePath', 'sourceJsonPath', 'metadataPath', 'path', 'file'],
    `pages.${page.slug || page.title || 'page'}.source`
  );
  const hasPath = Boolean(htmlPath);
  const hasInline = Boolean(inlineHtml);
  const hasNormalizedPath = Boolean(normalizedHtmlPath);
  const hasInlineNormalized = Boolean(inlineNormalizedHtml);
  let sizeBytes = hasInline ? Buffer.byteLength(inlineHtml, 'utf8') : 0;
  let normalizedSizeBytes = hasInlineNormalized ? Buffer.byteLength(inlineNormalizedHtml, 'utf8') : 0;
  if (!sizeBytes && hasPath && reader && await reader.has(htmlPath)) {
    const html = await reader.readText(htmlPath);
    sizeBytes = Buffer.byteLength(html, 'utf8');
  }
  if (!normalizedSizeBytes && hasNormalizedPath && reader && await reader.has(normalizedHtmlPath)) {
    const html = await reader.readText(normalizedHtmlPath);
    normalizedSizeBytes = Buffer.byteLength(html, 'utf8');
  }
  return {
    htmlPath,
    hasRenderedHtml: hasInline || hasPath,
    renderedHtmlBytes: sizeBytes,
    normalizedHtmlPath,
    sourcePath,
    hasNormalizedHtml: hasInlineNormalized || hasNormalizedPath,
    normalizedHtmlBytes: normalizedSizeBytes
  };
}

function normalizeWordPressTerm(term = {}) {
  if (!isPlainObject(term)) return null;
  const name = String(term.name || '').trim();
  const slug = normalizeSlug(term.slug || name || term.sourceId || '', '');
  const wpDomain = String(term.wpDomain || term.taxonomy || term.domain || '').trim();
  if (!slug && !name) return null;
  return {
    wpDomain,
    sourceId: String(term.sourceId || term.termId || term.term_id || ''),
    slug,
    name: name || slug,
    parentSlug: normalizeSlug(term.parentSlug || term.parent || '', ''),
    description: String(term.description || '')
  };
}

function normalizeWordPressSeo(source = {}) {
  const seo = isPlainObject(source.seo) ? source.seo : {};
  return {
    title: String(seo.title || source.seoTitle || '').trim(),
    description: String(seo.description || seo.metaDescription || source.metaDescription || '').trim(),
    canonicalUrl: String(seo.canonicalUrl || seo.canonical || source.canonicalUrl || source.url || '').trim(),
    robots: String(seo.robots || '').trim(),
    ogImage: String(seo.ogImage || seo.openGraphImage || '').trim()
  };
}

function normalizeSourceMetadata(source = {}, fallbackPage = {}) {
  const postId = String(source.postId || source.ID || source.id || '').trim();
  const parentId = String(source.parentId || source.postParent || source.post_parent || '').trim();
  const parentSourceId = String(source.parentSourceId || source.parentSource || (parentId && parentId !== '0' ? `wp-post-${parentId}` : '')).trim();
  const terms = asArray(source.terms).map(normalizeWordPressTerm).filter(Boolean);
  const language = normalizeOptionalLanguage(source.language || source.lang || source.locale);
  const translation = isPlainObject(source.translation) ? source.translation : null;
  const metaKeys = asArray(source.metaKeys).map(item => String(item || '')).filter(Boolean);
  const meta = isPlainObject(source.meta) ? source.meta : {};

  return {
    postId,
    postType: String(source.postType || fallbackPage.contentType || fallbackPage.type || 'page'),
    parentId: parentId && parentId !== '0' ? parentId : '',
    parentSourceId,
    menuOrder: Number(source.menuOrder ?? source.menu_order ?? 0) || 0,
    template: String(source.template || ''),
    builder: String(source.builder || 'unknown'),
    status: String(source.status || fallbackPage.status || ''),
    slug: String(source.slug || ''),
    url: String(source.url || fallbackPage.url || ''),
    publishedAt: String(source.publishedAt || source.published_at || ''),
    modifiedAt: String(source.modifiedAt || source.modified_at || ''),
    author: isPlainObject(source.author) ? source.author : {},
    excerpt: String(source.excerpt || ''),
    featuredMedia: isPlainObject(source.featuredMedia) ? source.featuredMedia : null,
    terms,
    language,
    ...(translation ? { translation } : {}),
    seo: normalizeWordPressSeo(source),
    metaKeys,
    meta
  };
}

async function readPageSourceMetadata(page, htmlInfo, reader, index) {
  const warnings = [];
  let source = {};
  if (isPlainObject(page.source) && !page.source.sourcePath && !page.source.path && !page.source.file) {
    source = page.source;
  }

  if (htmlInfo.sourcePath && reader) {
    try {
      if (await reader.has(htmlInfo.sourcePath)) {
        const raw = await reader.readText(htmlInfo.sourcePath);
        const parsed = JSON.parse(raw);
        if (isPlainObject(parsed)) {
          source = { ...source, ...parsed };
        } else {
          warnings.push(`pages[${index}].source metadata was ignored because it is not an object.`);
        }
      }
    } catch (err) {
      warnings.push(`pages[${index}].source metadata could not be read: ${err.message}`);
    }
  }

  return {
    source,
    wordpress: normalizeSourceMetadata(source, page),
    warnings
  };
}

async function normalizePage(page, index, reader, defaultLanguage = 'en') {
  const title = String(page.title || page.name || `Imported page ${index + 1}`).trim();
  const titleFallbackSlug = normalizeSlug(title, `page-${index + 1}`);
  const slug = normalizeSlug(page.slug || page.path || page.url || '', titleFallbackSlug);
  const scripts = [
    ...assetPaths(page.scripts || page.js || page.javascript, `pages[${index}].scripts`),
    ...assetPaths(page.rendered?.scripts, `pages[${index}].rendered.scripts`)
  ];
  const styles = [
    ...assetPaths(page.styles || page.css, `pages[${index}].styles`),
    ...assetPaths(page.rendered?.styles, `pages[${index}].rendered.styles`)
  ];
  const media = assetPaths(page.media || page.assets?.media || page.rendered?.media, `pages[${index}].media`);
  const html = await pageHtmlInfo(page, reader);
  const sourceMetadata = await readPageSourceMetadata(page, html, reader, index);
  const mapperHints = isPlainObject(page.mapping?.mapperHints) ? page.mapping.mapperHints : {};
  const mappingSource = {
    ...(sourceMetadata.wordpress.builder ? { builder: sourceMetadata.wordpress.builder } : {}),
    ...(sourceMetadata.wordpress.postType ? { postType: sourceMetadata.wordpress.postType } : {}),
    ...(sourceMetadata.wordpress.template ? { template: sourceMetadata.wordpress.template } : {}),
    ...(isPlainObject(page.mapping?.source) ? page.mapping.source : {})
  };
  const language = normalizeLanguage(
    page.language || page.locale || page.lang || sourceMetadata.wordpress.language,
    defaultLanguage
  );

  return {
    sourceId: String(page.sourceId || page.id || slug),
    title,
    slug,
    url: String(page.url || sourceMetadata.wordpress.url || ''),
    status: normalizeStatus(page.status || sourceMetadata.wordpress.status),
    language,
    contentType: String(page.contentType || page.type || sourceMetadata.wordpress.postType || 'page'),
    parentSourceId: sourceMetadata.wordpress.parentSourceId,
    menuOrder: sourceMetadata.wordpress.menuOrder,
    publishedAt: sourceMetadata.wordpress.publishedAt,
    modifiedAt: sourceMetadata.wordpress.modifiedAt,
    excerpt: sourceMetadata.wordpress.excerpt,
    wordpress: {
      ...sourceMetadata.wordpress,
      language: sourceMetadata.wordpress.language || language
    },
    ...html,
    styles,
    scripts,
    media,
    mapping: {
      confidence: Number.isFinite(Number(page.mapping?.confidence)) ? Number(page.mapping.confidence) : null,
      nativeWidgets: asArray(page.mapping?.nativeWidgets),
      mapperHints,
      source: mappingSource,
      fallback: page.mapping?.fallback || (
        html.hasNormalizedHtml
          ? (scripts.length ? 'normalized-html-with-rendered-js-reference' : 'normalized-html')
          : (scripts.length ? 'rendered-html-with-blocked-scripts' : 'rendered-html')
      )
    },
    warnings: [
      ...sourceMetadata.warnings,
      ...(scripts.length
        ? [`${scripts.length} page script asset(s) kept as blocked behavior; move them into widgets, modules or apps.`]
        : [])
    ]
  };
}

function normalizeMedia(media, index) {
  const filePath = pathFromEntry(media, ['path', 'file', 'storagePath'], `media[${index}].path`);
  return {
    sourceId: String(media.sourceId || media.id || filePath || `media-${index + 1}`),
    fileName: String(media.fileName || path.basename(filePath) || `media-${index + 1}`),
    path: filePath,
    url: String(media.url || media.originalUrl || ''),
    mimeType: String(media.mimeType || media.type || ''),
    title: String(media.title || ''),
    altText: String(media.altText || media.alt || ''),
    caption: String(media.caption || ''),
    description: String(media.description || '')
  };
}

function assetKindFromPathOrMime(filePath = '', mimeType = '', fallback = 'asset') {
  const normalizedFallback = normalizeAssetKind(fallback);
  const ext = path.extname(String(filePath || '')).toLowerCase();
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.avif'].includes(ext)) return 'media';
  if (mime === 'text/css' || ext === '.css') return 'styles';
  if (mime.includes('javascript') || ['.js', '.mjs'].includes(ext)) return 'scripts';
  if (mime.startsWith('font/') || ['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) return 'fonts';
  return normalizedFallback || 'asset';
}

function normalizeAssetKind(value = '') {
  const kind = String(value || '').trim().toLowerCase();
  if (['style', 'styles', 'css', 'scss'].includes(kind)) return 'styles';
  if (['script', 'scripts', 'js', 'javascript', 'module'].includes(kind)) return 'scripts';
  if (['image', 'images', 'media', 'icon', 'icons'].includes(kind)) return 'media';
  if (['font', 'fonts', 'webfont', 'webfonts'].includes(kind)) return 'fonts';
  return kind || 'asset';
}

function normalizePackageAsset(asset, index, fallbackKind = 'asset') {
  const filePath = pathFromEntry(asset, ['path', 'file', 'storagePath', 'href', 'src'], `assets[${index}].path`);
  const mimeType = String(asset.mimeType || asset.type || '');
  const explicitKind = normalizeAssetKind(asset.kind || asset.assetKind || '');
  return {
    sourceId: String(asset.sourceId || asset.id || filePath || `asset-${index + 1}`),
    fileName: String(asset.fileName || path.basename(filePath) || `asset-${index + 1}`),
    path: filePath,
    url: String(asset.url || asset.originalUrl || ''),
    mimeType,
    kind: explicitKind || assetKindFromPathOrMime(filePath, mimeType, fallbackKind),
    title: String(asset.title || ''),
    role: String(asset.role || '')
  };
}

function normalizePackageAssets(manifest = {}) {
  const rawAssets = manifest.assets;
  if (Array.isArray(rawAssets)) {
    return rawAssets
      .filter(isPlainObject)
      .map((asset, index) => normalizePackageAsset(asset, index));
  }
  if (!isPlainObject(rawAssets)) return [];

  const assets = [];
  for (const [kind, values] of Object.entries(rawAssets)) {
    for (const value of asArray(values)) {
      if (typeof value === 'string') {
        assets.push(normalizePackageAsset({ path: value, kind }, assets.length, kind));
      } else if (isPlainObject(value)) {
        assets.push(normalizePackageAsset({ kind, ...value }, assets.length, kind));
      }
    }
  }
  return assets;
}

function dedupeByPath(items = []) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    if (!item?.path || seen.has(item.path)) continue;
    seen.add(item.path);
    result.push(item);
  }
  return result;
}

function orderPagesByParent(pages = []) {
  const bySourceId = new Map(pages.map(page => [String(page.sourceId || ''), page]).filter(([sourceId]) => sourceId));
  const visited = new Set();
  const visiting = new Set();
  const ordered = [];

  function visit(page) {
    const sourceId = String(page.sourceId || '');
    if (!sourceId || visited.has(sourceId)) return;
    if (visiting.has(sourceId)) {
      ordered.push(page);
      visited.add(sourceId);
      return;
    }
    visiting.add(sourceId);
    const parent = page.parentSourceId ? bySourceId.get(String(page.parentSourceId)) : null;
    if (parent) visit(parent);
    visiting.delete(sourceId);
    if (!visited.has(sourceId)) {
      visited.add(sourceId);
      ordered.push(page);
    }
  }

  for (const page of pages) visit(page);
  return ordered;
}

function normalizeContent(content = {}) {
  const wxrPath = pathFromEntry(content.wxr || content, ['wxrPath', 'filePath', 'path', 'file'], 'content.wxr');
  return {
    wxrPath,
    records: asArray(content.records || content.items),
    posts: asArray(content.posts),
    pages: asArray(content.pages)
  };
}

async function readOptionalJsonReport(reader, rawPath, label) {
  if (!reader || typeof rawPath !== 'string' || !rawPath.trim()) {
    return { data: {}, warnings: [] };
  }
  try {
    const reportPath = toPackagePath(rawPath, label);
    if (!await reader.has(reportPath)) {
      return { data: {}, warnings: [`${label} was listed but missing from the package: ${reportPath}`] };
    }
    return { data: JSON.parse(await reader.readText(reportPath)), warnings: [] };
  } catch (err) {
    return { data: {}, warnings: [`${label} could not be read: ${err.message}`] };
  }
}

function formatExporterWarning(warning, index) {
  const code = String(warning.code || `BP_WP_EXPORT_WARNING_${index + 1}`).trim();
  const message = String(warning.message || warning.reason || 'WordPress exporter reported a package warning.').trim();
  const target = warning.postId
    ? ` post ${warning.postId}`
    : warning.url
      ? ` ${warning.url}`
      : '';
  return `${code}:${target} ${message}`.trim();
}

async function loadExporterReports(reader, manifestReports = {}) {
  const blockedBehaviorPath = typeof manifestReports.blockedBehavior === 'string'
    ? manifestReports.blockedBehavior
    : '';
  const blockedBehavior = await readOptionalJsonReport(reader, blockedBehaviorPath, 'reports.blockedBehavior');
  const blockedData = isPlainObject(blockedBehavior.data) ? blockedBehavior.data : {};

  return {
    warnings: blockedBehavior.warnings,
    blockedBehavior: blockedData,
    exporterWarnings: asArray(blockedData.warnings).filter(isPlainObject),
    remoteAssets: asArray(blockedData.remoteAssets).filter(isPlainObject)
  };
}

function uniqueLocalAssetPaths(plan = {}) {
  const paths = [];
  const add = value => {
    if (typeof value !== 'string' || !value.trim()) return;
    if (REMOTE_URL_PATTERN.test(value) || UNSAFE_URL_PATTERN.test(value)) return;
    paths.push(value);
  };
  for (const style of asArray(plan.theme?.styles)) add(style);
  for (const asset of asArray(plan.assets)) add(asset.path);
  for (const media of asArray(plan.media)) add(media.path);
  for (const page of asArray(plan.pages)) {
    for (const style of asArray(page.styles)) add(style);
    for (const script of asArray(page.scripts)) add(script);
    for (const media of asArray(page.media)) add(media);
  }
  return paths.filter((item, index, all) => all.indexOf(item) === index);
}

async function buildImportContext(options = {}) {
  const reader = await createPackageReader(options);
  const manifest = await loadManifest(reader, options);
  validateManifest(manifest);

  const themePolicy = inspectThemePolicy(manifest.theme || {});
  const defaultLanguage = normalizeLanguage(manifest.source?.language || manifest.site?.language || manifest.language, 'en');
  const pages = [];
  for (const [index, page] of asArray(manifest.pages).entries()) {
    if (isPlainObject(page)) pages.push(await normalizePage(page, index, reader, defaultLanguage));
  }
  const orderedPages = orderPagesByParent(pages);
  const media = asArray(manifest.media).filter(isPlainObject).map(normalizeMedia);
  const assets = dedupeByPath(normalizePackageAssets(manifest));
  const content = normalizeContent(manifest.content || {});
  const reportPaths = isPlainObject(manifest.reports) ? manifest.reports : {};
  const exporterReports = await loadExporterReports(reader, reportPaths);
  const styleHints = await extractStyleHints(reader, {
    theme: { styles: themePolicy.styles },
    pages
  });
  const warnings = [
    ...themePolicy.warnings,
    ...exporterReports.warnings,
    ...exporterReports.exporterWarnings.map(formatExporterWarning)
  ];
  if (exporterReports.remoteAssets.length) {
    warnings.push(`WordPress exporter reported ${exporterReports.remoteAssets.length} remote asset(s) that were not vendored into the package.`);
  }
  for (const page of pages) warnings.push(...page.warnings.map(warning => `${page.slug}: ${warning}`));
  warnings.push(...styleHints.warnings);

  const plan = {
    source: 'wordpressSitePackage',
    dryRun: options.dryRun !== false,
    package: {
      format: manifest.format || manifest.packageFormat || manifest.type,
      version: String(manifest.version || ''),
      generatedAt: String(manifest.generatedAt || ''),
      sourcePlatform: String(manifest.source?.platform || manifest.platform || 'wordpress'),
      siteUrl: String(manifest.source?.siteUrl || manifest.siteUrl || ''),
      language: defaultLanguage
    },
    installable: themePolicy.blocked.length === 0,
    policy: {
      blocked: themePolicy.blocked,
      warnings
    },
    theme: {
      name: String(manifest.theme?.name || manifest.site?.title || manifest.title || 'Imported WordPress Theme'),
      styles: themePolicy.styles,
      tokens: styleHints.tokens
    },
    styleHints,
    content,
    pages: orderedPages,
    assets,
    media,
    menus: asArray(manifest.menus),
    redirects: asArray(manifest.redirects),
    seo: isPlainObject(manifest.seo) ? manifest.seo : {},
    reports: {
      ...reportPaths,
      exporterWarnings: exporterReports.exporterWarnings,
      remoteAssets: exporterReports.remoteAssets,
      blockedBehavior: exporterReports.blockedBehavior
    },
    totals: {
      pages: orderedPages.length,
      renderedPages: orderedPages.filter(page => page.hasRenderedHtml).length,
      normalizedPages: orderedPages.filter(page => page.hasNormalizedHtml).length,
      pageScripts: orderedPages.reduce((total, page) => total + page.scripts.length, 0),
      nativeWidgetHints: orderedPages.reduce((total, page) => total + page.mapping.nativeWidgets.length, 0),
      themeStyles: themePolicy.styles.length,
      blockedThemeScripts: themePolicy.scripts.length,
      assets: assets.length,
      fonts: assets.filter(asset => asset.kind === 'fonts').length,
      media: media.length,
      contentRecords: content.records.length + content.posts.length + content.pages.length,
      menus: asArray(manifest.menus).length,
      redirects: asArray(manifest.redirects).length
    },
    warnings
  };

  return { reader, manifest, plan };
}

async function emitAsync(motherEmitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(eventName, payload, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function hashText(value = '') {
  return crypto.createHash('sha1').update(String(value)).digest('hex');
}

function resultId(result, keys, fallback = null) {
  for (const key of keys) {
    if (result && typeof result[key] !== 'undefined' && result[key] !== null) {
      return result[key];
    }
  }
  return fallback;
}

function canEmit(motherEmitter, eventName) {
  if (!motherEmitter) return false;
  if (typeof motherEmitter.listenerCount !== 'function') return true;
  return motherEmitter.listenerCount(eventName) > 0;
}

function resolveImportUserId(options = {}) {
  return options.userId ||
    options.decodedJWT?.user?.id ||
    options.decodedJWT?.userId ||
    options.decodedJWT?.id ||
    options.decodedJWT?.sub ||
    'wordpress-import';
}

function canUseMediaAssetPipeline(motherEmitter) {
  if (!motherEmitter || typeof motherEmitter.listenerCount !== 'function') return false;
  return motherEmitter.listenerCount('uploadFileToFolder') > 0 &&
    motherEmitter.listenerCount('makeFilePublic') > 0;
}

function cleanImportText(value = '', max = 500) {
  return String(value || '').replace(/[\x00-\x1F\x7F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeImportKey(value = '', fallback = 'import') {
  const key = cleanImportText(value || fallback, 160)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return key || fallback;
}

function normalizeImportPath(value = '', fallback = '/') {
  const raw = String(value || fallback || '/').trim();
  if (!raw) return '/';
  let pathValue = raw;
  if (/^https?:\/\//i.test(pathValue)) {
    try {
      pathValue = new URL(pathValue).pathname || '/';
    } catch {
      pathValue = fallback || '/';
    }
  }
  pathValue = pathValue.split('#')[0].split('?')[0].trim();
  if (!pathValue || pathValue === '/') return '/';
  return `/${pathValue.replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/')}`;
}

function isHttpUrl(value = '') {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function parseMetaObject(value) {
  if (isPlainObject(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeMenuLocations(menu = {}) {
  const rawLocations = [
    ...asArray(menu.locations),
    ...asArray(menu.themeLocations),
    ...asArray(menu.locationKeys),
    ...asArray(menu.locationKey || menu.location)
  ];
  const seen = new Set();
  const locations = [];

  for (const location of rawLocations) {
    const key = isPlainObject(location)
      ? normalizeImportKey(location.key || location.location || location.slug || location.name || location.label, '')
      : normalizeImportKey(location, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    locations.push({
      key,
      label: isPlainObject(location)
        ? cleanImportText(location.label || location.name || location.description || key, 160)
        : cleanImportText(location, 160) || key
    });
  }

  return locations;
}

function menuKey(menu = {}, index = 0, location = null) {
  const base = normalizeImportKey(menu.slug || menu.key || menu.name || `menu-${index + 1}`);
  return location?.key ? `wp-${base}-${location.key}` : `wp-${base}`;
}

function menuItemSourceId(item = {}, index = 0) {
  return firstString(item.id, item.ID, item.menuItemId, item.menu_item_id, item.dbId, item.db_id) || `item-${index + 1}`;
}

function menuItemParentSourceId(item = {}) {
  const raw = firstString(item.parentId, item.parent_id, item.menuItemParent, item.menu_item_parent, item.parent);
  return raw && raw !== '0' ? raw : '';
}

function normalizeMenuItemTarget(item = {}) {
  const object = cleanImportText(item.object || item.objectType || item.type || '', 80).toLowerCase();
  const objectId = firstString(item.objectId, item.object_id, item.postId, item.termId);
  if (object === 'page') return { type: 'page', sourceModule: 'wordpressSitePackage', sourceId: objectId ? `wp-post-${objectId}` : null };
  if (object === 'post') return { type: 'post', sourceModule: 'wordpressSitePackage', sourceId: objectId ? `wp-post-${objectId}` : null };
  if (['category', 'tag', 'taxonomy', 'archive'].includes(object)) {
    return { type: 'archive', sourceModule: 'wordpressSitePackage', sourceId: objectId ? `wp-term-${objectId}` : null };
  }
  return { type: 'custom', sourceModule: null, sourceId: null };
}

function normalizeMenuItemClasses(value) {
  return asArray(value)
    .map(item => cleanImportText(item, 80))
    .filter(Boolean)
    .join(' ')
    .slice(0, 240);
}

function normalizeMenuItems(menu = {}) {
  return asArray(menu.items)
    .filter(isPlainObject)
    .map((item, index) => {
      const sourceItemId = menuItemSourceId(item, index);
      const parentSourceId = menuItemParentSourceId(item);
      const target = normalizeMenuItemTarget(item);
      const objectId = firstString(item.objectId, item.object_id, item.postId, item.termId);
      return {
        type: target.type,
        title: cleanImportText(item.title || item.label || item.name || item.url || sourceItemId, 240),
        url: String(item.url || item.href || '').trim(),
        parentId: null,
        entryId: null,
        sourceModule: target.sourceModule,
        sourceId: target.sourceId,
        target: cleanImportText(item.target || '', 40),
        rel: cleanImportText(item.rel || item.xfn || '', 160),
        cssClass: cleanImportText(item.cssClass || item.css_class || normalizeMenuItemClasses(item.classes), 240),
        position: Number(item.menuOrder ?? item.menu_order ?? item.position ?? index) || 0,
        status: 'active',
        meta: {
          source: 'wordpressSitePackage',
          wordpress: {
            menuId: firstString(menu.id, menu.termId, menu.term_id),
            menuSlug: cleanImportText(menu.slug || menu.key || '', 120),
            itemId: sourceItemId,
            parentId: parentSourceId || null,
            object: cleanImportText(item.object || item.objectType || '', 120),
            objectId: objectId || null
          }
        }
      };
    })
    .sort((a, b) => a.position - b.position);
}

function sourceItemIdFromResult(item = {}) {
  const meta = parseMetaObject(item.meta);
  return firstString(meta.wordpress?.itemId, meta.wordpressItemId);
}

async function restoreMenuItemParents({ motherEmitter, base, insertedItems, originalItems }) {
  const warnings = [];
  if (!canEmit(motherEmitter, 'updateNavigationMenuItem')) {
    if (originalItems.some(item => item.meta?.wordpress?.parentId)) {
      warnings.push('Nested WordPress menu parents were kept as metadata because updateNavigationMenuItem is unavailable.');
    }
    return { updated: 0, warnings };
  }

  const dbIdBySourceId = new Map();
  for (const item of asArray(insertedItems)) {
    const sourceId = sourceItemIdFromResult(item);
    const dbId = resultId(item, ['itemId', 'id', '_id'], null);
    if (sourceId && dbId) dbIdBySourceId.set(String(sourceId), dbId);
  }

  let updated = 0;
  for (const item of originalItems) {
    const sourceId = String(item.meta?.wordpress?.itemId || '');
    const parentSourceId = String(item.meta?.wordpress?.parentId || '');
    if (!sourceId || !parentSourceId) continue;
    const itemId = dbIdBySourceId.get(sourceId);
    const parentId = dbIdBySourceId.get(parentSourceId);
    if (!itemId || !parentId) {
      warnings.push(`Skipped nested menu parent for WordPress item ${sourceId}: parent ${parentSourceId} was not returned by Navigation Manager.`);
      continue;
    }
    await emitAsync(motherEmitter, 'updateNavigationMenuItem', {
      ...base,
      itemId,
      parentId
    });
    updated += 1;
  }

  return { updated, warnings };
}

async function applyNavigationIfAvailable(context, options = {}) {
  const menus = asArray(context.plan.menus).filter(isPlainObject);
  const result = { skipped: false, menus: [], warnings: [] };
  if (!menus.length) return result;
  const { motherEmitter, jwt, decodedJWT } = options;
  if (!canEmit(motherEmitter, 'upsertNavigationMenu') || !canEmit(motherEmitter, 'setNavigationMenuItems')) {
    return {
      skipped: true,
      reason: 'navigation-manager-listener-missing',
      menus: [],
      warnings: ['Navigation Manager is unavailable; WordPress menus remain in the import plan metadata.']
    };
  }

  const base = { jwt, moduleName: 'navigationManager', moduleType: 'core', decodedJWT };
  for (const [index, menu] of menus.entries()) {
    const locations = normalizeMenuLocations(menu);
    const targets = locations.length ? locations : [null];
    for (const location of targets) {
      const key = menuKey(menu, index, location);
      try {
        if (location && canEmit(motherEmitter, 'registerNavigationLocation')) {
          await emitAsync(motherEmitter, 'registerNavigationLocation', {
            ...base,
            key: location.key,
            label: location.label,
            description: `Imported WordPress theme location ${location.key}.`
          });
        }
        const menuRecord = await emitAsync(motherEmitter, 'upsertNavigationMenu', {
          ...base,
          key,
          label: cleanImportText(menu.name || menu.label || menu.slug || key, 160),
          description: 'Imported from a WordPress visual site package.',
          locationKey: location?.key || ''
        });
        const menuId = resultId(menuRecord, ['menuId', 'id', '_id'], null);
        const items = normalizeMenuItems(menu);
        const setPayload = {
          ...base,
          ...(menuId ? { menuId } : { menuKey: key }),
          items
        };
        const setResult = await emitAsync(motherEmitter, 'setNavigationMenuItems', setPayload);
        const parentResult = await restoreMenuItemParents({
          motherEmitter,
          base,
          insertedItems: setResult?.items || [],
          originalItems: items
        });
        result.warnings.push(...parentResult.warnings);
        result.menus.push({
          sourceId: firstString(menu.id, menu.termId, menu.term_id, key),
          key,
          locationKey: location?.key || '',
          menuId,
          items: items.length,
          nestedItems: parentResult.updated,
          result: menuRecord
        });
      } catch (err) {
        result.warnings.push(`WordPress menu ${menu.name || menu.slug || index + 1} was not applied: ${err.message}`);
      }
    }
  }

  return result;
}

function pageSeoPath(page = {}) {
  return normalizeImportPath(page.url || page.slug || '/', '/');
}

async function applySeoIfAvailable(context, options = {}) {
  const seo = isPlainObject(context.plan.seo) ? context.plan.seo : {};
  const result = { skipped: false, defaults: null, pages: [], warnings: [] };
  const { motherEmitter, jwt, decodedJWT } = options;
  const canApplyPageSeo = canEmit(motherEmitter, 'upsertSeoMeta') && context.plan.pages.length > 0;
  const hasSeo = Object.keys(seo).length > 0 || canApplyPageSeo;
  if (!hasSeo) return result;
  if (!canEmit(motherEmitter, 'setSeoDefaults') && !canEmit(motherEmitter, 'upsertSeoMeta')) {
    return {
      skipped: true,
      reason: 'seo-manager-listener-missing',
      defaults: null,
      pages: [],
      warnings: ['SEO Manager is unavailable; WordPress SEO summary remains in the import plan metadata.']
    };
  }

  const base = { jwt, moduleName: 'seoManager', moduleType: 'core', decodedJWT };
  if (canEmit(motherEmitter, 'setSeoDefaults')) {
    try {
      result.defaults = await emitAsync(motherEmitter, 'setSeoDefaults', {
        ...base,
        title: cleanImportText(seo.homeTitle || context.manifest.site?.title || context.plan.theme.name, 240),
        description: cleanImportText(seo.homeDescription || context.manifest.site?.description || '', 500),
        robots: 'index,follow',
        meta: {
          source: 'wordpressSitePackage',
          frontPageId: seo.frontPageId || null,
          postsPageId: seo.postsPageId || null,
          permalinkStructure: seo.permalinkStructure || ''
        }
      });
    } catch (err) {
      result.warnings.push(`WordPress SEO defaults were not applied: ${err.message}`);
    }
  }

  if (!canEmit(motherEmitter, 'upsertSeoMeta')) return result;
  for (const page of context.plan.pages) {
    try {
      const pathKey = pageSeoPath(page);
      const pageSeo = page.wordpress?.seo || {};
      const pageResult = await emitAsync(motherEmitter, 'upsertSeoMeta', {
        ...base,
        path: pathKey,
        title: cleanImportText(pageSeo.title || page.title, 240),
        description: cleanImportText(pageSeo.description || page.excerpt || '', 500),
        canonicalUrl: isHttpUrl(pageSeo.canonicalUrl) ? pageSeo.canonicalUrl : (isHttpUrl(page.url) ? page.url : pathKey),
        robots: pageSeo.robots || (page.status === 'published' ? 'index,follow' : 'noindex,follow'),
        ogImage: pageSeo.ogImage || '',
        meta: {
          source: 'wordpressSitePackage',
          sourceId: page.sourceId,
          language: page.language || context.plan.package.language || 'en',
          wordpress: {
            postId: page.wordpress?.postId || '',
            terms: page.wordpress?.terms || []
          }
        }
      });
      result.pages.push({ sourceId: page.sourceId, path: pathKey, result: pageResult });
    } catch (err) {
      result.warnings.push(`WordPress SEO meta for ${page.slug} was not applied: ${err.message}`);
    }
  }

  return result;
}

function normalizeRedirectManifestRule(rule = {}, index = 0, defaultLanguage = '') {
  if (!isPlainObject(rule)) return null;
  const fromPath = firstString(rule.fromPath, rule.from_path, rule.from, rule.source, rule.sourceUrl, rule.source_url, rule.oldUrl, rule.old_url, rule.url);
  const toPath = firstString(rule.toPath, rule.to_path, rule.to, rule.target, rule.destination, rule.destinationUrl, rule.destination_url, rule.newUrl, rule.actionData, rule.action_data);
  if (!fromPath || !toPath) return null;
  const regex = rule.regex === true || rule.regex === 1 || rule.regex === '1';
  const statusText = cleanImportText(rule.status || '', 40).toLowerCase();
  const explicitLanguage = firstString(rule.language, rule.lang);
  return {
    fromPath,
    toPath,
    statusCode: Number(rule.statusCode || rule.status_code || rule.code || rule.actionCode || rule.action_code || 301) || 301,
    matchType: regex ? 'regex' : cleanImportText(rule.matchType || rule.match_type || 'exact', 20),
    priority: Number(rule.priority ?? rule.position ?? index) || 0,
    language: explicitLanguage ? normalizeLanguage(explicitLanguage, defaultLanguage || 'en') : '',
    active: !(rule.active === false || statusText === 'disabled' || statusText === 'inactive'),
    meta: {
      source: 'wordpressSitePackage',
      wordpress: rule
    }
  };
}

async function applyRedirectsIfAvailable(context, options = {}) {
  const redirects = asArray(context.plan.redirects).filter(isPlainObject);
  const result = { skipped: false, rules: [], warnings: [] };
  if (!redirects.length) return result;
  const { motherEmitter, jwt, decodedJWT } = options;
  if (!canEmit(motherEmitter, 'upsertRedirectRule')) {
    return {
      skipped: true,
      reason: 'redirect-manager-listener-missing',
      rules: [],
      warnings: ['Redirect Manager is unavailable; WordPress redirects remain in the import plan metadata.']
    };
  }

  const base = { jwt, moduleName: 'redirectManager', moduleType: 'core', decodedJWT };
  for (const [index, redirect] of redirects.entries()) {
    const rule = normalizeRedirectManifestRule(redirect, index, context.plan.package.language);
    if (!rule) {
      result.warnings.push(`Skipped WordPress redirect ${index + 1}: source or target path missing.`);
      continue;
    }
    try {
      const applied = await emitAsync(motherEmitter, 'upsertRedirectRule', {
        ...base,
        ...rule
      });
      result.rules.push({ fromPath: rule.fromPath, toPath: rule.toPath, result: applied });
    } catch (err) {
      result.warnings.push(`WordPress redirect ${rule.fromPath} was not applied: ${err.message}`);
    }
  }

  return result;
}

async function materializePackageAssets(context, options = {}) {
  const { motherEmitter, jwt } = options;
  const assetUrlMap = {};
  const warnings = [];
  if (!canUseMediaAssetPipeline(motherEmitter)) {
    return { assetUrlMap, warnings: ['Media asset pipeline unavailable; package asset paths were left unchanged.'] };
  }

  const decodedJWT = options.decodedJWT || { permissions: { '*': true } };
  const packageHash = hashText([
    context.plan.package.siteUrl,
    context.plan.package.generatedAt,
    context.reader?.root || 'manifest'
  ].filter(Boolean).join('|')).slice(0, 12);
  const subPath = `builder/imports/wordpressSitePackage/${packageHash}`;
  const userId = resolveImportUserId(options);

  for (const assetPath of uniqueLocalAssetPaths(context.plan)) {
    try {
      if (!context.reader || !await context.reader.has(assetPath)) {
        warnings.push(`Skipped package asset ${assetPath}: file missing.`);
        continue;
      }
      const buffer = await context.reader.readBuffer(assetPath);
      const fileName = `${hashText(assetPath).slice(0, 10)}-${path.basename(assetPath)}`;
      const uploaded = await emitAsync(motherEmitter, 'uploadFileToFolder', {
        jwt,
        moduleName: 'mediaManager',
        moduleType: 'core',
        decodedJWT,
        subPath,
        fileName,
        fileData: buffer.toString('base64')
      });
      const finalName = uploaded?.fileName || fileName;
      const published = await emitAsync(motherEmitter, 'makeFilePublic', {
        jwt,
        moduleName: 'mediaManager',
        moduleType: 'core',
        decodedJWT,
        userId,
        filePath: `${subPath}/${finalName}`
      });
      if (published?.shareLink) {
        assetUrlMap[assetPath] = published.shareLink;
      } else {
        warnings.push(`Published package asset ${assetPath} without a share link.`);
      }
    } catch (err) {
      warnings.push(`Failed to materialize package asset ${assetPath}: ${err.message}`);
    }
  }

  return { assetUrlMap, warnings };
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function rewritePackageAssetReferences(content = '', assetUrlMap = {}) {
  let output = String(content || '');
  for (const [assetPath, url] of Object.entries(assetUrlMap)) {
    if (!assetPath || !url) continue;
    const escaped = escapeRegExp(assetPath.replace(/\\/g, '/'));
    output = output.replace(new RegExp(`(?:(?:\\.\\./)+)?${escaped}`, 'g'), url);
  }
  return output;
}

function findSourcePage(manifest, page) {
  return asArray(manifest.pages).find(item =>
    isPlainObject(item) && String(item.sourceId || item.id || '') === page.sourceId
  ) || null;
}

async function readPackageText(reader, filePath, fallback = '') {
  if (filePath && reader) return reader.readText(filePath);
  return fallback;
}

async function readRenderedHtml(context, page, sourcePage) {
  const inline = textFromEntry(sourcePage?.rendered || sourcePage || {}, ['html', 'renderedHtml']);
  return readPackageText(context.reader, page.htmlPath, inline);
}

async function readNormalizedHtml(context, page, sourcePage) {
  const normalizedSource = sourcePage?.normalized || sourcePage?.mapping?.normalized || sourcePage || {};
  const inline = textFromEntry(normalizedSource, ['html', 'normalizedHtml']);
  return readPackageText(context.reader, page.normalizedHtmlPath, inline);
}

async function createDesignerDraftIfAvailable(motherEmitter, jwt, page, designerDraft) {
  if (!designerDraft || !motherEmitter) return { skipped: true, reason: 'missing-designer-draft' };
  if (typeof motherEmitter.listenerCount === 'function' && motherEmitter.listenerCount('designer.saveDesign') === 0) {
    return { skipped: true, reason: 'designer-save-listener-missing' };
  }
  const result = await emitAsync(motherEmitter, 'designer.saveDesign', {
    jwt,
    moduleName: 'designer',
    moduleType: 'community',
    design: {
      title: `Imported WordPress: ${page.title}`,
      description: `Generated from wordpressSitePackage source ${page.sourceId}.`,
      isDraft: true
    },
    widgets: designerDraft.widgets,
    layout: null
  });
  return { skipped: false, result };
}

function designIdFromDesignerDraft(savedDesignerDraft) {
  if (!savedDesignerDraft || savedDesignerDraft.skipped) return null;
  return resultId(savedDesignerDraft.result, ['id', 'designId'], null);
}

function wordpressSeoKeywords(page = {}) {
  return asArray(page.wordpress?.terms).map(term => term.name).filter(Boolean).join(', ');
}

function wordpressPageMeta(page = {}, extra = {}) {
  return {
    source: 'wordpressSitePackage',
    sourceId: page.sourceId,
    parentSourceId: page.parentSourceId || '',
    contentEntryId: extra.contentEntryId || null,
    renderedHtmlPath: page.htmlPath,
    normalizedHtmlPath: page.normalizedHtmlPath,
    sourcePath: page.sourcePath,
    importMode: 'wordpress-visual-package',
    wordpress: page.wordpress || {},
    ...(extra.designId ? { designId: extra.designId } : {})
  };
}

async function createPageProjectionIfAvailable({
  motherEmitter,
  jwt,
  decodedJWT,
  page,
  html,
  normalizedHtml,
  entryId,
  savedDesignerDraft,
  parentPageId = null
}) {
  if (!canEmit(motherEmitter, 'createPage')) {
    return { skipped: true, reason: 'pages-manager-listener-missing' };
  }

  const designId = designIdFromDesignerDraft(savedDesignerDraft);
  const result = await emitAsync(motherEmitter, 'createPage', {
    jwt,
    moduleName: 'pagesManager',
    moduleType: 'core',
    decodedJWT,
    title: page.title,
    slug: page.slug,
    status: page.status,
    lane: 'public',
    language: page.language || 'en',
    parent_id: parentPageId || null,
    is_content: false,
    translations: [{
      language: page.language || 'en',
      title: page.title,
      html: normalizedHtml || html || '',
      metaDesc: page.excerpt || page.wordpress?.seo?.description || '',
      seoTitle: page.wordpress?.seo?.title || page.title,
      seoKeywords: wordpressSeoKeywords(page)
    }],
    meta: wordpressPageMeta(page, { contentEntryId: entryId, designId }),
    autoSuffixSlug: true,
    skipContentMirror: true
  });

  return {
    skipped: false,
    pageId: resultId(result, ['pageId', 'id', 'insertedId'], page.slug),
    parentPageId: parentPageId || null,
    result
  };
}

async function applyImportContext(context, options = {}) {
  const { motherEmitter, jwt } = options;
  if (context.plan.policy.blocked.length) {
    throw new Error(`WordPress site package import blocked: ${context.plan.policy.blocked[0]}`);
  }
  if (!motherEmitter) {
    return {
      applied: false,
      warnings: ['No motherEmitter available; returning dry-run site package plan only.']
    };
  }

  const decodedJWT = {
    ...(options.decodedJWT || {}),
    permissions: {
      ...(options.decodedJWT?.permissions || {}),
      '*': true
    }
  };
  const contentBase = { jwt, moduleName: 'contentEngine', moduleType: 'core', decodedJWT };
  const mediaBase = { jwt, moduleName: 'mediaManager', moduleType: 'core', decodedJWT };
  const applied = {
    wxr: null,
    pages: [],
    pageEntries: [],
    media: [],
    navigation: null,
    seo: null,
    redirects: null,
    warnings: []
  };
  const materializedAssets = await materializePackageAssets(context, { ...options, decodedJWT });
  applied.assetUrlMap = materializedAssets.assetUrlMap;
  applied.warnings.push(...materializedAssets.warnings);
  const entryIdsBySourceId = new Map();
  const pageIdsBySourceId = new Map();

  if (context.plan.content.wxrPath) {
    const xml = await context.reader.readText(context.plan.content.wxrPath);
    applied.wxr = await wordpressImporter.import({
      xml,
      dryRun: false,
      motherEmitter,
      jwt,
      decodedJWT
    });
  }

  for (const media of context.plan.media) {
    const publicUrl = materializedAssets.assetUrlMap[media.path] || media.url;
    const result = await emitAsync(motherEmitter, 'createMediaAttachment', {
      ...mediaBase,
      fileName: media.fileName,
      mimeType: media.mimeType,
      url: publicUrl,
      storagePath: media.path,
      title: media.title,
      altText: media.altText,
      caption: media.caption,
      description: media.description,
      status: 'active',
      visibility: 'public',
      sourceModule: 'wordpressSitePackage',
      sourceId: media.sourceId,
      meta: {
        source: 'wordpressSitePackage',
        packagePath: media.path,
        packagePublicUrl: publicUrl
      }
    });
    applied.media.push({ sourceId: media.sourceId, result });
  }

  for (const page of context.plan.pages) {
    if (!page.hasRenderedHtml) {
      applied.warnings.push(`Skipped ${page.slug}: no rendered HTML provided.`);
      continue;
    }
    const sourcePage = asArray(context.manifest.pages).find(item =>
      isPlainObject(item) && String(item.sourceId || item.id || '') === page.sourceId
    );
    const rawHtml = await readRenderedHtml(context, page, sourcePage || findSourcePage(context.manifest, page));
    const rawNormalizedHtml = await readNormalizedHtml(context, page, sourcePage || findSourcePage(context.manifest, page));
    const html = rewritePackageAssetReferences(rawHtml, materializedAssets.assetUrlMap);
    const normalizedHtml = rewritePackageAssetReferences(rawNormalizedHtml, materializedAssets.assetUrlMap);
    const rewrittenScripts = page.scripts.map(script => materializedAssets.assetUrlMap[script] || script);
    const behaviorHints = buildBehaviorHints({
      renderedHtml: html,
      normalizedHtml,
      scripts: rewrittenScripts
    });
    applied.warnings.push(...behaviorHints.warnings.map(warning => `${page.slug}: ${warning}`));
    const designerDraft = normalizedHtml
      ? buildDesignerDraft({
        title: page.title,
        slug: page.slug,
        normalizedHtml,
        renderedHtml: html,
        page,
        styleHints: context.plan.styleHints,
        behaviorHints
      })
      : null;
    const content = normalizedHtml
      ? {
        html,
        normalizedHtml,
        importMode: 'wordpress-visual-package',
        nativeWidgets: page.mapping.nativeWidgets,
        mapperHints: page.mapping.mapperHints,
        styleHints: context.plan.styleHints,
        behaviorHints,
        designerDraft
      }
      : html;
    const result = await emitAsync(motherEmitter, 'createContentEntry', {
      ...contentBase,
      contentType: page.contentType,
      title: page.title,
      slug: page.slug,
      permalink: page.url,
      status: page.status,
      language: page.language || context.plan.package.language || 'en',
      parentId: page.parentSourceId ? entryIdsBySourceId.get(String(page.parentSourceId)) || null : null,
      sourceModule: 'wordpressSitePackage',
      sourceId: page.sourceId,
      excerpt: page.excerpt || page.wordpress?.seo?.description || '',
      publishedAt: page.publishedAt || null,
      content,
      meta: {
        source: 'wordpressSitePackage',
        renderedHtmlPath: page.htmlPath,
        normalizedHtmlPath: page.normalizedHtmlPath,
        sourcePath: page.sourcePath,
        parentSourceId: page.parentSourceId || '',
        styles: page.styles.map(style => materializedAssets.assetUrlMap[style] || style),
        blockedScripts: rewrittenScripts,
        assetUrlMap: materializedAssets.assetUrlMap,
        importedAssets: context.plan.assets.map(asset => ({
          sourceId: asset.sourceId,
          path: asset.path,
          publicUrl: materializedAssets.assetUrlMap[asset.path] || '',
          mimeType: asset.mimeType,
          kind: asset.kind,
          role: asset.role
        })),
        styleHints: context.plan.styleHints,
        behaviorHints,
        mapping: page.mapping,
        wordpress: page.wordpress || {},
        designerDraft: designerDraft
          ? {
            source: designerDraft.source,
            strategy: designerDraft.strategy,
            summary: designerDraft.summary
          }
          : null
      }
    });
    let savedDesignerDraft = null;
    if (designerDraft) {
      try {
        savedDesignerDraft = await createDesignerDraftIfAvailable(motherEmitter, jwt, page, designerDraft);
      } catch (err) {
        savedDesignerDraft = { skipped: true, reason: 'designer-save-failed', message: err.message };
        applied.warnings.push(`Designer draft for ${page.slug} was not saved: ${err.message}`);
      }
    }
    const entryId = resultId(result, ['entryId', 'id'], page.sourceId);
    entryIdsBySourceId.set(String(page.sourceId), entryId);
    try {
      const parentPageId = page.parentSourceId ? pageIdsBySourceId.get(String(page.parentSourceId)) || null : null;
      if (page.parentSourceId && !parentPageId) {
        applied.warnings.push(`Page projection for ${page.slug} could not find imported parent ${page.parentSourceId}; it was created at the root level.`);
      }
      const pageProjection = await createPageProjectionIfAvailable({
        motherEmitter,
        jwt,
        decodedJWT,
        page,
        html,
        normalizedHtml,
        entryId,
        savedDesignerDraft,
        parentPageId
      });
      if (pageProjection?.skipped) {
        applied.warnings.push(`Page projection for ${page.slug} was skipped: ${pageProjection.reason}`);
      } else {
        applied.pageEntries.push({ sourceId: page.sourceId, slug: page.slug, ...pageProjection });
        pageIdsBySourceId.set(String(page.sourceId), pageProjection.pageId);
      }
    } catch (err) {
      applied.warnings.push(`Page projection for ${page.slug} was not created: ${err.message}`);
    }
    applied.pages.push({ sourceId: page.sourceId, slug: page.slug, result, designerDraft: savedDesignerDraft });
  }

  applied.navigation = await applyNavigationIfAvailable(context, { ...options, decodedJWT });
  applied.seo = await applySeoIfAvailable(context, { ...options, decodedJWT });
  applied.redirects = await applyRedirectsIfAvailable(context, { ...options, decodedJWT });
  applied.warnings.push(
    ...asArray(applied.navigation?.warnings),
    ...asArray(applied.seo?.warnings),
    ...asArray(applied.redirects?.warnings)
  );

  return { applied: true, ...applied };
}

async function buildImportPlan(options = {}) {
  const context = await buildImportContext(options);
  return context.plan;
}

module.exports = {
  name: 'wordpressSitePackage',
  description: 'Import a Blogposter WordPress site package with rendered pages, content, media and theme assets kept separate.',

  async import(options = {}) {
    const context = await buildImportContext(options);
    if (options.dryRun !== false) {
      return { success: true, dryRun: true, plan: context.plan };
    }

    const applied = await applyImportContext(context, options);
    return { success: true, dryRun: false, plan: context.plan, applied };
  },

  _internals: {
    assetPaths,
    buildImportContext,
    buildImportPlan,
    inspectThemePolicy,
    buildDesignerDraft,
    normalizePackageAssets,
    normalizePage,
    normalizeSlug,
    toPackagePath,
    createPageProjectionIfAvailable,
    designIdFromDesignerDraft,
    normalizeMenuItems,
    normalizeRedirectManifestRule,
    pageSeoPath
  }
};
