/**
 * mother/modules/databaseManager/meltdownBridging/applySchemaFileEvent.js
 */
const fs = require('fs');
const path = require('path');
const { onceCallback } = require('../../../emitters/motherEmitter');
const { getEngine } = require('../engines/engineFactory');
const { getDbType, moduleHasOwnDb } = require('../helpers/dbTypeHelpers');
const notificationEmitter = require('../../../emitters/notificationEmitter');

function registerApplySchemaFileEvent(motherEmitter) {
  motherEmitter.on('applySchemaFile', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, moduleName, filePath } = payload || {};
      if (!jwt || !moduleName || !filePath) {
        throw new Error('applySchemaFile => missing jwt, moduleName or filePath');
      }

      const repoRoot = path.resolve(__dirname, '../../../..');
      const communityDir = path.join(repoRoot, 'modules', moduleName);
      const coreDir = path.join(repoRoot, 'mother', 'modules', moduleName);
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(communityDir) && !resolved.startsWith(coreDir)) {
        throw new Error('applySchemaFile => filePath outside module directory');
      }

      const raw = fs.readFileSync(resolved, 'utf8');
      let schemaDef;
      try {
        schemaDef = JSON.parse(raw);
      } catch {
        throw new Error('applySchemaFile => invalid JSON');
      }

      const dbType = getDbType();
      const actions = schemaDef[dbType];
      if (!Array.isArray(actions)) {
        throw new Error(`No actions for DB type "${dbType}"`);
      }

      const engine = getEngine();
      const isOwnDb = moduleHasOwnDb(moduleName);

      for (const action of actions) {
        if (dbType === 'mongodb') {
          if (action.createCollection) {
            await engine.performMongoOperation(moduleName, 'createCollection', { collectionName: action.createCollection });
          } else if (action.createIndex) {
            await engine.performMongoOperation(moduleName, 'createIndex', action.createIndex);
          }
        } else {
          if (typeof action !== 'string') {
            throw new Error('Expected SQL string in schema file');
          }
          if (dbType === 'postgres') {
            await engine.performPostgresOperation(moduleName, action, [], isOwnDb);
          } else if (dbType === 'sqlite') {
            await engine.performSqliteOperation(moduleName, action, [], isOwnDb);
          }
        }
      }

      notificationEmitter.notify({
        moduleName: 'databaseManager',
        notificationType: 'info',
        priority: 'info',
        message: `[DB MANAGER] Applied schema file for "${moduleName}" via ${dbType}.`
      });
      callback(null, { applied: true });
    } catch (err) {
      notificationEmitter.notify({
        moduleName: 'databaseManager',
        notificationType: 'system',
        priority: 'critical',
        message: `applySchemaFile error => ${err.message}`
      });
      callback(err);
    }
  });
}

module.exports = { registerApplySchemaFileEvent };
