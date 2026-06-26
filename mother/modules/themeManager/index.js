'use strict';

const fs = require('fs');
const path = require('path');
const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');

const MODULE_NAME = 'themeManager';
const MODULE_TYPE = 'core';
const ACTIVE_THEME_SETTING = 'ACTIVE_THEME';
const THEME_SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const THEME_SLUG_INPUT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const CONTROL_CHAR_PATTERN = /[\x00-\x1F\x7F]/g;
const CONTROL_CHAR_TEST_PATTERN = /[\x00-\x1F\x7F]/;
const THEME_ASSET_RELATIVE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,159}$/;
const THEME_ASSET_EXTENSIONS = {
  css: '.css',
  scss: '.scss'
};
const THEME_MANIFEST_KEYS = new Set([
  'name',
  'version',
  'developer',
  'description',
  'assets',
  'tokens',
  'imported'
]);
const THEME_CAPABILITY_KEYS = new Set([
  'api',
  'app',
  'appname',
  'apptype',
  'capability',
  'capabilities',
  'database',
  'db',
  'dependencies',
  'endpoint',
  'endpoints',
  'event',
  'eventbus',
  'events',
  'exporter',
  'exporters',
  'function',
  'functions',
  'importer',
  'importers',
  'javascript',
  'js',
  'module',
  'modulename',
  'moduletype',
  'package',
  'permission',
  'permissions',
  'remote',
  'route',
  'routes',
  'runtime',
  'script',
  'scripts',
  'setting',
  'settings',
  'widget',
  'widgetid',
  'widgetname',
  'widgets',
  'workflow',
  'workflows'
]);
const THEME_TEXT_LIMITS = {
  name: 120,
  version: 40,
  developer: 120,
  description: 500
};

function normalizeThemeSlug(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function assertThemeSlug(value, label = 'Theme slug') {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error(`${label} is required.`);
  if (!THEME_SLUG_INPUT_PATTERN.test(raw)) {
    throw new Error(`Invalid theme slug: ${raw}`);
  }
  return raw.toLowerCase();
}

function themesBaseDir() {
  return path.join(__dirname, '../../../public/themes');
}

function themeDirFor(slug) {
  let cleanSlug = '';
  try {
    cleanSlug = assertThemeSlug(slug);
  } catch {
    return null;
  }
  if (!THEME_SLUG_PATTERN.test(cleanSlug)) return null;
  const base = themesBaseDir();
  const target = path.join(base, cleanSlug);
  const relative = path.relative(base, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return target;
}

function themeAssetPath(slug, fileName) {
  const fullPath = path.join(themeDirFor(slug) || '', fileName);
  return fs.existsSync(fullPath) ? `/themes/${slug}/${fileName}` : '';
}

function sanitizeThemeText(value, maxLength) {
  if (typeof value !== 'string') return '';
  const clean = value.replace(CONTROL_CHAR_PATTERN, ' ').trim();
  return clean.slice(0, maxLength);
}

function sanitizeThemeAssetPath(slug, assetType, value) {
  if (typeof value !== 'string') return '';
  const expectedExtension = THEME_ASSET_EXTENSIONS[assetType];
  if (!expectedExtension) return '';

  const clean = value.trim();
  const prefix = `/themes/${slug}/`;
  if (!clean.startsWith(prefix)) return '';
  if (CONTROL_CHAR_TEST_PATTERN.test(clean) || clean.includes('\\') || clean.includes('?') || clean.includes('#')) {
    return '';
  }

  const relativePath = clean.slice(prefix.length);
  if (!THEME_ASSET_RELATIVE_PATTERN.test(relativePath)) return '';
  if (relativePath.includes('//')) return '';
  if (relativePath.split('/').some(segment => segment === '.' || segment === '..')) return '';
  if (!relativePath.toLowerCase().endsWith(expectedExtension)) return '';

  return clean;
}

function normalizeManifestKey(key) {
  return String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function assertNoThemeCapabilities(value, location = 'theme.json') {
  if (!value || typeof value !== 'object') return;

  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = normalizeManifestKey(key);
    if (THEME_CAPABILITY_KEYS.has(normalizedKey)) {
      throw new Error(`[themeManager] ${location}.${key} is not allowed; themes are presentation-only metadata.`);
    }
    if (nestedValue && typeof nestedValue === 'object') {
      assertNoThemeCapabilities(nestedValue, `${location}.${key}`);
    }
  }
}

function assertThemeManifest(rawMeta) {
  if (!rawMeta || typeof rawMeta !== 'object' || Array.isArray(rawMeta)) {
    return {};
  }

  for (const key of Object.keys(rawMeta)) {
    if (!THEME_MANIFEST_KEYS.has(key)) {
      throw new Error(`[themeManager] theme.json field "${key}" is not allowed.`);
    }
  }

  if (Object.prototype.hasOwnProperty.call(rawMeta, 'assets')) {
    if (!rawMeta.assets || typeof rawMeta.assets !== 'object' || Array.isArray(rawMeta.assets)) {
      throw new Error('[themeManager] theme.json assets must be an object.');
    }
    for (const key of Object.keys(rawMeta.assets)) {
      if (!Object.prototype.hasOwnProperty.call(THEME_ASSET_EXTENSIONS, key)) {
        throw new Error(`[themeManager] theme asset "${key}" is not allowed; themes may only expose css/scss assets.`);
      }
    }
  }

  assertNoThemeCapabilities(rawMeta);

  return rawMeta;
}

function sanitizeThemeMeta(baseMeta, rawMeta) {
  const manifest = assertThemeManifest(rawMeta);
  const meta = {
    ...baseMeta,
    assets: { ...(baseMeta.assets || {}) }
  };

  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return meta;
  }

  for (const [key, maxLength] of Object.entries(THEME_TEXT_LIMITS)) {
    const clean = sanitizeThemeText(manifest[key], maxLength);
    if (clean) meta[key] = clean;
  }

  const rawAssets = manifest.assets;
  if (rawAssets && typeof rawAssets === 'object' && !Array.isArray(rawAssets)) {
    for (const assetType of Object.keys(THEME_ASSET_EXTENSIONS)) {
      if (typeof rawAssets[assetType] === 'undefined') continue;
      const clean = sanitizeThemeAssetPath(meta.slug, assetType, rawAssets[assetType]);
      if (!clean) {
        throw new Error(`[themeManager] invalid ${assetType} asset path in theme.json.`);
      }
      meta.assets[assetType] = clean;
    }
  }

  meta.slug = baseMeta.slug;
  return meta;
}

function readThemeMeta(dir) {
  let slug = '';
  try {
    slug = assertThemeSlug(dir);
  } catch {
    return null;
  }
  const themeDir = themeDirFor(slug);
  if (!themeDir || !fs.existsSync(themeDir)) return null;

  let meta = {
    slug,
    name: slug,
    version: '',
    developer: '',
    description: '',
    assets: {
      css: themeAssetPath(slug, 'theme.css'),
      scss: themeAssetPath(slug, 'theme.scss')
    }
  };

  const jsonPath = path.join(themeDir, 'theme.json');
  if (fs.existsSync(jsonPath)) {
    try {
      meta = sanitizeThemeMeta(meta, JSON.parse(fs.readFileSync(jsonPath, 'utf8')));
    } catch (err) {
      console.error(`[THEME MANAGER] Failed to read ${jsonPath}:`, err.message);
      return null;
    }
  }

  meta.slug = slug;
  return meta;
}

function listThemes() {
  const base = themesBaseDir();
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => readThemeMeta(entry.name))
    .filter(Boolean)
    .sort((left, right) => String(left.name || left.slug).localeCompare(String(right.name || right.slug)));
}

