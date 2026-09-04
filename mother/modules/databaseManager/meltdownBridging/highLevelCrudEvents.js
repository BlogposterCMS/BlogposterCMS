

const { requestBackendEvent } = require('../../../contracts/backendEventContracts');

const { BACKEND_EVENTS } = require('../../../contracts/generatedBackendEventCatalog');

/**
 * mother/modules/databaseManager/meltdownBridging/highLevelCrudEvents.js
 *
 * Registers meltdown events for dbInsert, dbSelect, dbUpdate, dbDelete.
 * Either calls out to a remote microservice via HTTP (if REMOTE_URL_<moduleName> is set),
 * or uses local meltdown bridging (performDbOperation).
 */

require('dotenv').config();
const axios = require('axios');
const {
  deactivateModuleRuntime,
  onceCallback
} = require('../../../emitters/motherEmitter');
const { sanitize } = require('../../../utils/logSanitizer');
const { getDbType } = require('../helpers/dbTypeHelpers');
const { ph } = require('../helpers/placeholderHelpers');
const {
  assertHighLevelCrudIdentifiers,
  assertHighLevelCrudAllowed,
  canUseRemoteDatabaseBridge,
  isCommunityStorageCall,
  markInternalDatabaseCall,
  normalizeSafeRawExpressionForColumn
} = require('./databaseEventBoundary');

// Notification emitter for typed notifications
const notificationEmitter = require('../../../emitters/notificationEmitter');


/**
 * registerHighLevelCrudEvents:
 *   Binds meltdown events:
 *     - dbInsert
 *     - dbSelect
 *     - dbUpdate
 *     - dbDelete
 *
 *   Each event can be handled either:
 *     (a) via remote microservice call (if REMOTE_URL_MODULE is defined)
 *     (b) or locally via localDbXYZ(...) → which calls `performDbOperation`.
 */
