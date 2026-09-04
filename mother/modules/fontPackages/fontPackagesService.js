'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

const crypto = require('crypto');

const FONT_PACKAGES_STORAGE_KEY = 'FONT_PACKAGES_V1';
const FONT_PACKAGES_VERSION = 1;
const DEFAULT_PACKAGE_ID = 'font-package-default';
const MAX_PACKAGE_COUNT = 32;
const MAX_PACKAGE_NAME_LENGTH = 80;
const PACKAGE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{7,79}$/;
const FONT_FAMILY_PATTERN = /^[\p{L}\p{N} _.'-]+$/u;
const LINKED_COLOR_PATTERN = /^var\(\s*--bp-color-([a-z0-9-]+)\s*,\s*(#[0-9a-f]{6}(?:[0-9a-f]{2})?)\s*\)$/i;
const HEX_COLOR_PATTERN = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CSS_LENGTH_PATTERN = /^(-?\d+(?:\.\d+)?)(px|rem|em|%)$/i;
const ROLE_NAMES = Object.freeze([
  'body',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'paragraph',
  'link',
  'button',
  'label',
  'small',
  'blockquote',
  'code'
]);
const STYLE_FIELDS = Object.freeze([
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'color',
  'fontStyle',
  'textTransform',
  'textDecoration'
]);

const DEFAULT_ROLE_STYLES = Object.freeze({
  body: {
    fontFamily: 'Work Sans',
    fontSize: '16px',
    fontWeight: '400',
    lineHeight: '1.6',
    letterSpacing: '0px',
    color: '#1F2937',
    fontStyle: 'normal',
    textTransform: 'none',
    textDecoration: 'none'
  },
  h1: {
    fontFamily: 'Manrope',
    fontSize: '48px',
    fontWeight: '700',
    lineHeight: '1.1',
    letterSpacing: '-0.02em',
    color: '#111827',
    fontStyle: 'normal',
    textTransform: 'none',
    textDecoration: 'none'
  },
  h2: {
    fontFamily: 'Manrope',
    fontSize: '40px',
    fontWeight: '700',
    lineHeight: '1.15',
    letterSpacing: '-0.02em',
    color: '#111827',
    fontStyle: 'normal',
    textTransform: 'none',
    textDecoration: 'none'
  },
  h3: {
    fontFamily: 'Manrope',
    fontSize: '32px',
    fontWeight: '650',
    lineHeight: '1.2',
    letterSpacing: '-0.01em',
    color: '#111827',
    fontStyle: 'normal',
    textTransform: 'none',
    textDecoration: 'none'
  },
  h4: {
    fontFamily: 'Manrope',
    fontSize: '26px',
    fontWeight: '650',
    lineHeight: '1.25',
    letterSpacing: '-0.01em',
    color: '#111827',
    fontStyle: 'normal',
    textTransform: 'none',
    textDecoration: 'none'
  },
  h5: {
    fontFamily: 'Manrope',
    fontSize: '21px',
    fontWeight: '650',
    lineHeight: '1.3',
    letterSpacing: '0px',
    color: '#111827',
    fontStyle: 'normal',
    textTransform: 'none',
    textDecoration: 'none'
  },
  h6: {
    fontFamily: 'Manrope',
    fontSize: '18px',
    fontWeight: '650',
    lineHeight: '1.35',
    letterSpacing: '0px',
    color: '#111827',
    fontStyle: 'normal',
    textTransform: 'none',
    textDecoration: 'none'
  },
  paragraph: {
    fontFamily: 'Work Sans',
    fontSize: '16px',
    fontWeight: '400',
    lineHeight: '1.65',
    letterSpacing: '0px',
    color: '#374151',
    fontStyle: 'normal',
    textTransform: 'none',
    textDecoration: 'none'
  },
  link: {
    fontFamily: 'Work Sans',
    fontSize: '16px',
    fontWeight: '550',
    lineHeight: '1.5',
    letterSpacing: '0px',
    color: '#2563EB',
    fontStyle: 'normal',
    textTransform: 'none',
    textDecoration: 'underline'
  },
  button: {
    fontFamily: 'Work Sans',
    fontSize: '15px',
    fontWeight: '600',
    lineHeight: '1.2',
    letterSpacing: '0.01em',
    color: '#111827',
    fontStyle: 'normal',
    textTransform: 'none',
    textDecoration: 'none'
  },
  label: {
    fontFamily: 'Work Sans',
    fontSize: '14px',
    fontWeight: '600',
    lineHeight: '1.3',
    letterSpacing: '0.01em',
    color: '#374151',
    fontStyle: 'normal',
    textTransform: 'none',
    textDecoration: 'none'
  },
  small: {
    fontFamily: 'Work Sans',
    fontSize: '13px',
    fontWeight: '400',
    lineHeight: '1.4',
    letterSpacing: '0px',
    color: '#6B7280',
    fontStyle: 'normal',
    textTransform: 'none',
    textDecoration: 'none'
  },
  blockquote: {
    fontFamily: 'Work Sans',
    fontSize: '20px',
    fontWeight: '500',
    lineHeight: '1.5',
    letterSpacing: '0px',
    color: '#374151',
    fontStyle: 'italic',
    textTransform: 'none',
    textDecoration: 'none'
  },
  code: {
    fontFamily: 'monospace',
    fontSize: '14px',
    fontWeight: '400',
    lineHeight: '1.5',
    letterSpacing: '0px',
    color: '#111827',
    fontStyle: 'normal',
    textTransform: 'none',
    textDecoration: 'none'
  }
});

let mutationQueue = Promise.resolve();

function fontPackagesError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

function cloneRoleStyles(styles) {
  return Object.fromEntries(ROLE_NAMES.map(role => [role, { ...styles[role] }]));
}

function defaultPackage(timestamp = new Date(0).toISOString()) {
  return {
    id: DEFAULT_PACKAGE_ID,
    name: 'Default',
    roles: cloneRoleStyles(DEFAULT_ROLE_STYLES),
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function emptyLibrary() {
  const pkg = defaultPackage();
  return {
    version: FONT_PACKAGES_VERSION,
    activePackageId: pkg.id,
    packages: [pkg]
  };
}

function normalizePackageId(value) {
  const id = String(value || '').trim().toLowerCase();
  if (!PACKAGE_ID_PATTERN.test(id)) {
    throw fontPackagesError('FONT_PACKAGES_INVALID_ID', 'The font package id is invalid.');
  }
  return id;
}

function createPackageId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().toLowerCase();
  }
  return `font-package-${crypto.randomBytes(12).toString('hex')}`;
}

function normalizePackageName(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim();
  if (!name) {
    throw fontPackagesError('FONT_PACKAGES_NAME_REQUIRED', 'A font package name is required.');
  }
  if (name.length > MAX_PACKAGE_NAME_LENGTH) {
    throw fontPackagesError(
      'FONT_PACKAGES_NAME_TOO_LONG',
      `Font package names may contain at most ${MAX_PACKAGE_NAME_LENGTH} characters.`
    );
  }
  return name;
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  if (!ROLE_NAMES.includes(role)) {
    throw fontPackagesError('FONT_PACKAGES_INVALID_ROLE', `Unknown typography role "${role}".`);
  }
  return role;
}

function normalizeFontFamily(value) {
  const family = String(value || '').replace(/\s+/g, ' ').trim();
  if (!family || family.length > 100 || !FONT_FAMILY_PATTERN.test(family)) {
    throw fontPackagesError(
      'FONT_PACKAGES_INVALID_FONT_FAMILY',
      'Font families must be a plain family name without CSS syntax.'
    );
  }
  return family;
}

function normalizeCssLength(value, field, { min, max, allowUnitless = false }) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'inherit' || raw === 'normal') return raw;
  if (allowUnitless && /^\d+(?:\.\d+)?$/.test(raw)) {
    const numeric = Number(raw);
    if (numeric >= min && numeric <= max) return raw;
  }
  const match = raw.match(CSS_LENGTH_PATTERN);
  const numeric = match ? Number(match[1]) : Number.NaN;
  if (!match || numeric < min || numeric > max) {
    throw fontPackagesError(
      'FONT_PACKAGES_INVALID_STYLE_VALUE',
      `${field} is outside the supported CSS range.`
    );
  }
  return `${match[1]}${match[2].toLowerCase()}`;
}

function normalizeFontWeight(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (['normal', 'bold', 'inherit'].includes(raw)) return raw;
  const numeric = Number(raw);
  if (!Number.isInteger(numeric) || numeric < 100 || numeric > 900) {
    throw fontPackagesError(
      'FONT_PACKAGES_INVALID_STYLE_VALUE',
      'fontWeight must be between 100 and 900.'
    );
  }
  return String(numeric);
}

function normalizeColor(value) {
  const raw = String(value || '').trim();
  if (raw.toLowerCase() === 'inherit') return 'inherit';
  const linked = raw.match(LINKED_COLOR_PATTERN);
  if (linked) {
    return `var(--bp-color-${linked[1].toLowerCase()}, ${linked[2].toUpperCase()})`;
  }
  if (!HEX_COLOR_PATTERN.test(raw)) {
    throw fontPackagesError(
      'FONT_PACKAGES_INVALID_COLOR',
      'Role colors must use a hex value or a linked Color Scheme token.'
    );
  }
  if (raw.length === 4) {
    return `#${raw.slice(1).split('').map(part => `${part}${part}`).join('')}`.toUpperCase();
  }
  return raw.toUpperCase();
}

function normalizeEnum(value, field, allowed) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!allowed.includes(normalized)) {
    throw fontPackagesError(
      'FONT_PACKAGES_INVALID_STYLE_VALUE',
      `${field} must be one of: ${allowed.join(', ')}.`
    );
  }
  return normalized;
}

