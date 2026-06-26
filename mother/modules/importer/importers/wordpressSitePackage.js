'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const wordpressImporter = require('./wordpress');

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
  const hasPath = Boolean(htmlPath);
  const hasInline = Boolean(inlineHtml);
  let sizeBytes = hasInline ? Buffer.byteLength(inlineHtml, 'utf8') : 0;
  if (!sizeBytes && hasPath && reader && await reader.has(htmlPath)) {
    const html = await reader.readText(htmlPath);
    sizeBytes = Buffer.byteLength(html, 'utf8');
  }
  return { htmlPath, hasRenderedHtml: hasInline || hasPath, renderedHtmlBytes: sizeBytes };
}

async function normalizePage(page, index, reader) {
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

  return {
    sourceId: String(page.sourceId || page.id || slug),
    title,
    slug,
    url: String(page.url || ''),
    status: normalizeStatus(page.status),
    contentType: String(page.contentType || page.type || 'page'),
    ...html,
    styles,
    scripts,
    media,
    mapping: {
      confidence: Number.isFinite(Number(page.mapping?.confidence)) ? Number(page.mapping.confidence) : null,
      nativeWidgets: asArray(page.mapping?.nativeWidgets),
      fallback: scripts.length ? 'rendered-html-with-blocked-scripts' : 'rendered-html'
    },
    warnings: scripts.length
      ? [`${scripts.length} page script asset(s) kept as blocked behavior; move them into widgets, modules or apps.`]
      : []
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

function normalizeContent(content = {}) {
  const wxrPath = pathFromEntry(content.wxr || content, ['wxrPath', 'filePath', 'path', 'file'], 'content.wxr');
  return {
    wxrPath,
    records: asArray(content.records || content.items),
    posts: asArray(content.posts),
    pages: asArray(content.pages)
  };
}

async function buildImportContext(options = {}) {
  const reader = await createPackageReader(options);
  const manifest = await loadManifest(reader, options);
  validateManifest(manifest);

  const themePolicy = inspectThemePolicy(manifest.theme || {});
  const pages = [];
  for (const [index, page] of asArray(manifest.pages).entries()) {
    if (isPlainObject(page)) pages.push(await normalizePage(page, index, reader));
  }
  const media = asArray(manifest.media).filter(isPlainObject).map(normalizeMedia);
  const content = normalizeContent(manifest.content || {});
  const warnings = [...themePolicy.warnings];
  for (const page of pages) warnings.push(...page.warnings.map(warning => `${page.slug}: ${warning}`));

  const plan = {
    source: 'wordpressSitePackage',
    dryRun: options.dryRun !== false,
    package: {
      format: manifest.format || manifest.packageFormat || manifest.type,
      version: String(manifest.version || ''),
      generatedAt: String(manifest.generatedAt || ''),
      sourcePlatform: String(manifest.source?.platform || manifest.platform || 'wordpress'),
      siteUrl: String(manifest.source?.siteUrl || manifest.siteUrl || '')
    },
    installable: themePolicy.blocked.length === 0,
    policy: {
      blocked: themePolicy.blocked,
      warnings
    },
    theme: {
      name: String(manifest.theme?.name || manifest.site?.title || manifest.title || 'Imported WordPress Theme'),
      styles: themePolicy.styles
    },
    content,
    pages,
    media,
    menus: asArray(manifest.menus),
    redirects: asArray(manifest.redirects),
    seo: isPlainObject(manifest.seo) ? manifest.seo : {},
    totals: {
      pages: pages.length,
      renderedPages: pages.filter(page => page.hasRenderedHtml).length,
      pageScripts: pages.reduce((total, page) => total + page.scripts.length, 0),
      themeStyles: themePolicy.styles.length,
      blockedThemeScripts: themePolicy.scripts.length,
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

  const decodedJWT = { permissions: { '*': true } };
  const contentBase = { jwt, moduleName: 'contentEngine', moduleType: 'core', decodedJWT };
  const mediaBase = { jwt, moduleName: 'mediaManager', moduleType: 'core', decodedJWT };
  const applied = { wxr: null, pages: [], media: [], warnings: [] };

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
    const result = await emitAsync(motherEmitter, 'createMediaAttachment', {
      ...mediaBase,
      fileName: media.fileName,
      mimeType: media.mimeType,
      url: media.url,
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
        packagePath: media.path
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
    const html = page.htmlPath
      ? await context.reader.readText(page.htmlPath)
      : textFromEntry(sourcePage?.rendered || sourcePage || {}, ['html', 'renderedHtml']);
    const result = await emitAsync(motherEmitter, 'createContentEntry', {
      ...contentBase,
      contentType: page.contentType,
      title: page.title,
      slug: page.slug,
      permalink: page.url,
      status: page.status,
      sourceModule: 'wordpressSitePackage',
      sourceId: page.sourceId,
      excerpt: '',
      content: html,
      meta: {
        source: 'wordpressSitePackage',
        renderedHtmlPath: page.htmlPath,
        styles: page.styles,
        blockedScripts: page.scripts,
        mapping: page.mapping
      }
    });
    applied.pages.push({ sourceId: page.sourceId, slug: page.slug, result });
  }

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
    normalizePage,
    normalizeSlug,
    toPackagePath
  }
};