function registerHighLevelCrudEvents(motherEmitter) {
  /*
   * ========================
   * 1) dbInsert
   * ========================
   */
  motherEmitter.on(
    BACKEND_EVENTS.DB_INSERT,
    Object.assign(async (payload, originalCb) => {
      const callback = onceCallback(originalCb);
      const { moduleName, table, data } = payload || {};

      try {
        if (!moduleName || !table || !data) {
          throw new Error('dbInsert => missing moduleName, table, or data.');
        }

        assertHighLevelCrudAllowed(motherEmitter, BACKEND_EVENTS.DB_INSERT, payload);
        assertHighLevelCrudIdentifiers(BACKEND_EVENTS.DB_INSERT, payload);

        const remoteUrl = canUseRemoteDatabaseBridge(motherEmitter, payload)
          ? getRemoteUrlForModule(moduleName)
          : null;
        if (remoteUrl) {
          // Remote scenario => call the remote service
          try {
            const result = await remoteDbInsert(remoteUrl, moduleName, table, data);
            callback(null, result);
          } catch (remoteErr) {
            callback(remoteErr);
          }
          return; // Important! End here so we don't also do localDbInsert
        }

        // Otherwise handle it locally
        localDbInsert(motherEmitter, payload, callback);

      } catch (error) {
        notificationEmitter.notify({
          moduleName: moduleName || 'databaseManager',
          notificationType: 'system',
          priority: 'critical',
          message: `dbInsert error => ${error.message}`
        });
        if (moduleName) {
          deactivateModuleRuntime(motherEmitter, moduleName, error.message);
        }
        callback(error);
      }
    }, { moduleName: 'databaseManager' })
  );

  /*
   * ========================
   * 2) dbSelect
   * ========================
   */
  motherEmitter.on(
    BACKEND_EVENTS.DB_SELECT,
    Object.assign(async (payload, originalCb) => {
      const callback = onceCallback(originalCb);
      const { moduleName, table } = payload || {};

      try {
        if (!moduleName || !table) {
          throw new Error('dbSelect => missing moduleName or table.');
        }

        assertHighLevelCrudAllowed(motherEmitter, BACKEND_EVENTS.DB_SELECT, payload);
        assertHighLevelCrudIdentifiers(BACKEND_EVENTS.DB_SELECT, payload);

        const remoteUrl = canUseRemoteDatabaseBridge(motherEmitter, payload)
          ? getRemoteUrlForModule(moduleName)
          : null;
        if (remoteUrl) {
          // Remote scenario => call the remote service
          try {
            const result = await remoteDbSelect(remoteUrl, moduleName, table, payload.where || {});
            callback(null, result);
          } catch (remoteErr) {
            callback(remoteErr);
          }
          return;
        }

        // Otherwise handle it locally
        localDbSelect(motherEmitter, payload, callback);

      } catch (error) {
        console.error(`[dbSelect] Error occurred:`, sanitize(error.message));
        notificationEmitter.notify({
          moduleName: moduleName || 'databaseManager',
          notificationType: 'system',
          priority: 'critical',
          message: `dbSelect error => ${error.message}`
        });
        if (moduleName) {
          deactivateModuleRuntime(motherEmitter, moduleName, error.message);
        }
        callback(error);
      }
    }, { moduleName: 'databaseManager' })
  );

  /*
   * ========================
   * 3) dbUpdate
   * ========================
   */
  motherEmitter.on(
    BACKEND_EVENTS.DB_UPDATE,
    Object.assign(async (payload, originalCb) => {
      const callback = onceCallback(originalCb);
      const { moduleName, table, data } = payload || {};

      try {
        if (!moduleName || !table || !data) {
          throw new Error('dbUpdate => missing moduleName, table, or data.');
        }

        assertHighLevelCrudAllowed(motherEmitter, BACKEND_EVENTS.DB_UPDATE, payload);
        assertHighLevelCrudIdentifiers(BACKEND_EVENTS.DB_UPDATE, payload);

        const remoteUrl = canUseRemoteDatabaseBridge(motherEmitter, payload)
          ? getRemoteUrlForModule(moduleName)
          : null;
        if (remoteUrl) {
          // Remote scenario
          try {
            const result = await remoteDbUpdate(remoteUrl, moduleName, table, payload.where || {}, data);
            callback(null, result);
          } catch (remoteErr) {
            callback(remoteErr);
          }
          return;
        }

        // Otherwise handle it locally
        localDbUpdate(motherEmitter, payload, callback);

      } catch (error) {
        notificationEmitter.notify({
          moduleName: moduleName || 'databaseManager',
          notificationType: 'system',
          priority: 'critical',
          message: `dbUpdate error => ${error.message}`
        });
        if (moduleName) {
          deactivateModuleRuntime(motherEmitter, moduleName, error.message);
        }
        callback(error);
      }
    }, { moduleName: 'databaseManager' })
  );

  /*
   * ========================
   * 4) dbDelete
   * ========================
   */
  motherEmitter.on(
    BACKEND_EVENTS.DB_DELETE,
    Object.assign(async (payload, originalCb) => {
      const callback = onceCallback(originalCb);
      const { moduleName, table, where } = payload || {};

      try {
        if (!moduleName || !table || !where) {
          throw new Error('dbDelete => missing moduleName, table, or where.');
        }

        assertHighLevelCrudAllowed(motherEmitter, BACKEND_EVENTS.DB_DELETE, payload);
        assertHighLevelCrudIdentifiers(BACKEND_EVENTS.DB_DELETE, payload);

        const remoteUrl = canUseRemoteDatabaseBridge(motherEmitter, payload)
          ? getRemoteUrlForModule(moduleName)
          : null;
        if (remoteUrl) {
          // Remote scenario
          try {
            const result = await remoteDbDelete(remoteUrl, moduleName, table, where);
            callback(null, result);
          } catch (remoteErr) {
            callback(remoteErr);
          }
          return;
        }

        // Otherwise handle it locally
        localDbDelete(motherEmitter, payload, callback);

      } catch (error) {
        notificationEmitter.notify({
          moduleName: moduleName || 'databaseManager',
          notificationType: 'system',
          priority: 'critical',
          message: `dbDelete error => ${error.message}`
        });
        if (moduleName) {
          deactivateModuleRuntime(motherEmitter, moduleName, error.message);
        }
        callback(error);
      }
    }, { moduleName: 'databaseManager' })
  );
}

/* ------------------------------------------------------------------
   Remote bridging calls
   ------------------------------------------------------------------ */
function getRemoteUrlForModule(moduleName) {
  const key = 'REMOTE_URL_' + moduleName;
  const url = process.env[key] || null;
  if (!url) return null;
  if (!isAllowedRemoteUrl(url)) {
    console.warn(`[databaseManager] Remote URL for ${moduleName} not allowed.`);
    return null;
  }
  return url;
}

function isAllowedRemoteUrl(urlString) {
  try {
    const allowed = (process.env.REMOTE_URL_ALLOWLIST || '').split(',').map(h => h.trim()).filter(Boolean);
    if (!allowed.length) return false;
    const { host } = new URL(urlString);
    return allowed.includes(host);
  } catch {
    return false;
  }
}

