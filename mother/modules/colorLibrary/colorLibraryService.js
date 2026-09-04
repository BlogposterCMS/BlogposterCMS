'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

const crypto = require('crypto');

const COLOR_LIBRARY_STORAGE_KEY = 'COLOR_LIBRARY_V2';
const LEGACY_COLOR_LIBRARY_STORAGE_KEY = 'COLOR_LIBRARY_V1';
const COLOR_LIBRARY_VERSION = 2;
const DEFAULT_SCHEME_ID = 'color-scheme-default';
const MAX_SCHEME_COUNT = 32;
const MAX_COLOR_COUNT = 64;
const MAX_COLOR_NAME_LENGTH = 80;
const MAX_SCHEME_NAME_LENGTH = 80;
const SCHEME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{7,79}$/;
const COLOR_ID_PATTERN = /^default-[1-9][0-9]{0,2}$/;
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

const DEFAULT_COLORS = Object.freeze([
  { id: 'default-1', name: 'Primary', value: '#00C4CC' },
  { id: 'default-2', name: 'Text', value: '#111827' },
  { id: 'default-3', name: 'Background', value: '#FFFFFF' },
  { id: 'default-4', name: 'Muted', value: '#6B7280' },
  { id: 'default-5', name: 'Accent', value: '#2563EB' }
]);

let mutationQueue = Promise.resolve();

function colorLibraryError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function timestampOrEpoch(value) {
  return typeof value === 'string' && value ? value : new Date(0).toISOString();
}

function normalizeName(value, field, maxLength) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (!name) {
    throw colorLibraryError(`COLOR_LIBRARY_${field.toUpperCase()}_REQUIRED`, `A ${field} name is required.`);
  }
  if (name.length > maxLength) {
    throw colorLibraryError(
      `COLOR_LIBRARY_${field.toUpperCase()}_NAME_TOO_LONG`,
      `${field[0].toUpperCase()}${field.slice(1)} names may contain at most ${maxLength} characters.`
    );
  }
  return name;
}

function normalizeColorName(value) {
  return normalizeName(value, 'color', MAX_COLOR_NAME_LENGTH);
}

function normalizeSchemeName(value) {
  return normalizeName(value, 'scheme', MAX_SCHEME_NAME_LENGTH);
}

function normalizeColorValue(value) {
  const raw = String(value || '').trim();
  if (!HEX_COLOR_PATTERN.test(raw)) {
    throw colorLibraryError(
      'COLOR_LIBRARY_INVALID_VALUE',
      'Colors must use #RGB, #RRGGBB or #RRGGBBAA notation.'
    );
  }
  if (raw.length === 4) {
    return `#${raw.slice(1).split('').map(part => `${part}${part}`).join('')}`.toUpperCase();
  }
  return raw.toUpperCase();
}

function normalizeColorId(value) {
  const id = String(value || '').trim().toLowerCase();
  if (!COLOR_ID_PATTERN.test(id)) {
    throw colorLibraryError('COLOR_LIBRARY_INVALID_ID', 'The default color slot id is invalid.');
  }
  return id;
}

function normalizeSchemeId(value) {
  const id = String(value || '').trim().toLowerCase();
  if (!SCHEME_ID_PATTERN.test(id)) {
    throw colorLibraryError('COLOR_LIBRARY_INVALID_SCHEME_ID', 'The color scheme id is invalid.');
  }
  return id;
}

function createSchemeId() {
  if (typeof crypto.randomUUID === 'function') {
    return `scheme-${crypto.randomUUID().toLowerCase()}`;
  }
  return `scheme-${crypto.randomBytes(12).toString('hex')}`;
}

function normalizeStoredColor(value, index) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const createdAt = timestampOrEpoch(value.createdAt);
    return {
      id: `default-${index + 1}`,
      name: normalizeColorName(value.name || `Color ${index + 1}`),
      value: normalizeColorValue(value.value),
      createdAt,
      updatedAt: timestampOrEpoch(value.updatedAt || createdAt)
    };
  } catch {
    return null;
  }
}

function normalizeStoredScheme(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const colors = Array.isArray(value.colors)
      ? value.colors
        .slice(0, MAX_COLOR_COUNT)
        .map(normalizeStoredColor)
        .filter(Boolean)
      : [];
    if (!colors.length) return null;
    const createdAt = timestampOrEpoch(value.createdAt);
    return {
      id: normalizeSchemeId(value.id),
      name: normalizeSchemeName(value.name),
      colors,
      createdAt,
      updatedAt: timestampOrEpoch(value.updatedAt || createdAt)
    };
  } catch {
    return null;
  }
}

