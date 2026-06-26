'use strict';

const fs = require('fs');
const path = require('path');

const INTERNAL_DATABASE_CALL = Symbol('databaseManager.internalDatabaseCall');
const COMMUNITY_MUTATION_EVENTS = new Set(['dbInsert', 'dbUpdate', 'dbDelete']);
const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const SAFE_MODULE_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;

function getRegisteredModuleType(motherEmitter, moduleName) {
  if (!motherEmitter || !motherEmitter._moduleTypes || !moduleName) {
    return null;
  }
  return motherEmitter._moduleTypes[moduleName] || null;
}

function resolveModuleType(motherEmitter, payload = {}) {
  return getRegisteredModuleType(motherEmitter, payload.moduleName) ||
    payload.moduleType ||
    null;
}

function isCommunityDatabasePayload(motherEmitter, payload = {}) {
  return resolveModuleType(motherEmitter, payload) === 'community';
}

function assertCommunityDoesNotSpoofType(motherEmitter, payload = {}) {
  const registeredType = getRegisteredModuleType(motherEmitter, payload.moduleName);
  if (
    registeredType === 'community' &&
    payload.moduleType &&
    payload.moduleType !== 'community'
  ) {
    throw new Error(
      `[databaseManager] Community module "${payload.moduleName}" cannot emit database events as moduleType="${payload.moduleType}".`
    );
  }
}

function hasRawSqlPayload(payload = {}) {
  return payload.table === '__rawSQL__' ||
    Boolean(payload.data && payload.data.rawSQL) ||
    Boolean(payload.where && payload.where.rawSQL);
}

function assertHighLevelCrudAllowed(motherEmitter, eventName, payload = {}) {
  assertCommunityDoesNotSpoofType(motherEmitter, payload);

  if (!isCommunityDatabasePayload(motherEmitter, payload)) {
    return;
  }

  if (COMMUNITY_MUTATION_EVENTS.has(eventName)) {
    throw new Error(
      `[databaseManager] Community module "${payload.moduleName}" cannot call ${eventName}; use a core module contract instead.`
    );
  }

  if (eventName === 'dbSelect' && hasRawSqlPayload(payload)) {
    throw new Error(
      `[databaseManager] Community module "${payload.moduleName}" cannot use raw SQL database reads.`
    );
  }
}

function assertSafeDatabaseIdentifier(value, label) {
  const identifier = String(value || '');
  if (!SAFE_IDENTIFIER.test(identifier)) {
    throw new Error(`[databaseManager] Unsafe database identifier for ${label}: "${identifier}".`);
  }
}

function assertSafeLifecycleModuleName(value) {
  const moduleName = String(value || '');
  if (!SAFE_MODULE_NAME.test(moduleName)) {
    throw new Error(`[databaseManager] Unsafe lifecycle module name: "${moduleName}".`);
  }
  return moduleName;
}

function assertSafeObjectKeys(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return;
  }

  for (const key of Object.keys(value)) {
    assertSafeDatabaseIdentifier(key, `${label}.${key}`);
  }
}

function assertHighLevelCrudIdentifiers(eventName, payload = {}) {
  if (payload.table === '__rawSQL__') {
    return;
  }

  assertSafeDatabaseIdentifier(payload.table, 'table');

  if (eventName === 'dbInsert' || eventName === 'dbUpdate') {
    assertSafeObjectKeys(payload.data, 'data');
  }

  if (eventName !== 'dbInsert') {
    assertSafeObjectKeys(payload.where, 'where');
  }
}

function canUseRemoteDatabaseBridge(motherEmitter, payload = {}) {
  return !isCommunityDatabasePayload(motherEmitter, payload);
}

function markInternalDatabaseCall(payload, operationKind) {
  Object.defineProperty(payload, INTERNAL_DATABASE_CALL, {
    configurable: false,
    enumerable: false,
    value: true
  });
  if (operationKind) {
    Object.defineProperty(payload, 'databaseOperationKind', {
      configurable: false,
      enumerable: false,
      value: operationKind
    });
  }
  return payload;
}