function normalizeRoleField(field, value) {
  switch (field) {
    case 'fontFamily':
      return normalizeFontFamily(value);
    case 'fontSize':
      return normalizeCssLength(value, field, { min: 1, max: 320 });
    case 'fontWeight':
      return normalizeFontWeight(value);
    case 'lineHeight':
      return normalizeCssLength(value, field, { min: 0.5, max: 400, allowUnitless: true });
    case 'letterSpacing':
      return normalizeCssLength(value, field, { min: -10, max: 100 });
    case 'color':
      return normalizeColor(value);
    case 'fontStyle':
      return normalizeEnum(value, field, ['normal', 'italic', 'oblique', 'inherit']);
    case 'textTransform':
      return normalizeEnum(value, field, ['none', 'uppercase', 'lowercase', 'capitalize', 'inherit']);
    case 'textDecoration':
      return normalizeEnum(value, field, ['none', 'underline', 'line-through', 'inherit']);
    default:
      throw fontPackagesError('FONT_PACKAGES_UNKNOWN_STYLE_FIELD', `Unknown style field "${field}".`);
  }
}

function normalizeRoleStyles(role, value, base = DEFAULT_ROLE_STYLES[role]) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = {};
  STYLE_FIELDS.forEach(field => {
    const candidate = Object.prototype.hasOwnProperty.call(source, field)
      ? source[field]
      : base[field];
    normalized[field] = normalizeRoleField(field, candidate);
  });
  return normalized;
}