function defaultScheme() {
  const epoch = new Date(0).toISOString();
  return {
    id: DEFAULT_SCHEME_ID,
    name: 'Default',
    colors: DEFAULT_COLORS.map(color => ({
      ...color,
      createdAt: epoch,
      updatedAt: epoch
    })),
    createdAt: epoch,
    updatedAt: epoch
  };
}

function librarySnapshot(activeSchemeId, schemes) {
  const activeScheme = schemes.find(scheme => scheme.id === activeSchemeId) || schemes[0];
  return {
    version: COLOR_LIBRARY_VERSION,
    activeSchemeId: activeScheme?.id || '',
    schemes,
    // `colors` remains the small runtime/picker view. Its ids are stable
    // Default slots, so changing the active scheme updates linked elements.
    colors: activeScheme?.colors || []
  };
}

function emptyLibrary() {
  const scheme = defaultScheme();
  return librarySnapshot(scheme.id, [scheme]);
}

function parseJson(value) {
  if (typeof value !== 'string' || !value.trim()) return value;
  try {
    return JSON.parse(value);
  } catch {
    throw colorLibraryError(
      'COLOR_LIBRARY_STORAGE_INVALID',
      'The stored color scheme library is not valid JSON.'
    );
  }
}

function parseStoredLibrary(value) {
  const parsed = parseJson(value);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return emptyLibrary();
  }

  // Version 1 stored one ungrouped color list. It becomes a normal Default
  // scheme so existing installations keep their values without a parallel path.
  if (!Array.isArray(parsed.schemes) && Array.isArray(parsed.colors)) {
    const colors = parsed.colors
      .slice(0, MAX_COLOR_COUNT)
      .map(normalizeStoredColor)
      .filter(Boolean);
    const scheme = {
      ...defaultScheme(),
      colors: colors.length ? colors : defaultScheme().colors
    };
    return librarySnapshot(scheme.id, [scheme]);
  }

  const schemes = Array.isArray(parsed.schemes)
    ? parsed.schemes
      .slice(0, MAX_SCHEME_COUNT)
      .map(normalizeStoredScheme)
      .filter(Boolean)
    : [];
  if (!schemes.length) return emptyLibrary();
  const requestedActiveId = String(parsed.activeSchemeId || '').trim().toLowerCase();
  const activeSchemeId = schemes.some(scheme => scheme.id === requestedActiveId)
    ? requestedActiveId
    : schemes[0].id;
  return librarySnapshot(activeSchemeId, schemes);
}

function assertUniqueSchemeName(schemes, name, ignoredId = '') {
  const normalized = name.toLocaleLowerCase();
  if (schemes.some(scheme => scheme.id !== ignoredId && scheme.name.toLocaleLowerCase() === normalized)) {
    throw colorLibraryError(
      'COLOR_LIBRARY_SCHEME_NAME_EXISTS',
      `A color scheme named "${name}" already exists.`
    );
  }
}

function assertUniqueColorName(colors, name, ignoredId = '') {
  const normalized = name.toLocaleLowerCase();
  if (colors.some(color => color.id !== ignoredId && color.name.toLocaleLowerCase() === normalized)) {
    throw colorLibraryError(
      'COLOR_LIBRARY_NAME_EXISTS',
      `A Default color named "${name}" already exists in this scheme.`
    );
  }
}

function emitSettingsManager(motherEmitter, jwt, eventName, payload = {}) {
  return requestBackendEvent(motherEmitter, eventName, {
      ...payload,
      jwt,
      moduleName: 'settingsManager',
      moduleType: 'core'
    });
}

async function readColorLibrary(motherEmitter, jwt) {
  const stored = await emitSettingsManager(motherEmitter, jwt, BACKEND_EVENTS.GET_SETTING, {
    key: COLOR_LIBRARY_STORAGE_KEY
  });
  if (stored) return parseStoredLibrary(stored);
  const legacy = await emitSettingsManager(motherEmitter, jwt, BACKEND_EVENTS.GET_SETTING, {
    key: LEGACY_COLOR_LIBRARY_STORAGE_KEY
  });
  return parseStoredLibrary(legacy);
}

async function writeColorLibrary(motherEmitter, jwt, library) {
  const normalized = parseStoredLibrary(library);
  await emitSettingsManager(motherEmitter, jwt, BACKEND_EVENTS.SET_SETTING, {
    key: COLOR_LIBRARY_STORAGE_KEY,
    value: JSON.stringify(normalized)
  });
  return normalized;
}

function serializeMutation(task) {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.catch(() => undefined);
  return run;
}

