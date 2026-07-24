'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { onceCallback } = require('../../emitters/motherEmitter');
const {
  normalizeColorValue,
  normalizeSchemeId,
  normalizeSchemeName,
  upsertColorScheme
} = require('../colorLibrary/colorLibraryService');
const {
  normalizePackageId,
  normalizePackageName,
  normalizeRoleStyles,
  ROLE_NAMES,
  upsertFontPackage
} = require('../fontPackages/fontPackagesService');

const SITE_PRESETS_STORAGE_KEY = 'SITE_PRESETS_V1';
const SITE_PRESETS_LAST_APPLIED_KEY = 'SITE_PRESETS_LAST_APPLIED_V1';
const SITE_PRESETS_VERSION = 1;
const MAX_PRESET_COUNT = 32;
const MAX_PAGE_DEMOS = 12;
const MAX_DEMO_ELEMENTS = 80;
const PRESET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{7,79}$/;
const DEMO_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,79}$/;
const ALLOWED_PRESET_IDS = new Set([
  'text.heading',
  'text.subheading',
  'text.paragraph',
  'text.quote',
  'text.list',
  'text.caption',
  'media.image',
  'media.gallery',
  'media.masonry',
  'media.carousel',
  'shape.card',
  'shape.divider',
  'shape.spacer',
  'button.primary',
  'button.secondary',
  'button.link',
  'navigation.menu',
  'navigation.breadcrumb',
  'content.collectionArchive'
]);
const PACKAGE_KEYS = new Set([
  'schemaVersion',
  'id',
  'name',
  'version',
  'developer',
  'builderSettings',
  'colorScheme',
  'fontPackage',
  'pageDemos',
  'source',
  'createdAt',
  'updatedAt'
]);
const FORBIDDEN_KEY_PATTERN = /^(?:css|html|javascript|js|script|scripts|module|modules|route|routes|event|events|permission|permissions|widgetcode)$/i;

let mutationQueue = Promise.resolve();

function sitePresetError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function normalizeText(value, field, maxLength, required = false) {
  const text = String(value || '').replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (required && !text) {
    throw sitePresetError('SITE_PRESETS_TEXT_REQUIRED', `${field} is required.`);
  }
  if (text.length > maxLength) {
    throw sitePresetError('SITE_PRESETS_TEXT_TOO_LONG', `${field} may contain at most ${maxLength} characters.`);
  }
  return text;
}

function normalizePresetId(value) {
  const id = String(value || '').trim().toLowerCase();
  if (!PRESET_ID_PATTERN.test(id)) {
    throw sitePresetError('SITE_PRESETS_INVALID_ID', 'The site preset id is invalid.');
  }
  return id;
}

function normalizeDemoId(value) {
  const id = String(value || '').trim().toLowerCase();
  if (!DEMO_ID_PATTERN.test(id)) {
    throw sitePresetError('SITE_PRESETS_INVALID_DEMO_ID', 'The page demo id is invalid.');
  }
  return id;
}

function createPresetId() {
  const suffix = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().toLowerCase()
    : crypto.randomBytes(12).toString('hex');
  return `user-preset-${suffix}`;
}

function assertPlainObject(value, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw sitePresetError(code, message);
  }
  return value;
}

function assertNoExecutableKeys(value, location = 'preset') {
  if (!value || typeof value !== 'object') return;
  Object.entries(value).forEach(([key, nested]) => {
    if (FORBIDDEN_KEY_PATTERN.test(key)) {
      throw sitePresetError(
        'SITE_PRESETS_EXECUTABLE_FIELD_FORBIDDEN',
        `${location}.${key} is not allowed in declarative site presets.`
      );
    }
    if (nested && typeof nested === 'object') {
      assertNoExecutableKeys(nested, `${location}.${key}`);
    }
  });
}

function normalizeBuilderSettings(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const allowedKeys = new Set(['layoutMode', 'gap', 'padding', 'sceneBackground']);
  const unknown = Object.keys(source).filter(key => !allowedKeys.has(key));
  if (unknown.length) {
    throw sitePresetError(
      'SITE_PRESETS_UNKNOWN_BUILDER_SETTING',
      `Unknown builder settings: ${unknown.join(', ')}.`
    );
  }
  const layoutMode = String(source.layoutMode || 'free').trim().toLowerCase();
  if (!['free', 'stack', 'row', 'grid'].includes(layoutMode)) {
    throw sitePresetError('SITE_PRESETS_INVALID_LAYOUT_MODE', 'layoutMode is invalid.');
  }
  const normalizeNumber = (field, fallback, min, max) => {
    const numeric = source[field] === undefined ? fallback : Number(source[field]);
    if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
      throw sitePresetError('SITE_PRESETS_INVALID_BUILDER_SETTING', `${field} is outside the supported range.`);
    }
    return Math.round(numeric);
  };
  return {
    layoutMode,
    gap: normalizeNumber('gap', 0, 0, 96),
    padding: normalizeNumber('padding', 0, 0, 160),
    sceneBackground: normalizeColorValue(source.sceneBackground || '#FFFFFF')
  };
}

