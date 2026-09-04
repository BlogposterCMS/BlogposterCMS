

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

// mother/modules/userManagement/userService.js

require('dotenv').config();

const ADMIN_PERMISSIONS = JSON.stringify({ '*': true });

/**
 * ensureUserManagementDatabase:
 *   1) Emits "createDatabase" for the "userManagement" module.
 *   2) The database manager decides whether it's a dedicated DB or a shared schema.
 */
async function ensureUserManagementDatabase(motherEmitter, jwt, nonce) {
  console.log('[USER SERVICE] Ensuring the userManagement data store (DB or equivalent) via createDatabase...');
  const meltdownPayload = {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    nonce
  };
  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CREATE_DATABASE, meltdownPayload);
    console.log('[USER SERVICE] userManagement data store creation completed (if needed).');
  } catch (err) {
    console.error('[USER SERVICE] Error creating/fixing userManagement data store:', err.message);
    throw err;
  }
}

/**
 * ensureUserManagementSchemaAndTables:
 *   1) Emits a "dbUpdate" with table = '__rawSQL__' and data.rawSQL = 'INIT_USER_MANAGEMENT'.
 *   2) This tells the bridging layer (e.g., Postgres or Mongo) to create the necessary
 *      tables/collections ("users", "roles", "user_roles", etc.) for user management.
 */
async function ensureUserManagementSchemaAndTables(motherEmitter, jwt, nonce) {
  console.log('[USER SERVICE] Initializing userManagement tables/collections...');
  const meltdownPayload = {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    nonce
  };
  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
      ...meltdownPayload,
      table: '__rawSQL__',
      where: {},
      data: { rawSQL: 'INIT_USER_MANAGEMENT' }
    });
    console.log('[USER SERVICE] userManagement data structures ensured successfully.');
  } catch (err) {
    console.error('[USER SERVICE] Error initializing userManagement structures:', err.message);
    throw err;
  }
}

/**
 * ensureDefaultRoles:
 *   1) Emits a "dbSelect" for the 'roles' table to see if "admin"/"standard" exist.
 *   2) If not found, inserts them with default permissions.
 */
async function ensureDefaultRoles(motherEmitter, jwt, nonce) {
  console.log('[USER SERVICE] Checking for default roles: "admin" and "standard"...');
  const meltdownPayload = {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    nonce
  };
  let existingRoles;
  try {
    existingRoles = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
      ...meltdownPayload,
      table: 'roles'
    });
  } catch (err) {
    console.error('[USER SERVICE] Error retrieving existing roles:', err.message);
    throw err;
  }

  const foundNames = (existingRoles || []).map(role => (role.role_name || '').toLowerCase());
  const rolesToCreate = [];
  if (!foundNames.includes('admin')) {
    rolesToCreate.push({
      role_name: 'admin',
      is_system_role: true,
      description: 'System Admin Role',
      permissions: ADMIN_PERMISSIONS
    });
  }
  if (!foundNames.includes('standard')) {
    rolesToCreate.push({
      role_name: 'standard',
      is_system_role: false,
      description: 'Default basic user role',
      permissions: JSON.stringify({})
    });
  }
  if (!rolesToCreate.length) {
    console.log('[USER SERVICE] Default roles "admin" and "standard" already exist.');
    return;
  }

  for (const role of rolesToCreate) {
    const timestamp = new Date().toISOString();
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_INSERT, {
      ...meltdownPayload,
      table: 'roles',
      data: { ...role, created_at: timestamp, updated_at: timestamp }
    });
  }
  console.log('[USER SERVICE] Created default roles "admin" and/or "standard" if they were missing.');
}

/**
 * addB2BFields:
 *   1) Tells bridging code to run "INIT_B2B_FIELDS", e.g. adding columns for
 *      "company_name", "vat_number", "phone", etc.
 */
async function addB2BFields(motherEmitter, jwt, nonce) {
  console.log('[USER SERVICE] Adding B2B fields (company_name, vat_number, phone, etc.)...');
  const meltdownPayload = {
    jwt,
    moduleName: 'userManagement',
    moduleType: 'core',
    nonce
  };
  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
      ...meltdownPayload,
      table: '__rawSQL__',
      where: {},
      data: { rawSQL: 'INIT_B2B_FIELDS' }
    });
    console.log('[USER SERVICE] B2B fields have been added to the users table/collection.');
  } catch (err) {
    console.error('[USER SERVICE] Error adding B2B fields:', err.message);
    throw err;
  }
}

/**
 * addUserFieldDefinition:
 *   1) Tells bridging code to run "ADD_USER_FIELD".
 *   2) bridging can interpret this as an "ALTER TABLE usermanagement.users ADD COLUMN ..." or
 *      a NoSQL equivalent.
 *
 * Example payload:
 * {
 *   jwt,
 *   moduleName:'userManagement',
 *   moduleType:'core',
 *   fieldName:'extra_field',
 *   fieldType:'VARCHAR(255)',
 *   defaultValue:null
 * }
 */
function addUserFieldDefinition(motherEmitter, payload) {
  if (!payload || !payload.jwt) {
    return Promise.reject(new Error('[USER SERVICE] addUserFieldDefinition => missing "jwt" in payload.'));
  }

  console.log(`[USER SERVICE] Adding custom user field => ${payload.fieldName}`);
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
    ...payload,
    table: '__rawSQL__',
    where: {},
    data: {
      rawSQL: 'ADD_USER_FIELD',
      fieldName: payload.fieldName,
      fieldType: payload.fieldType || 'TEXT',
      defaultValue: payload.defaultValue || null
    }
  }).then(() => {
    console.log(`[USER SERVICE] Custom field "${payload.fieldName}" was added successfully.`);
  }, err => {
    console.error('[USER SERVICE] Error adding custom user field:', err.message);
    throw err;
  });
}

module.exports = {
  ensureUserManagementDatabase,
  ensureUserManagementSchemaAndTables,
  ensureDefaultRoles,
  addB2BFields,
  addUserFieldDefinition
};