function getTheme(slug) {
  return readThemeMeta(assertThemeSlug(slug));
}

function assertThemePayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[themeManager] ${eventName} => invalid payload`);
  }
}

function requirePayloadPermission(payload, permission) {
  if (payload?.decodedJWT && !hasPermission(payload.decodedJWT, permission)) {
    throw new Error(`Forbidden - missing permission: ${permission}`);
  }
}

function emitAsync(motherEmitter, eventName, payload) {
  return new Promise((resolve, reject) => {
    if (typeof motherEmitter.listenerCount === 'function' && motherEmitter.listenerCount(eventName) === 0) {
      reject(new Error(`Missing event listener: ${eventName}`));
      return;
    }
    motherEmitter.emit(eventName, payload, onceCallback((err, result) => {
      if (err) return reject(err);
      resolve(result);
    }));
  });
}

async function getActiveTheme(motherEmitter, jwt) {
  let activeSlug = '';
  try {
    activeSlug = await emitAsync(motherEmitter, 'getSetting', {
      jwt,
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: ACTIVE_THEME_SETTING
    });
  } catch {
    activeSlug = '';
  }

  let selected = null;
  try {
    selected = activeSlug ? getTheme(activeSlug) : null;
  } catch {
    selected = null;
  }
  return selected || listThemes()[0] || null;
}

async function activateTheme(motherEmitter, jwt, slug) {
  const cleanSlug = assertThemeSlug(slug);
  const theme = getTheme(cleanSlug);
  if (!theme) throw new Error(`Theme not found: ${cleanSlug}`);
  await emitAsync(motherEmitter, 'setSetting', {
    jwt,
    moduleName: 'settingsManager',
    moduleType: 'core',
    key: ACTIVE_THEME_SETTING,
    value: theme.slug
  });
  return { done: true, theme };
}

function setupThemeEvents(motherEmitter) {
  motherEmitter.on('listThemes', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertThemePayload(payload, 'listThemes');
      requirePayloadPermission(payload, 'themes.list');
      callback(null, listThemes());
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getTheme', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertThemePayload(payload, 'getTheme');
      requirePayloadPermission(payload, 'themes.list');
      const slug = assertThemeSlug(payload.slug || payload.theme || payload.name);
      callback(null, getTheme(slug) || null);
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('getActiveTheme', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertThemePayload(payload, 'getActiveTheme');
      requirePayloadPermission(payload, 'themes.list');
      callback(null, await getActiveTheme(motherEmitter, payload.jwt));
    } catch (err) {
      callback(err);
    }
  });

  motherEmitter.on('activateTheme', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      assertThemePayload(payload, 'activateTheme');
      requirePayloadPermission(payload, 'themes.activate');
      const slug = assertThemeSlug(payload.slug || payload.theme || payload.name);
      callback(null, await activateTheme(motherEmitter, payload.jwt, slug));
    } catch (err) {
      callback(err);
    }
  });
}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt }) {
    if (!isCore) {
      throw new Error('[THEME MANAGER] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[THEME MANAGER] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[THEME MANAGER] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
    }

    console.log('[THEME MANAGER] Initializing...');
    setupThemeEvents(motherEmitter);
    console.log('[THEME MANAGER] Ready.');
  },
  _internals: {
    ACTIVE_THEME_SETTING,
    activateTheme,
    assertThemeSlug,
    getActiveTheme,
    getTheme,
    listThemes,
    normalizeThemeSlug,
    readThemeMeta,
    assertNoThemeCapabilities,
    assertThemeManifest,
    sanitizeThemeAssetPath,
    sanitizeThemeMeta,
    setupThemeEvents
  }
};