function normalizeColorScheme(value) {
  const source = assertPlainObject(
    value,
    'SITE_PRESETS_COLOR_SCHEME_REQUIRED',
    'A site preset needs a color scheme.'
  );
  const colors = Array.isArray(source.colors) ? source.colors : [];
  if (!colors.length) {
    throw sitePresetError(
      'SITE_PRESETS_COLOR_SLOTS_REQUIRED',
      'A site preset color scheme needs at least one Default slot.'
    );
  }
  return {
    id: normalizeSchemeId(source.id),
    name: normalizeSchemeName(source.name),
    colors: colors.map((entry, index) => {
      const color = assertPlainObject(
        entry,
        'SITE_PRESETS_INVALID_COLOR_SLOT',
        `Default ${index + 1} must be a color object.`
      );
      return {
        id: `default-${index + 1}`,
        name: normalizeText(color.name || `Color ${index + 1}`, `Default ${index + 1} name`, 80, true),
        value: normalizeColorValue(color.value)
      };
    })
  };
}

function normalizeFontPackage(value) {
  const source = assertPlainObject(
    value,
    'SITE_PRESETS_FONT_PACKAGE_REQUIRED',
    'A site preset needs a font package.'
  );
  const rolesSource = assertPlainObject(
    source.roles,
    'SITE_PRESETS_FONT_ROLES_REQUIRED',
    'A site preset font package needs semantic Default slots.'
  );
  return {
    id: normalizePackageId(source.id),
    name: normalizePackageName(source.name),
    roles: Object.fromEntries(ROLE_NAMES.map(role => [
      role,
      normalizeRoleStyles(role, rolesSource[role])
    ]))
  };
}

function normalizeGeometry(value, field, fallback, min, max) {
  const numeric = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw sitePresetError('SITE_PRESETS_INVALID_DEMO_GEOMETRY', `${field} is outside the supported range.`);
  }
  return Math.round(numeric);
}

function normalizeDemoElement(value) {
  const source = assertPlainObject(
    value,
    'SITE_PRESETS_INVALID_DEMO_ELEMENT',
    'Page demo elements must be objects.'
  );
  const presetId = String(source.presetId || '').trim();
  if (!ALLOWED_PRESET_IDS.has(presetId)) {
    throw sitePresetError(
      'SITE_PRESETS_UNKNOWN_ELEMENT_PRESET',
      `Page demo element preset "${presetId}" is not a central Builder preset.`
    );
  }
  return {
    presetId,
    x: normalizeGeometry(source.x, 'x', 0, 0, 11),
    y: normalizeGeometry(source.y, 'y', 0, 0, 10000),
    w: normalizeGeometry(source.w, 'w', 4, 1, 12),
    h: normalizeGeometry(source.h, 'h', 72, 1, 2000)
  };
}

function normalizePageDemo(value) {
  const source = assertPlainObject(
    value,
    'SITE_PRESETS_INVALID_PAGE_DEMO',
    'Page demos must be objects.'
  );
  const elements = Array.isArray(source.elements) ? source.elements : [];
  if (elements.length > MAX_DEMO_ELEMENTS) {
    throw sitePresetError(
      'SITE_PRESETS_DEMO_ELEMENT_LIMIT',
      `A page demo may contain at most ${MAX_DEMO_ELEMENTS} central elements.`
    );
  }
  return {
    id: normalizeDemoId(source.id),
    name: normalizeText(source.name, 'Page demo name', 80, true),
    scene: {
      title: normalizeText(source.scene?.title || source.name, 'Scene title', 80, true),
      background: normalizeColorValue(source.scene?.background || '#FFFFFF')
    },
    elements: elements.map(normalizeDemoElement)
  };
}