function normalizeStoredPackage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try {
    const id = normalizePackageId(value.id);
    const name = normalizePackageName(value.name);
    const rolesSource = value.roles && typeof value.roles === 'object' && !Array.isArray(value.roles)
      ? value.roles
      : {};
    const roles = Object.fromEntries(ROLE_NAMES.map(role => [
      role,
      normalizeRoleStyles(role, rolesSource[role])
    ]));
    const createdAt = typeof value.createdAt === 'string' && value.createdAt
      ? value.createdAt
      : new Date(0).toISOString();
    const updatedAt = typeof value.updatedAt === 'string' && value.updatedAt
      ? value.updatedAt
      : createdAt;
    return { id, name, roles, createdAt, updatedAt };
  } catch {
    return null;
  }
}

function parseStoredLibrary(value) {
  let parsed = value;
  if (typeof value === 'string' && value.trim()) {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw fontPackagesError(
        'FONT_PACKAGES_STORAGE_INVALID',
        'The stored font package library is not valid JSON.'
      );
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return emptyLibrary();
  }
  const packages = Array.isArray(parsed.packages)
    ? parsed.packages.map(normalizeStoredPackage).filter(Boolean).slice(0, MAX_PACKAGE_COUNT)
    : [];
  if (!packages.length) return emptyLibrary();
  const requestedActiveId = String(parsed.activePackageId || '').trim().toLowerCase();
  const activePackageId = packages.some(pkg => pkg.id === requestedActiveId)
    ? requestedActiveId
    : packages[0].id;
  return {
    version: FONT_PACKAGES_VERSION,
    activePackageId,
    packages
  };
}

