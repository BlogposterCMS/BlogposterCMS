//mother/modules/userManagement/userService.js

require('dotenv').config();

const ADMIN_PERMISSIONS = JSON.stringify({ '*': true });

/**
 * ensureUserManagementDatabase:
 *   1) Emits "createDatabase" for the "userManagement" module.
 *   2) The database manager decides whether it's a dedicated DB or a shared schema.
 */
function ensureUserManagementDatabase(motherEmitter, jwt, nonce) {
  return new Promise((resolve, reject) => {
    console.log('[USER SERVICE] Ensuring the userManagement data store (DB or equivalent) via createDatabase...');

    const meltdownPayload = {
      jwt,
      moduleName: 'userManagement',
      moduleType: 'core',
      nonce
    };

    motherEmitter.emit('createDatabase', meltdownPayload, (err) => {
      if (err) {
        console.error('[USER SERVICE] Error creating/fixing userManagement data store:', err.message);
        return reject(err);
      }
      console.log('[USER SERVICE] userManagement data store creation completed (if needed).');
      resolve();
    });
  });
}

/**
 * ensureUserManagementSchemaAndTables:
 *   1) Emits a "dbUpdate" with table = '__rawSQL__' and data.rawSQL = 'INIT_USER_MANAGEMENT'.
 *   2) This tells the bridging layer (e.g., Postgres or Mongo) to create the necessary
 *      tables/collections ("users", "roles", "user_roles", etc.) for user management.
 */
function ensureUserManagementSchemaAndTables(motherEmitter, jwt, nonce) {
  return new Promise((resolve, reject) => {
    console.log('[USER SERVICE] Initializing userManagement tables/collections...');

    const meltdownPayload = {
      jwt,
      moduleName: 'userManagement',
      moduleType: 'core',
      nonce
    };

    motherEmitter.emit(
      'dbUpdate',
      {
        ...meltdownPayload,
        table: '__rawSQL__',
        where: {},
        data: {
          // Tells the bridging logic to run "INIT_USER_MANAGEMENT"
          rawSQL: 'INIT_USER_MANAGEMENT'
        }
      },
      (err) => {
        if (err) {
          console.error('[USER SERVICE] Error initializing userManagement structures:', err.message);
          return reject(err);
        }
        console.log('[USER SERVICE] userManagement data structures ensured successfully.');
        resolve();
      }
    );
  });
}

/**
 * ensureDefaultRoles:
 *   1) Emits a "dbSelect" for the 'roles' table to see if "admin"/"standard" exist.
 *   2) If not found, inserts them with default permissions.
 */
function ensureDefaultRoles(motherEmitter, jwt, nonce) {
  return new Promise((resolve, reject) => {
    console.log('[USER SERVICE] Checking for default roles: "admin" and "standard"...');

    const meltdownPayload = {
      jwt,
      moduleName: 'userManagement',
      moduleType: 'core',
      nonce
    };

    motherEmitter.emit(
      'dbSelect',
      {
        ...meltdownPayload,
        table: 'roles'
      },
      (err, existingRoles) => {
        if (err) {
          console.error('[USER SERVICE] Error retrieving existing roles:', err.message);
          return reject(err);
        }

        const foundNames = (existingRoles || []).map(r => (r.role_name || '').toLowerCase());

        const needAdmin = !foundNames.includes('admin');
        const needStandard = !foundNames.includes('standard');

        if (!needAdmin && !needStandard) {
          console.log('[USER SERVICE] Default roles "admin" and "standard" already exist.');
          return resolve();
        }

        const tasks = [];

        if (needAdmin) {
          tasks.push(cb => {
            motherEmitter.emit(
              'dbInsert',
              {
                ...meltdownPayload,
                table: 'roles',
                data: {
                  role_name: 'admin',
                  is_system_role: true,
                  description: 'System Admin Role',
                  permissions: ADMIN_PERMISSIONS,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                }
              },
              cb
            );
          });
        }

        if (needStandard) {
          tasks.push(cb => {
            motherEmitter.emit(
              'dbInsert',
              {
                ...meltdownPayload,
                table: 'roles',
                data: {
                  role_name: 'standard',
                  is_system_role: false,
                  description: 'Default basic user role',
                  permissions: JSON.stringify({}),
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                }
              },
              cb
            );
          });
        }

        // Execute tasks in series
        let idx = 0;
        function runNext() {
          if (idx >= tasks.length) {
            console.log('[USER SERVICE] Created default roles "admin" and/or "standard" if they were missing.');
            return resolve();
          }
          tasks[idx]((err2) => {
            if (err2) return reject(err2);
            idx++;
            runNext();
          });
        }
        runNext();
      }
    );
  });
}

/**
 * addB2BFields:
 *   1) Tells bridging code to run "INIT_B2B_FIELDS", e.g. adding columns for
 *      "company_name", "vat_number", "phone", etc.
 */
function addB2BFields(motherEmitter, jwt, nonce) {
  return new Promise((resolve, reject) => {
    console.log('[USER SERVICE] Adding B2B fields (company_name, vat_number, phone, etc.)...');

    const meltdownPayload = {
      jwt,
      moduleName: 'userManagement',
      moduleType: 'core',
      nonce
    };

    motherEmitter.emit(
      'dbUpdate',
      {
        ...meltdownPayload,
        table: '__rawSQL__',
        where: {},
        data: {
          rawSQL: 'INIT_B2B_FIELDS'
        }
      },
      (err) => {
        if (err) {
          console.error('[USER SERVICE] Error adding B2B fields:', err.message);
          return reject(err);
        }
        console.log('[USER SERVICE] B2B fields have been added to the users table/collection.');
        resolve();
      }
    );
  });
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
  return new Promise((resolve, reject) => {
    if (!payload || !payload.jwt) {
      return reject(new Error('[USER SERVICE] addUserFieldDefinition => missing "jwt" in payload.'));
    }

    console.log(`[USER SERVICE] Adding custom user field => ${payload.fieldName}`);

    motherEmitter.emit(
      'dbUpdate',
      {
        ...payload,
        table: '__rawSQL__',
        where: {},
        data: {
          rawSQL: 'ADD_USER_FIELD',
          fieldName: payload.fieldName,
          fieldType: payload.fieldType || 'TEXT',
          defaultValue: payload.defaultValue || null
        }
      },
      (err) => {
        if (err) {
          console.error('[USER SERVICE] Error adding custom user field:', err.message);
          return reject(err);
        }
        console.log(`[USER SERVICE] Custom field "${payload.fieldName}" was added successfully.`);
        resolve();
      }
    );
  });
}

module.exports = {
  ensureUserManagementDatabase,
  ensureUserManagementSchemaAndTables,
  ensureDefaultRoles,
  addB2BFields,
  addUserFieldDefinition
};