function isInternalDatabaseCall(payload = {}) {
  return Boolean(payload[INTERNAL_DATABASE_CALL]);
}

function isCommunityReadOperation(payload = {}) {
  if (payload.databaseOperationKind !== 'select') {
    return false;
  }

  if (payload.operation === 'find') {
    return true;
  }

  return /^\s*SELECT\b/i.test(String(payload.operation || ''));
}

function normalizeSafeRawExpressionForColumn(column, expression) {
  assertSafeDatabaseIdentifier(column, 'raw expression column');
  const expr = String(expression || '').trim();
  const match = expr.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*([+-])\s*(\d+)$/);

  if (!match || match[1] !== column) {
    throw new Error(
      `[databaseManager] Unsafe raw expression for column "${column}".`
    );
  }

  return `"${column}" ${match[2]} ${match[3]}`;
}

function assertPerformDbOperationAllowed(motherEmitter, payload = {}) {
  assertCommunityDoesNotSpoofType(motherEmitter, payload);

  if (!isCommunityDatabasePayload(motherEmitter, payload)) {
    return;
  }

  if (!isInternalDatabaseCall(payload) || !isCommunityReadOperation(payload)) {
    throw new Error(
      `[databaseManager] Community module "${payload.moduleName}" cannot call performDbOperation directly.`
    );
  }
}

function assertDatabaseControlEventAllowed(motherEmitter, eventName, payload = {}) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || !moduleName) {
    throw new Error(`[databaseManager] ${eventName} requires jwt and moduleName.`);
  }

  assertSafeLifecycleModuleName(moduleName);
  assertCommunityDoesNotSpoofType(motherEmitter, payload);

  if (!isCommunityDatabasePayload(motherEmitter, payload)) {
    const registeredType = getRegisteredModuleType(motherEmitter, moduleName);
    if (registeredType && moduleType && moduleType !== registeredType) {
      throw new Error(
        `[databaseManager] Module "${moduleName}" is registered as "${registeredType}" and cannot emit ${eventName} as moduleType="${moduleType}".`
      );
    }
    if (moduleType !== 'core' && registeredType !== 'core') {
      throw new Error(`[databaseManager] ${eventName} requires moduleType="core".`);
    }
    return;
  }

  throw new Error(
    `[databaseManager] Community module "${payload.moduleName}" cannot call ${eventName}; schema and database lifecycle belong to core contracts.`
  );
}

function safeRealPath(targetPath) {
  try {
    return fs.realpathSync.native(targetPath);
  } catch {
    return path.resolve(targetPath);
  }
}

function isPathInside(parentPath, targetPath) {
  const relative = path.relative(parentPath, targetPath);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveModuleFilePath(repoRoot, moduleName, filePath, eventName) {
  const safeModuleName = assertSafeLifecycleModuleName(moduleName);
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error(`${eventName} => filePath must be a string`);
  }
  const resolved = path.resolve(filePath);
  const allowedRoots = [
    path.resolve(repoRoot, 'modules', safeModuleName),
    path.resolve(repoRoot, 'mother', 'modules', safeModuleName)
  ].map(safeRealPath);
  const realTarget = safeRealPath(resolved);

  if (!allowedRoots.some(root => isPathInside(root, realTarget))) {
    throw new Error(`${eventName} => filePath outside module directory`);
  }

  return resolved;
}

module.exports = {
  assertDatabaseControlEventAllowed,
  assertHighLevelCrudIdentifiers,
  assertHighLevelCrudAllowed,
  assertPerformDbOperationAllowed,
  canUseRemoteDatabaseBridge,
  markInternalDatabaseCall,
  normalizeSafeRawExpressionForColumn,
  resolveModuleFilePath,
  _internals: {
    assertSafeDatabaseIdentifier,
    assertSafeLifecycleModuleName,
    getRegisteredModuleType,
    hasRawSqlPayload,
    isCommunityDatabasePayload,
    isCommunityReadOperation,
    isInternalDatabaseCall,
    isPathInside,
    resolveModuleType
  }
};
