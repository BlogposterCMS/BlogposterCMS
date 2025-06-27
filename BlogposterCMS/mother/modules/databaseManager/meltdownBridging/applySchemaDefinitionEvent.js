/**
 * mother/modules/databaseManager/meltdownBridging/applySchemaDefinitionEvent.js
 */
const fs = require('fs');
const path = require('path');
const { onceCallback } = require('../../../emitters/motherEmitter');
const { getEngine } = require('../engines/engineFactory');
const { getDbType, moduleHasOwnDb } = require('../helpers/dbTypeHelpers');
const { parseSchemaDefinition } = require('../helpers/schemaDefinitionParser');
const notificationEmitter = require('../../../emitters/notificationEmitter');

function registerApplySchemaDefinitionEvent(motherEmitter) {
  motherEmitter.on('applySchemaDefinition', async (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, moduleName, filePath } = payload || {};
      if (!jwt || !moduleName || !filePath) {
        throw new Error('applySchemaDefinition => missing jwt, moduleName or filePath');
      }

      const repoRoot = path.resolve(__dirname, '../../../..');
      const communityDir = path.join(repoRoot, 'modules', moduleName);
      const coreDir = path.join(repoRoot, 'mother', 'modules', moduleName);
      const resolved = path.resolve(filePath);
      if (!resolved.startsWith(communityDir) && !resolved.startsWith(coreDir)) {
        throw new Error('applySchemaDefinition => filePath outside module directory');
      }

      const raw = fs.readFileSync(resolved, 'utf8');
      let def;
      try {
        def = JSON.parse(raw);
      } catch {
        throw new Error('applySchemaDefinition => invalid JSON');
      }

      const dbType = getDbType();
      const engine = getEngine();
      const isOwnDb = moduleHasOwnDb(moduleName);
      const ops = parseSchemaDefinition(def, dbType);

      for (const op of ops) {
        if (dbType === 'mongodb') {
          if (op.createCollection) {
            await engine.performMongoOperation(moduleName, 'createCollection', { collectionName: op.createCollection });
          }
        } else if (dbType === 'postgres') {
          await engine.performPostgresOperation(moduleName, op.sql, [], isOwnDb);
        } else if (dbType === 'sqlite') {
          await engine.performSqliteOperation(moduleName, op.sql, [], isOwnDb);
        }
      }

      notificationEmitter.notify({
        moduleName: 'databaseManager',
        notificationType: 'info',
        priority: 'info',
        message: `[DB MANAGER] Applied schema definition for "${moduleName}" via ${dbType}.`
      });
      callback(null, { applied: true });
    } catch (err) {
      notificationEmitter.notify({
        moduleName: 'databaseManager',
        notificationType: 'system',
        priority: 'critical',
        message: `applySchemaDefinition error => ${err.message}`
      });
      callback(err);
    }
  });
}

module.exports = { registerApplySchemaDefinitionEvent };