function normalizePresetPackage(value, options = {}) {
  const source = assertPlainObject(
    value,
    'SITE_PRESETS_INVALID_PACKAGE',
    'Site presets must be plain objects.'
  );
  const unknown = Object.keys(source).filter(key => !PACKAGE_KEYS.has(key));
  if (unknown.length) {
    throw sitePresetError(
      'SITE_PRESETS_UNKNOWN_FIELD',
      `Unknown site preset fields: ${unknown.join(', ')}.`
    );
  }
  assertNoExecutableKeys(source);
  const pageDemos = Array.isArray(source.pageDemos) ? source.pageDemos : [];
  if (pageDemos.length > MAX_PAGE_DEMOS) {
    throw sitePresetError(
      'SITE_PRESETS_PAGE_DEMO_LIMIT',
      `A site preset may contain at most ${MAX_PAGE_DEMOS} page demos.`
    );
  }
  const now = new Date().toISOString();
  return {
    schemaVersion: SITE_PRESETS_VERSION,
    id: normalizePresetId(options.id || source.id),
    name: normalizeText(source.name, 'Site preset name', 80, true),
    version: normalizeText(source.version || '1.0.0', 'Site preset version', 40, true),
    developer: normalizeText(source.developer || options.defaultDeveloper || 'User', 'Developer', 80, true),
    builderSettings: normalizeBuilderSettings(source.builderSettings),
    colorScheme: normalizeColorScheme(source.colorScheme),
    fontPackage: normalizeFontPackage(source.fontPackage),
    pageDemos: pageDemos.map(normalizePageDemo),
    createdAt: typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : now,
    updatedAt: typeof source.updatedAt === 'string' && source.updatedAt ? source.updatedAt : now
  };
}

function presetsBaseDir() {
  return path.resolve(__dirname, '../../../presets');
}

function installedPresetDir(id) {
  const base = presetsBaseDir();
  let normalizedId = '';
  try {
    normalizedId = normalizePresetId(id);
  } catch {
    return null;
  }
  const target = path.resolve(base, normalizedId);
  const relative = path.relative(base, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return target;
}

function readInstalledPreset(id) {
  const dir = installedPresetDir(id);
  if (!dir) return null;
  const filePath = path.join(dir, 'preset.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    return {
      ...normalizePresetPackage(JSON.parse(fs.readFileSync(filePath, 'utf8')), { id }),
      source: 'installed'
    };
  } catch (error) {
    console.warn(`SITE_PRESETS_MANIFEST_INVALID: ${filePath}: ${error.message}`);
    return null;
  }
}

function listInstalledPresets() {
  const base = presetsBaseDir();
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => readInstalledPreset(entry.name))
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name));
}

function parseStoredUserPresets(value) {
  let parsed = value;
  if (typeof value === 'string' && value.trim()) {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw sitePresetError('SITE_PRESETS_STORAGE_INVALID', 'Stored user site presets are not valid JSON.');
    }
  }
  const values = Array.isArray(parsed?.presets) ? parsed.presets : [];
  return values.slice(0, MAX_PRESET_COUNT).map(entry => {
    try {
      return { ...normalizePresetPackage(entry), source: 'user' };
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function emitSettingsManager(motherEmitter, jwt, eventName, payload = {}) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(eventName, {
      ...payload,
      jwt,
      moduleName: 'settingsManager',
      moduleType: 'core'
    }, onceCallback((error, result) => (error ? reject(error) : resolve(result))));
  });
}

async function readUserPresets(motherEmitter, jwt) {
  const stored = await emitSettingsManager(motherEmitter, jwt, 'getSetting', {
    key: SITE_PRESETS_STORAGE_KEY
  });
  return parseStoredUserPresets(stored);
}

async function writeUserPresets(motherEmitter, jwt, presets) {
  const normalized = presets.map(entry => normalizePresetPackage(entry)).slice(0, MAX_PRESET_COUNT);
  await emitSettingsManager(motherEmitter, jwt, 'setSetting', {
    key: SITE_PRESETS_STORAGE_KEY,
    value: JSON.stringify({ version: SITE_PRESETS_VERSION, presets: normalized })
  });
  return normalized.map(entry => ({ ...entry, source: 'user' }));
}

async function listSitePresets(motherEmitter, jwt) {
  const installed = listInstalledPresets();
  const installedIds = new Set(installed.map(preset => preset.id));
  const user = (await readUserPresets(motherEmitter, jwt))
    .filter(preset => !installedIds.has(preset.id));
  const lastAppliedId = String(await emitSettingsManager(motherEmitter, jwt, 'getSetting', {
    key: SITE_PRESETS_LAST_APPLIED_KEY
  }) || '').trim().toLowerCase();
  return {
    version: SITE_PRESETS_VERSION,
    lastAppliedId: [...installed, ...user].some(preset => preset.id === lastAppliedId)
      ? lastAppliedId
      : '',
    presets: [...installed, ...user]
  };
}

