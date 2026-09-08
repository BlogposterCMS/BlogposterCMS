/**
 * mother/modules/databaseManager/placeholders/handlePlaceholder.js
 */
const builtinPlaceholders = require('./builtinPlaceholders');
const { isAnalyticsPlaceholder, handleAnalyticsSql, handleAnalyticsMongo } = require('./analyticsPlaceholders');
const { getCustomPlaceholder } = require('./placeholderRegistry');

// NEW: typed notification emitter
const notificationEmitter = require('../../../emitters/notificationEmitter');

/**
 * handlePlaceholder:
 *   1) Checks if it’s a Custom Placeholder.
 *   2) Else, if it's a built-in placeholder, call the Postgres or Mongo handler.
 *   3) If nothing matches => we log "No placeholder found."
 */
async function handlePlaceholder(dbClient, dbType, operation, params = []) {
  if (isAnalyticsPlaceholder(operation)) {
    if (dbType === 'mongodb') return handleAnalyticsMongo(dbClient, operation, params);
    if (dbType === 'sqlite' || dbType === 'postgres') return handleAnalyticsSql(dbClient, operation, params, dbType === 'postgres');
    throw new Error('ANALYTICS_STORAGE_ENGINE_UNSUPPORTED');
  }
  // 1) Check for a custom placeholder
  const customRef = getCustomPlaceholder(operation);
  if (customRef) {
    return await handleCustomPlaceholder(dbClient, customRef, operation, params);
  }

  // 2) If it's a built-in placeholder
  if (builtinPlaceholders.includes(operation)) {
    if (dbType === 'postgres') {
      const { handleBuiltInPlaceholderPostgres } = require('./postgresPlaceholders');
      return handleBuiltInPlaceholderPostgres(dbClient, operation, params);
    } else if (dbType === 'mongodb') {
      const { handleBuiltInPlaceholderMongo } = require('./mongoPlaceholders');
      return handleBuiltInPlaceholderMongo(dbClient, operation, params);
    } else if (dbType === 'sqlite') {
      const { handleBuiltInPlaceholderSqlite } = require('./sqlitePlaceholders');
      return handleBuiltInPlaceholderSqlite(dbClient, operation, params);
    } else {
      notificationEmitter.notify({
        moduleName: 'databaseManager',
        notificationType: 'system',
        priority: 'critical',
        message: `[PLACEHOLDER HANDLER] Unsupported dbType="${dbType}" for operation="${operation}".`
      });
      throw new Error(`[PLACEHOLDER HANDLER] Unsupported dbType="${dbType}" for operation="${operation}"`);
    }
  }

  // 3) If no placeholder found, just return a message
  notificationEmitter.notify({
    moduleName: 'databaseManager',
    notificationType: 'debug',
    priority: 'debug',
    message: `[PLACEHOLDER HANDLER] No placeholder found for operation="${operation}".`
  });
  return { message: `No placeholder found for operation="${operation}"` };
}

/**
 * handleCustomPlaceholder:
 *   - Calls the registered user-defined function (from placeholderRegistry).
 */
async function handleCustomPlaceholder(dbClient, customRef, operation, params) {
  const { moduleName, functionName } = customRef;
  const modObj = global.loadedModules && global.loadedModules[moduleName];

  if (!modObj) {
    notificationEmitter.notify({
      moduleName: 'databaseManager',
      notificationType: 'system',
      priority: 'critical',
      message: `[PLACEHOLDER HANDLER] No module object for "${moduleName}" in global.loadedModules.`
    });
    throw new Error(`[PLACEHOLDER HANDLER] No module object for "${moduleName}" in global.loadedModules.`);
  }

  if (modObj.runtime === 'process' || modObj.moduleType === 'community') {
    const message = `[E_PLACEHOLDER_PROCESS_MODULE_UNSUPPORTED] Custom placeholder "${operation}" belongs to external module "${moduleName}". Process-isolated modules cannot receive the host dbClient; expose a module-owned event or a core database contract instead.`;
    notificationEmitter.notify({
      moduleName: 'databaseManager',
      notificationType: 'system',
      priority: 'critical',
      message
    });
    throw new Error(message);
  }

  const fn = modObj[functionName];
  if (typeof fn !== 'function') {
    notificationEmitter.notify({
      moduleName: 'databaseManager',
      notificationType: 'system',
      priority: 'critical',
      message: `[PLACEHOLDER HANDLER] Function "${functionName}" not found in module "${moduleName}".`
    });
    throw new Error(`[PLACEHOLDER HANDLER] Function "${functionName}" not found in module "${moduleName}".`);
  }

  // call the custom function from the module
  return await fn({ dbClient, moduleName, operation, params });
}

module.exports = { handlePlaceholder };
