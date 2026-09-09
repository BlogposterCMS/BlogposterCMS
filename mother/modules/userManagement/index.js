/**
 * mother/modules/userManagement/index.js
 *
 * The main entry point for userManagement module:
 *   1) Ensures the DB or schema is created
 *   2) Ensures the default roles
 *   3) Hooks up meltdown event listeners for user CRUD, roles, login, etc.
 */

const {
  ensureUserManagementDatabase,
  ensureUserManagementSchemaAndTables,
  ensureDefaultRoles,
  ensureDefaultPermissions,
  ensureUserColorField,
  ensureFirstUserIsAdmin
} = require('./userInitService');

const { setupUserCrudEvents } = require('./userCrudEvents');
const { setupRoleCrudEvents } = require('./roleCrudEvents');
const { setupLoginEvents }    = require('./loginEvents');
const { setupPermissionCrudEvents } = require('./permissionCrudEvents');

const MODULE_NAME = 'userManagement';
const MODULE_TYPE = 'core';
const { requestBackendEvent } = require('../../contracts/backendEventContracts');
const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

async function initialize({ motherEmitter, app, dbConfig, isCore, jwt, isModuleUpdate = false }) {
  console.log('[USER MANAGEMENT] Initializing user management module...');

  if (!isCore) {
    throw new Error('[USER MANAGEMENT] Must be loaded as a core module.');
  }
  if (!jwt) {
    throw new Error('[USER MANAGEMENT] initialization requires a valid JWT token.');
  }
  if (!motherEmitter) {
    throw new Error('[USER MANAGEMENT] motherEmitter missing.');
  }
  if (typeof motherEmitter.registerModuleType === 'function') {
    motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
  }

  try {
    // Role/permission seeding belongs to host startup, never handler updates.
    if (!isModuleUpdate) {
      // A) Ensure DB or schema
      await ensureUserManagementDatabase(motherEmitter, jwt);
      // B) Ensure user tables exist
      await ensureUserManagementSchemaAndTables(motherEmitter, jwt);
      // C) Create default roles (admin, standard) if missing
      await ensureDefaultRoles(motherEmitter, jwt);
      // D) Ensure default permissions for system to work
      await ensureDefaultPermissions(motherEmitter, jwt);
      await ensureUserColorField(motherEmitter, jwt);

      await ensureFirstUserIsAdmin(motherEmitter, jwt);
    }

    // D) Now set up meltdown event listeners
    setupUserCrudEvents(motherEmitter);
    setupRoleCrudEvents(motherEmitter);
    setupPermissionCrudEvents(motherEmitter);
    setupLoginEvents(motherEmitter);
    
    console.log('[USER MANAGEMENT] Module initialized successfully. meltdown meltdown avoided!');
  } catch (err) {
    console.error('[USER MANAGEMENT] Error during initialization:', err.message);
    throw err;
  }
}

async function healthCheck({ motherEmitter, jwt }) {
  await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
    jwt, moduleName: MODULE_NAME, moduleType: MODULE_TYPE, table: 'roles'
  });
}

module.exports = { lifecycleVersion: 1, initialize, healthCheck, MODULE_NAME, MODULE_TYPE };