function requireScheme(library, schemeId = library.activeSchemeId) {
  const id = normalizeSchemeId(schemeId);
  const scheme = library.schemes.find(entry => entry.id === id);
  if (!scheme) {
    throw colorLibraryError('COLOR_LIBRARY_SCHEME_NOT_FOUND', 'The color scheme was not found.');
  }
  return scheme;
}

function replaceScheme(library, nextScheme, activeSchemeId = library.activeSchemeId) {
  return librarySnapshot(
    activeSchemeId,
    library.schemes.map(scheme => scheme.id === nextScheme.id ? nextScheme : scheme)
  );
}

async function createColorScheme(motherEmitter, jwt, input = {}) {
  return serializeMutation(async () => {
    const library = await readColorLibrary(motherEmitter, jwt);
    if (library.schemes.length >= MAX_SCHEME_COUNT) {
      throw colorLibraryError(
        'COLOR_LIBRARY_SCHEME_LIMIT_REACHED',
        `At most ${MAX_SCHEME_COUNT} color schemes may be stored.`
      );
    }
    const name = normalizeSchemeName(input.name);
    assertUniqueSchemeName(library.schemes, name);
    const source = requireScheme(library, input.copyFromId || library.activeSchemeId);
    const timestamp = new Date().toISOString();
    const scheme = {
      id: createSchemeId(),
      name,
      colors: source.colors.map(color => ({
        ...color,
        createdAt: timestamp,
        updatedAt: timestamp
      })),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const saved = await writeColorLibrary(motherEmitter, jwt, librarySnapshot(
      scheme.id,
      [...library.schemes, scheme]
    ));
    return { scheme, library: saved };
  });
}

async function updateColorScheme(motherEmitter, jwt, input = {}) {
  return serializeMutation(async () => {
    const library = await readColorLibrary(motherEmitter, jwt);
    const existing = requireScheme(library, input.id);
    const name = normalizeSchemeName(input.name);
    assertUniqueSchemeName(library.schemes, name, existing.id);
    const scheme = { ...existing, name, updatedAt: new Date().toISOString() };
    const saved = await writeColorLibrary(motherEmitter, jwt, replaceScheme(library, scheme));
    return { scheme, library: saved };
  });
}

async function activateColorScheme(motherEmitter, jwt, input = {}) {
  return serializeMutation(async () => {
    const library = await readColorLibrary(motherEmitter, jwt);
    const scheme = requireScheme(library, input.id);
    const saved = await writeColorLibrary(
      motherEmitter,
      jwt,
      librarySnapshot(scheme.id, library.schemes)
    );
    return { scheme, library: saved };
  });
}

async function deleteColorScheme(motherEmitter, jwt, input = {}) {
  return serializeMutation(async () => {
    const library = await readColorLibrary(motherEmitter, jwt);
    const scheme = requireScheme(library, input.id);
    if (library.schemes.length === 1) {
      throw colorLibraryError(
        'COLOR_LIBRARY_LAST_SCHEME',
        'The last color scheme cannot be deleted.'
      );
    }
    const schemes = library.schemes.filter(entry => entry.id !== scheme.id);
    const activeSchemeId = library.activeSchemeId === scheme.id
      ? schemes[0].id
      : library.activeSchemeId;
    const saved = await writeColorLibrary(
      motherEmitter,
      jwt,
      librarySnapshot(activeSchemeId, schemes)
    );
    return { scheme, library: saved };
  });
}

async function createSavedColor(motherEmitter, jwt, input = {}) {
  return serializeMutation(async () => {
    const library = await readColorLibrary(motherEmitter, jwt);
    const existing = requireScheme(library, input.schemeId);
    if (existing.colors.length >= MAX_COLOR_COUNT) {
      throw colorLibraryError(
        'COLOR_LIBRARY_LIMIT_REACHED',
        `A color scheme may contain at most ${MAX_COLOR_COUNT} default slots.`
      );
    }
    const timestamp = new Date().toISOString();
    const name = normalizeColorName(input.name);
    assertUniqueColorName(existing.colors, name);
    const color = {
      id: `default-${existing.colors.length + 1}`,
      name,
      value: normalizeColorValue(input.value),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const scheme = {
      ...existing,
      colors: [...existing.colors, color],
      updatedAt: timestamp
    };
    const saved = await writeColorLibrary(motherEmitter, jwt, replaceScheme(library, scheme));
    return { color, scheme, library: saved };
  });
}

async function updateSavedColor(motherEmitter, jwt, input = {}) {
  return serializeMutation(async () => {
    const library = await readColorLibrary(motherEmitter, jwt);
    const existing = requireScheme(library, input.schemeId);
    const id = normalizeColorId(input.id);
    const index = existing.colors.findIndex(color => color.id === id);
    if (index < 0) {
      throw colorLibraryError('COLOR_LIBRARY_ENTRY_NOT_FOUND', 'The default color slot was not found.');
    }
    const current = existing.colors[index];
    const name = Object.prototype.hasOwnProperty.call(input, 'name')
      ? normalizeColorName(input.name)
      : current.name;
    assertUniqueColorName(existing.colors, name, id);
    const color = {
      ...current,
      name,
      value: Object.prototype.hasOwnProperty.call(input, 'value')
        ? normalizeColorValue(input.value)
        : current.value,
      updatedAt: new Date().toISOString()
    };
    const colors = [...existing.colors];
    colors[index] = color;
    const scheme = { ...existing, colors, updatedAt: color.updatedAt };
    const saved = await writeColorLibrary(motherEmitter, jwt, replaceScheme(library, scheme));
    return { color, scheme, library: saved };
  });
}

async function deleteSavedColor(motherEmitter, jwt, input = {}) {
  return serializeMutation(async () => {
    const library = await readColorLibrary(motherEmitter, jwt);
    const existing = requireScheme(library, input.schemeId);
    const id = normalizeColorId(input.id);
    const color = existing.colors.find(entry => entry.id === id);
    if (!color) {
      throw colorLibraryError('COLOR_LIBRARY_ENTRY_NOT_FOUND', 'The default color slot was not found.');
    }
    if (existing.colors.length === 1 || color.id !== `default-${existing.colors.length}`) {
      throw colorLibraryError(
        'COLOR_LIBRARY_SLOT_ORDER_LOCKED',
        'Only the last default color slot can be removed.'
      );
    }
    const scheme = {
      ...existing,
      colors: existing.colors.slice(0, -1),
      updatedAt: new Date().toISOString()
    };
    const saved = await writeColorLibrary(motherEmitter, jwt, replaceScheme(library, scheme));
    return {
      color,
      scheme,
      library: saved,
      linkedUsesKeepFallback: true
    };
  });
}

async function upsertColorScheme(motherEmitter, jwt, input = {}) {
  return serializeMutation(async () => {
    const library = await readColorLibrary(motherEmitter, jwt);
    const id = normalizeSchemeId(input.id);
    const name = normalizeSchemeName(input.name);
    const rawColors = Array.isArray(input.colors) ? input.colors : [];
    if (!rawColors.length) {
      throw colorLibraryError(
        'COLOR_LIBRARY_SCHEME_COLORS_REQUIRED',
        'A preset color scheme needs at least one default slot.'
      );
    }
    const now = new Date().toISOString();
    const current = library.schemes.find(scheme => scheme.id === id);
    assertUniqueSchemeName(library.schemes, name, current?.id || '');
    const scheme = normalizeStoredScheme({
      id,
      name,
      colors: rawColors,
      createdAt: current?.createdAt || now,
      updatedAt: now
    });
    if (!scheme) {
      throw colorLibraryError('COLOR_LIBRARY_INVALID_SCHEME', 'The preset color scheme is invalid.');
    }
    const schemes = current
      ? library.schemes.map(entry => entry.id === id ? scheme : entry)
      : [...library.schemes, scheme];
    if (schemes.length > MAX_SCHEME_COUNT) {
      throw colorLibraryError(
        'COLOR_LIBRARY_SCHEME_LIMIT_REACHED',
        `At most ${MAX_SCHEME_COUNT} color schemes may be stored.`
      );
    }
    const saved = await writeColorLibrary(
      motherEmitter,
      jwt,
      librarySnapshot(input.activate === false ? library.activeSchemeId : id, schemes)
    );
    return { scheme, library: saved };
  });
}

function resetMutationQueue() {
  mutationQueue = Promise.resolve();
}

module.exports = {
  COLOR_LIBRARY_STORAGE_KEY,
  COLOR_LIBRARY_VERSION,
  DEFAULT_SCHEME_ID,
  LEGACY_COLOR_LIBRARY_STORAGE_KEY,
  activateColorScheme,
  createColorScheme,
  createSavedColor,
  deleteColorScheme,
  deleteSavedColor,
  emptyLibrary,
  normalizeColorId,
  normalizeColorName,
  normalizeColorValue,
  normalizeSchemeId,
  normalizeSchemeName,
  parseStoredLibrary,
  readColorLibrary,
  resetMutationQueue,
  updateColorScheme,
  updateSavedColor,
  upsertColorScheme,
  writeColorLibrary,
  _internals: {
    colorLibraryError,
    assertUniqueColorName,
    createSchemeId,
    defaultScheme,
    emitSettingsManager,
    librarySnapshot,
    normalizeStoredColor,
    normalizeStoredScheme,
    requireScheme,
    serializeMutation
  }
};