function assertUniquePackageName(packages, name, ignoredId = '') {
  const normalized = name.toLocaleLowerCase();
  if (packages.some(pkg => pkg.id !== ignoredId && pkg.name.toLocaleLowerCase() === normalized)) {
    throw fontPackagesError(
      'FONT_PACKAGES_NAME_EXISTS',
      `A font package named "${name}" already exists.`
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

async function readFontPackages(motherEmitter, jwt) {
  const stored = await emitSettingsManager(motherEmitter, jwt, BACKEND_EVENTS.GET_SETTING, {
    key: FONT_PACKAGES_STORAGE_KEY
  });
  return parseStoredLibrary(stored);
}

async function writeFontPackages(motherEmitter, jwt, library) {
  const normalized = parseStoredLibrary(library);
  await emitSettingsManager(motherEmitter, jwt, BACKEND_EVENTS.SET_SETTING, {
    key: FONT_PACKAGES_STORAGE_KEY,
    value: JSON.stringify(normalized)
  });
  return normalized;
}

function serializeMutation(task) {
  const run = mutationQueue.then(task, task);
  mutationQueue = run.catch(() => undefined);
  return run;
}

function requirePackage(library, id) {
  const normalizedId = normalizePackageId(id);
  const pkg = library.packages.find(entry => entry.id === normalizedId);
  if (!pkg) {
    throw fontPackagesError('FONT_PACKAGES_ENTRY_NOT_FOUND', 'The font package was not found.');
  }
  return pkg;
}

async function createFontPackage(motherEmitter, jwt, input = {}) {
  return serializeMutation(async () => {
    const library = await readFontPackages(motherEmitter, jwt);
    if (library.packages.length >= MAX_PACKAGE_COUNT) {
      throw fontPackagesError(
        'FONT_PACKAGES_LIMIT_REACHED',
        `At most ${MAX_PACKAGE_COUNT} font packages may be stored.`
      );
    }
    const name = normalizePackageName(input.name);
    assertUniquePackageName(library.packages, name);
    const sourceId = input.copyFromId || library.activePackageId;
    const source = requirePackage(library, sourceId);
    const timestamp = new Date().toISOString();
    const pkg = {
      id: createPackageId(),
      name,
      roles: cloneRoleStyles(source.roles),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const saved = await writeFontPackages(motherEmitter, jwt, {
      ...library,
      activePackageId: pkg.id,
      packages: [...library.packages, pkg]
    });
    return { package: pkg, library: saved };
  });
}

async function updateFontPackage(motherEmitter, jwt, input = {}) {
  return serializeMutation(async () => {
    const library = await readFontPackages(motherEmitter, jwt);
    const existing = requirePackage(library, input.id);
    const name = Object.prototype.hasOwnProperty.call(input, 'name')
      ? normalizePackageName(input.name)
      : existing.name;
    assertUniquePackageName(library.packages, name, existing.id);
    const pkg = {
      ...existing,
      name,
      updatedAt: new Date().toISOString()
    };
    const saved = await writeFontPackages(motherEmitter, jwt, {
      ...library,
      packages: library.packages.map(entry => entry.id === pkg.id ? pkg : entry)
    });
    return { package: pkg, library: saved };
  });
}

async function updateFontPackageRole(motherEmitter, jwt, input = {}) {
  return serializeMutation(async () => {
    const library = await readFontPackages(motherEmitter, jwt);
    const existing = requirePackage(library, input.id);
    const role = normalizeRole(input.role);
    const changes = input.settings && typeof input.settings === 'object' && !Array.isArray(input.settings)
      ? input.settings
      : {};
    const unknownFields = Object.keys(changes).filter(field => !STYLE_FIELDS.includes(field));
    if (unknownFields.length) {
      throw fontPackagesError(
        'FONT_PACKAGES_UNKNOWN_STYLE_FIELD',
        `Unknown style fields: ${unknownFields.join(', ')}.`
      );
    }
    if (!Object.keys(changes).length) {
      throw fontPackagesError('FONT_PACKAGES_STYLE_REQUIRED', 'At least one role style is required.');
    }
    const merged = { ...existing.roles[role], ...changes };
    const roleStyles = normalizeRoleStyles(role, merged, existing.roles[role]);
    const pkg = {
      ...existing,
      roles: {
        ...existing.roles,
        [role]: roleStyles
      },
      updatedAt: new Date().toISOString()
    };
    const saved = await writeFontPackages(motherEmitter, jwt, {
      ...library,
      packages: library.packages.map(entry => entry.id === pkg.id ? pkg : entry)
    });
    return { package: pkg, role, roleStyles, library: saved };
  });
}

async function resetFontPackageRole(motherEmitter, jwt, input = {}) {
  return updateFontPackageRole(motherEmitter, jwt, {
    ...input,
    settings: { ...DEFAULT_ROLE_STYLES[normalizeRole(input.role)] }
  });
}

async function activateFontPackage(motherEmitter, jwt, input = {}) {
  return serializeMutation(async () => {
    const library = await readFontPackages(motherEmitter, jwt);
    const pkg = requirePackage(library, input.id);
    const saved = await writeFontPackages(motherEmitter, jwt, {
      ...library,
      activePackageId: pkg.id
    });
    return { package: pkg, library: saved };
  });
}

async function upsertFontPackage(motherEmitter, jwt, input = {}) {
  return serializeMutation(async () => {
    const library = await readFontPackages(motherEmitter, jwt);
    const id = normalizePackageId(input.id);
    const name = normalizePackageName(input.name);
    const existing = library.packages.find(pkg => pkg.id === id);
    assertUniquePackageName(library.packages, name, existing?.id || '');
    const timestamp = new Date().toISOString();
    const pkg = normalizeStoredPackage({
      id,
      name,
      roles: input.roles,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp
    });
    if (!pkg) {
      throw fontPackagesError(
        'FONT_PACKAGES_INVALID_PRESET_PACKAGE',
        'The preset font package is invalid.'
      );
    }
    const packages = existing
      ? library.packages.map(entry => entry.id === id ? pkg : entry)
      : [...library.packages, pkg];
    if (packages.length > MAX_PACKAGE_COUNT) {
      throw fontPackagesError(
        'FONT_PACKAGES_LIMIT_REACHED',
        `At most ${MAX_PACKAGE_COUNT} font packages may be stored.`
      );
    }
    const saved = await writeFontPackages(motherEmitter, jwt, {
      ...library,
      activePackageId: input.activate === false ? library.activePackageId : id,
      packages
    });
    return { package: pkg, library: saved };
  });
}

async function deleteFontPackage(motherEmitter, jwt, input = {}) {
  return serializeMutation(async () => {
    const library = await readFontPackages(motherEmitter, jwt);
    const pkg = requirePackage(library, input.id);
    if (library.packages.length === 1) {
      throw fontPackagesError(
        'FONT_PACKAGES_LAST_PACKAGE',
        'The last font package cannot be deleted.'
      );
    }
    const packages = library.packages.filter(entry => entry.id !== pkg.id);
    const activePackageId = library.activePackageId === pkg.id
      ? packages[0].id
      : library.activePackageId;
    const saved = await writeFontPackages(motherEmitter, jwt, {
      ...library,
      activePackageId,
      packages
    });
    return { package: pkg, library: saved };
  });
}

async function readPublicFontPackage(motherEmitter, jwt) {
  const library = await readFontPackages(motherEmitter, jwt);
  return {
    version: FONT_PACKAGES_VERSION,
    activePackage: library.packages.find(pkg => pkg.id === library.activePackageId)
      || library.packages[0]
  };
}

function resetMutationQueue() {
  mutationQueue = Promise.resolve();
}

module.exports = {
  DEFAULT_PACKAGE_ID,
  DEFAULT_ROLE_STYLES,
  FONT_PACKAGES_STORAGE_KEY,
  FONT_PACKAGES_VERSION,
  MAX_PACKAGE_COUNT,
  ROLE_NAMES,
  STYLE_FIELDS,
  activateFontPackage,
  createFontPackage,
  deleteFontPackage,
  emptyLibrary,
  normalizeColor,
  normalizeFontFamily,
  normalizePackageId,
  normalizePackageName,
  normalizeRole,
  normalizeRoleStyles,
  parseStoredLibrary,
  readFontPackages,
  readPublicFontPackage,
  resetFontPackageRole,
  resetMutationQueue,
  updateFontPackage,
  updateFontPackageRole,
  upsertFontPackage,
  writeFontPackages,
  _internals: {
    assertUniquePackageName,
    createPackageId,
    emitSettingsManager,
    fontPackagesError,
    normalizeCssLength,
    normalizeFontWeight,
    normalizeRoleField,
    normalizeStoredPackage,
    requirePackage,
    serializeMutation
  }
};