function serializeMutation(task) {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.catch(() => undefined);
  return run;
}

async function createSitePreset(motherEmitter, jwt, input = {}) {
  return serializeMutation(async () => {
    const presets = await readUserPresets(motherEmitter, jwt);
    if (presets.length >= MAX_PRESET_COUNT) {
      throw sitePresetError(
        'SITE_PRESETS_LIMIT_REACHED',
        `At most ${MAX_PRESET_COUNT} user site presets may be stored.`
      );
    }
    const preset = normalizePresetPackage(input.preset || input, {
      id: createPresetId(),
      defaultDeveloper: 'User'
    });
    if (
      listInstalledPresets().some(entry => entry.name.toLocaleLowerCase() === preset.name.toLocaleLowerCase())
      || presets.some(entry => entry.name.toLocaleLowerCase() === preset.name.toLocaleLowerCase())
    ) {
      throw sitePresetError('SITE_PRESETS_NAME_EXISTS', `A site preset named "${preset.name}" already exists.`);
    }
    const saved = await writeUserPresets(motherEmitter, jwt, [...presets, preset]);
    return {
      preset: { ...preset, source: 'user' },
      library: { version: SITE_PRESETS_VERSION, presets: [...listInstalledPresets(), ...saved] }
    };
  });
}

async function deleteSitePreset(motherEmitter, jwt, input = {}) {
  return serializeMutation(async () => {
    const id = normalizePresetId(input.id);
    if (listInstalledPresets().some(preset => preset.id === id)) {
      throw sitePresetError('SITE_PRESETS_INSTALLED_READ_ONLY', 'Installed site presets cannot be deleted in the Builder.');
    }
    const presets = await readUserPresets(motherEmitter, jwt);
    const preset = presets.find(entry => entry.id === id);
    if (!preset) {
      throw sitePresetError('SITE_PRESETS_NOT_FOUND', 'The user site preset was not found.');
    }
    const saved = await writeUserPresets(
      motherEmitter,
      jwt,
      presets.filter(entry => entry.id !== id)
    );
    return {
      preset: { ...preset, source: 'user' },
      library: { version: SITE_PRESETS_VERSION, presets: [...listInstalledPresets(), ...saved] }
    };
  });
}

async function requirePreset(motherEmitter, jwt, id) {
  const normalizedId = normalizePresetId(id);
  const installed = readInstalledPreset(normalizedId);
  if (installed) return installed;
  const user = await readUserPresets(motherEmitter, jwt);
  const preset = user.find(entry => entry.id === normalizedId);
  if (!preset) throw sitePresetError('SITE_PRESETS_NOT_FOUND', 'The site preset was not found.');
  return preset;
}

async function applySitePreset(motherEmitter, jwt, input = {}) {
  return serializeMutation(async () => {
    const preset = await requirePreset(motherEmitter, jwt, input.id);
    const colorResult = await upsertColorScheme(motherEmitter, jwt, {
      ...preset.colorScheme,
      activate: true
    });
    const fontResult = await upsertFontPackage(motherEmitter, jwt, {
      ...preset.fontPackage,
      activate: true
    });
    await emitSettingsManager(motherEmitter, jwt, 'setSetting', {
      key: SITE_PRESETS_LAST_APPLIED_KEY,
      value: preset.id
    });
    return {
      applied: true,
      preset,
      colorScheme: colorResult.scheme,
      fontPackage: fontResult.package,
      builderSettings: preset.builderSettings,
      pageDemos: preset.pageDemos
    };
  });
}

function resetMutationQueue() {
  mutationQueue = Promise.resolve();
}

module.exports = {
  SITE_PRESETS_LAST_APPLIED_KEY,
  SITE_PRESETS_STORAGE_KEY,
  SITE_PRESETS_VERSION,
  applySitePreset,
  createSitePreset,
  deleteSitePreset,
  listInstalledPresets,
  listSitePresets,
  normalizePresetId,
  normalizePresetPackage,
  parseStoredUserPresets,
  readInstalledPreset,
  readUserPresets,
  resetMutationQueue,
  writeUserPresets,
  _internals: {
    ALLOWED_PRESET_IDS,
    assertNoExecutableKeys,
    createPresetId,
    emitSettingsManager,
    installedPresetDir,
    normalizeBuilderSettings,
    normalizeColorScheme,
    normalizeDemoElement,
    normalizeFontPackage,
    normalizePageDemo,
    presetsBaseDir,
    requirePreset,
    serializeMutation,
    sitePresetError
  }
};