async function remoteDbInsert(baseUrl, moduleName, table, data) {
  const resp = await axios.post(`${baseUrl}/dbInsert`, { moduleName, table, data }, { maxRedirects: 0 });
  return resp.data;
}

async function remoteDbSelect(baseUrl, moduleName, table, where) {
  const resp = await axios.post(`${baseUrl}/dbSelect`, { moduleName, table, where }, { maxRedirects: 0 });
  return resp.data;
}

async function remoteDbUpdate(baseUrl, moduleName, table, where, data) {
  const resp = await axios.post(`${baseUrl}/dbUpdate`, { moduleName, table, where, data }, { maxRedirects: 0 });
  return resp.data;
}

async function remoteDbDelete(baseUrl, moduleName, table, where) {
  const resp = await axios.post(`${baseUrl}/dbDelete`, { moduleName, table, where }, { maxRedirects: 0 });
  return resp.data;
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replace(/"/g, '""')}"`;
}

function resolveSqlTableName(payload) {
  const { moduleName, table } = payload;
  if (isCommunityStorageCall(payload)) {
    return quoteIdentifier(table);
  }
  if (getDbType() === 'postgres') {
    return `${quoteIdentifier(moduleName.toLowerCase())}.${quoteIdentifier(table)}`;
  }
  return quoteIdentifier(`${moduleName.toLowerCase()}_${table}`);
}

function resolveCollectionName(payload) {
  return payload.table;
}

/* ------------------------------------------------------------------
   Local meltdown bridging
   ------------------------------------------------------------------ */
function localDbInsert(motherEmitter, payload, callback) {
  const { jwt, moduleName, table, data, where, moduleType } = payload;
  if (table === '__rawSQL__') {
    if (moduleType !== 'core') {
      return callback(new Error('[localDbInsert] __rawSQL__ forbidden for non-core modules.'));
    }
    if (!data.rawSQL) {
      return callback(new Error('[localDbInsert] Missing data.rawSQL for "__rawSQL__"'));
    }
    requestBackendEvent(motherEmitter, BACKEND_EVENTS.PERFORM_DB_OPERATION, markInternalDatabaseCall({
        jwt,
        moduleName,
        operation: data.rawSQL,
        params: extractParamsIfNeeded(data, where)
      }, 'raw')).then(result => callback(null, result), error => callback(error));
    return;
  }

  // Normal insert approach
  if (getDbType() === 'mongodb') {
    requestBackendEvent(motherEmitter, BACKEND_EVENTS.PERFORM_DB_OPERATION, markInternalDatabaseCall({
        jwt,
        moduleName,
        operation: 'insertOne',
        params: { collectionName: resolveCollectionName(payload), doc: data }
      }, 'insert')).then(result => {
  callback(null, result);
}, err => {
  return callback(err);
});
    return;
  }

  const columns = Object.keys(data);
  if (!columns.length) {
    return callback(new Error('[localDbInsert] No columns in data.'));
  }
  const placeholders = columns.map((_, i) => ph(i+1));
  const values = Object.values(data);

  const tableName = resolveSqlTableName(payload);
  const sql = `
    INSERT INTO ${tableName}
    (${columns.join(', ')})
    VALUES (${placeholders.join(', ')})
    RETURNING *;
  `;
  requestBackendEvent(motherEmitter, BACKEND_EVENTS.PERFORM_DB_OPERATION, markInternalDatabaseCall({ jwt, moduleName, operation: sql, params: values }, 'insert')).then(result => {
  callback(null, result?.rows || []);
}, err => {
  return callback(err);
});
}

function localDbSelect(motherEmitter, payload, callback) {
  const { jwt, moduleName, table, where, data, moduleType } = payload;
  if (table === '__rawSQL__') {
    if (moduleType !== 'core') {
      return callback(new Error('[localDbSelect] __rawSQL__ forbidden for non-core modules.'));
    }
    const rawSQL = data?.rawSQL || where?.rawSQL;
    if (!rawSQL) {
      return callback(new Error('[localDbSelect] Missing rawSQL for "__rawSQL__" approach.'));
    }
    requestBackendEvent(motherEmitter, BACKEND_EVENTS.PERFORM_DB_OPERATION, markInternalDatabaseCall({
        jwt,
        moduleName,
        operation: rawSQL,
        params: extractParamsIfNeeded(data, where)
      }, 'raw')).then(result => {
  callback(null, result?.rows || result || []);
}, err => {
  return callback(err);
});
    return;
  }

  // Normal SELECT approach
  if (getDbType() === 'mongodb') {
    requestBackendEvent(motherEmitter, BACKEND_EVENTS.PERFORM_DB_OPERATION, markInternalDatabaseCall({
        jwt,
        moduleName,
        operation: 'find',
        params: { collectionName: resolveCollectionName(payload), query: where || {} }
      }, 'select')).then(result => {
  const docs = (result || []).map(doc => {
    if (doc && doc._id && !doc.id) {
      const {
        _id,
        ...rest
      } = doc;
      return {
        id: _id,
        ...rest
      };
    }
    return doc;
  });
  callback(null, docs);
}, err => {
  return callback(err);
});
    return;
  }

  let whereClause = '';
  let values = [];
  if (where && Object.keys(where).length > 0) {
    const keys = Object.keys(where);
    const conditions = keys.map((col, i) => `"${col}" = ${ph(i+1)}`);
    whereClause = 'WHERE ' + conditions.join(' AND ');
    values = Object.values(where);
  }

  const tableName = resolveSqlTableName(payload);
  const sql = `
    SELECT *
    FROM ${tableName}
    ${whereClause}
    ORDER BY id DESC
  `;
  requestBackendEvent(motherEmitter, BACKEND_EVENTS.PERFORM_DB_OPERATION, markInternalDatabaseCall({ jwt, moduleName, operation: sql, params: values }, 'select')).then(result => {
  callback(null, result?.rows || []);
}, err => {
  return callback(err);
});
}

function localDbUpdate(motherEmitter, payload, callback) {
  const { jwt, moduleName, table, data, where, moduleType } = payload;
  if (table === '__rawSQL__') {
    if (moduleType !== 'core') {
      return callback(new Error('[localDbUpdate] __rawSQL__ forbidden for non-core modules.'));
    }
    if (!data.rawSQL) {
      return callback(new Error('[localDbUpdate] Missing data.rawSQL for "__rawSQL__"'));
    }
    requestBackendEvent(motherEmitter, BACKEND_EVENTS.PERFORM_DB_OPERATION, markInternalDatabaseCall({
        jwt,
        moduleName,
        operation: data.rawSQL,
        params: extractParamsIfNeeded(data, where)
      }, 'raw')).then(result => callback(null, result), error => callback(error));
    return;
  }

  // Normal UPDATE approach
  if (getDbType() === 'mongodb') {
    const setOps = {};
    const incOps = {};
    for (const [key, val] of Object.entries(data || {})) {
      if (
        val &&
        typeof val === 'object' &&
        Object.prototype.hasOwnProperty.call(val, '__raw_expr')
      ) {
        const expr = String(val.__raw_expr).trim();
        let match = expr.match(/^([A-Za-z0-9_]+)\s*\+\s*(\d+)$/);
        if (match && match[1] === key) {
          incOps[key] = Number(match[2]);
          continue;
        }
        match = expr.match(/^([A-Za-z0-9_]+)\s*-\s*(\d+)$/);
        if (match && match[1] === key) {
          incOps[key] = -Number(match[2]);
          continue;
        }
        // Fallback: treat as normal value
        setOps[key] = val;
      } else {
        setOps[key] = val;
      }
    }

    const updateObj = {};
    if (Object.keys(setOps).length) updateObj.$set = setOps;
    if (Object.keys(incOps).length) updateObj.$inc = incOps;

    requestBackendEvent(motherEmitter, BACKEND_EVENTS.PERFORM_DB_OPERATION, markInternalDatabaseCall({
        jwt,
        moduleName,
        operation: 'updateOne',
        params: { collectionName: resolveCollectionName(payload), query: where, update: updateObj }
      }, 'update')).then(result => {
  callback(null, result);
}, err => {
  return callback(err);
});
    return;
  }

  const setKeys = Object.keys(data || {});
  if (!setKeys.length) {
    return callback(new Error('[localDbUpdate] No update data provided.'));
  }
  // Support raw expressions with { __raw_expr: 'sql' }
  const setClauses = [];
  const setValues = [];
  let paramIndex = 1;
  for (const col of setKeys) {
    const val = data[col];
    if (val && typeof val === 'object' && Object.prototype.hasOwnProperty.call(val, '__raw_expr')) {
      setClauses.push(`"${col}" = ${normalizeSafeRawExpressionForColumn(col, val.__raw_expr)}`);
    } else {
      setClauses.push(`"${col}" = ${ph(paramIndex)}`);
      setValues.push(val);
      paramIndex += 1;
    }
  }

  const whereKeys = Object.keys(where || {});
  if (!whereKeys.length) {
    return callback(new Error('[localDbUpdate] Missing WHERE condition => too dangerous.'));
  }
  const whereClauses = [];
  const whereValues = [];
  for (const col of whereKeys) {
    whereClauses.push(`"${col}" = ${ph(paramIndex)}`);
    whereValues.push(where[col]);
    paramIndex += 1;
  }

  const allValues = [...setValues, ...whereValues];

  const tableName = resolveSqlTableName(payload);
  const sql = `
    UPDATE ${tableName}
    SET ${setClauses.join(', ')}
    WHERE ${whereClauses.join(' AND ')}
    RETURNING *;
  `;

  requestBackendEvent(motherEmitter, BACKEND_EVENTS.PERFORM_DB_OPERATION, markInternalDatabaseCall({ jwt, moduleName, operation: sql, params: allValues }, 'update')).then(result => {
  callback(null, result?.rows || []);
}, err => {
  return callback(err);
});
}

function localDbDelete(motherEmitter, payload, callback) {
  const { jwt, moduleName, table, where, data, moduleType } = payload;
  const rawSQL = where?.rawSQL || data?.rawSQL;
  if (table === '__rawSQL__' && rawSQL) {
    if (moduleType !== 'core') {
      return callback(new Error('[localDbDelete] __rawSQL__ forbidden for non-core modules.'));
    }
    requestBackendEvent(motherEmitter, BACKEND_EVENTS.PERFORM_DB_OPERATION, markInternalDatabaseCall({
        jwt,
        moduleName,
        operation: rawSQL,
        params: extractParamsIfNeeded(data, where)
      }, 'raw')).then(result => callback(null, result), error => callback(error));
    return;
  }

  const whereKeys = Object.keys(where || {});
  if (!whereKeys.length) {
    return callback(new Error('[localDbDelete] Empty WHERE => refusing to delete everything.'));
  }
  if (getDbType() === 'mongodb') {
    requestBackendEvent(motherEmitter, BACKEND_EVENTS.PERFORM_DB_OPERATION, markInternalDatabaseCall({
        jwt,
        moduleName,
        operation: 'deleteOne',
        params: { collectionName: resolveCollectionName(payload), query: where }
      }, 'delete')).then(result => {
  callback(null, result);
}, err => {
  return callback(err);
});
    return;
  }

  const whereClauses = whereKeys.map((col, i) => `"${col}" = ${ph(i+1)}`);
  const whereValues = Object.values(where);

  const tableName = resolveSqlTableName(payload);
  const sql = `
    DELETE FROM ${tableName}
    WHERE ${whereClauses.join(' AND ')}
    RETURNING *;
  `;

  requestBackendEvent(motherEmitter, BACKEND_EVENTS.PERFORM_DB_OPERATION, markInternalDatabaseCall({ jwt, moduleName, operation: sql, params: whereValues }, 'delete')).then(result => {
  callback(null, result?.rows || []);
}, err => {
  return callback(err);
});
}

/**
 * Helper function to handle rawSQL param arrays in meltdown payload
 *
 * Falls back to the `where` object when `data` is omitted so calls like
 * `dbDelete` with parameters in `where` don't crash on undefined values.
 */
function extractParamsIfNeeded(dataObj = {}, whereObj = {}) {
  // Prefer explicitly provided data; otherwise look at the WHERE clause.
  const source = Object.keys(dataObj).length ? dataObj : whereObj;

  if (source.params !== undefined) {
    return Array.isArray(source.params)
      ? source.params
      : [ source.params ];
  }
  const numericKeys = Object.keys(source)
    .filter(k => /^\d+$/.test(k))
    .sort((a,b) => a - b);
  if (numericKeys.length) {
    return numericKeys.map(k => source[k]);
  }

  // If rawSQL has named parameters, map common placeholders to positional
  // arrays for database engine adapters. Fallback to returning the object
  // as-is for custom handlers.
  if (source.rawSQL) {
    if (source.rawSQL === 'GET_SETTING' && source.key !== undefined) {
      return [ source.key ];
    }
    if (
      source.rawSQL === 'UPSERT_SETTING' &&
      source.key !== undefined &&
      source.value !== undefined
    ) {
      return [ source.key, source.value ];
    }
    if (source.rawSQL === 'DELETE_SETTING' && source.key !== undefined) {
      return [ source.key ];
    }
    if (Object.keys(source).some(k => !/^(rawSQL|params|\d+)$/.test(k))) {
      // Preserve named parameters but wrap them in an array so placeholders
      // expecting params[0] receive the object consistently across engines.
      return [ source ];
    }
  }

  return [ source ];
}

module.exports = {
  registerHighLevelCrudEvents
};
