/**
 * mother/modules/dependencyLoader/dependencyLoaderService.js
 *
 * Provides functions to:
 *   1) ensureDependencyLoaderDatabase => meltdown => createDatabase
 *   2) ensureDependencyLoaderSchemaAndTable => meltdown => dbUpdate placeholders
 *   3) loadDependencies => meltdown => dbSelect
 *   4) checkAndLoadDependency => checks global cache
 *
 * We remain DB-agnostic. Because life is short, but meltdown is forever.
 */

require('dotenv').config();

/**
 * ensureDependencyLoaderDatabase:
 *  1) meltdown => dbSelect => placeholder: 'CHECK_DB_EXISTS_DEPENDENCYLOADER'
 *  2) If not found => meltdown => createDatabase => creates it
 *  3) If found => meltdown => createDatabase => fixes ownership, etc.
 */
function ensureDependencyLoaderDatabase(motherEmitter, jwt) {
  return new Promise((resolve, reject) => {
    console.log('[DEPENDENCY LOADER SERVICE] Checking or creating "dependencyloader_db"...');

    const dbName = 'dependencyloader_db';

    // meltdown => dbSelect => placeholder => 'CHECK_DB_EXISTS_DEPENDENCYLOADER'
    motherEmitter.emit(
      'dbSelect',
      {
        jwt,
        moduleName : 'dependencyLoader',
        moduleType : 'core',
        table      : '__rawSQL__',
        data       : {
          rawSQL : 'CHECK_DB_EXISTS_DEPENDENCYLOADER',
          dbName
        }
      },
      (err, result) => {
        if (err) {
          console.error('[DEPENDENCY LOADER SERVICE] Error checking existence of dependencyloader_db:', err.message);
          return reject(err);
        }

        // bridging may return an array or { rows: [...] }
        const rows = Array.isArray(result) ? result : (result?.rows || []);
        if (rows.length === 0) {
          // DB not found => meltdown => createDatabase
          console.log('[DEPENDENCY LOADER SERVICE] dependencyloader_db does not exist. Creating...');

          motherEmitter.emit(
            'createDatabase',
            {
              jwt,
              moduleName : 'dependencyLoader',
              moduleType : 'core',
              targetDbName: dbName // bridging can interpret
            },
            (err2) => {
              if (err2) {
                console.error('[DEPENDENCY LOADER SERVICE] Error creating dependencyloader_db:', err2.message);
                return reject(err2);
              }
              console.log('[DEPENDENCY LOADER SERVICE] dependencyloader_db created successfully.');
              resolve();
            }
          );
        } else {
          // DB found => meltdown => createDatabase => fix ownership
          console.log('[DEPENDENCY LOADER SERVICE] dependencyloader_db already exists. Ensuring ownership...');

          motherEmitter.emit(
            'createDatabase',
            {
              jwt,
              moduleName : 'dependencyLoader',
              moduleType : 'core',
              targetDbName: dbName,
              fixOwnership: true // bridging can interpret
            },
            (err3) => {
              if (err3) {
                console.error('[DEPENDENCY LOADER SERVICE] Error ensuring ownership for dependencyloader_db:', err3.message);
                return reject(err3);
              }
              console.log('[DEPENDENCY LOADER SERVICE] Ownership fixed for dependencyloader_db (if needed).');
              resolve();
            }
          );
        }
      }
    );
  });
}

/**
 * ensureDependencyLoaderSchemaAndTable:
 *   1) meltdown => dbUpdate => placeholder => 'INIT_DEPENDENCYLOADER_SCHEMA'
 *   2) meltdown => dbUpdate => placeholder => 'INIT_DEPENDENCYLOADER_TABLE'
 */
function ensureDependencyLoaderSchemaAndTable(motherEmitter, jwt) {
  return new Promise((resolve, reject) => {
    console.log('[DEPENDENCY LOADER SERVICE] Creating schema & table for "dependencyloader"...');

    // meltdown => dbUpdate => { rawSQL:'INIT_DEPENDENCYLOADER_SCHEMA' }
    motherEmitter.emit(
      'dbUpdate',
      {
        jwt,
        moduleName : 'dependencyLoader',
        moduleType : 'core',
        table      : '__rawSQL__',
        where      : {},
        data       : {
          rawSQL: 'INIT_DEPENDENCYLOADER_SCHEMA'
        }
      },
      (schemaErr) => {
        if (schemaErr) {
          console.error('[DEPENDENCY LOADER SERVICE] Error creating schema "dependencyloader":', schemaErr.message);
          return reject(schemaErr);
        }
        console.log('[DEPENDENCY LOADER SERVICE] Schema "dependencyloader" ensured.');

        // meltdown => dbUpdate => 'INIT_DEPENDENCYLOADER_TABLE'
        motherEmitter.emit(
          'dbUpdate',
          {
            jwt,
            moduleName : 'dependencyLoader',
            moduleType : 'core',
            table      : '__rawSQL__',
            where      : {},
            data       : {
              rawSQL: 'INIT_DEPENDENCYLOADER_TABLE'
            }
          },
          (tableErr) => {
            if (tableErr) {
              console.error('[DEPENDENCY LOADER SERVICE] Error creating "module_dependencies" table:', tableErr.message);
              return reject(tableErr);
            }
            console.log('[DEPENDENCY LOADER SERVICE] "dependencyloader".module_dependencies table ensured.');
            resolve();
          }
        );
      }
    );
  });
}

/**
 * loadDependencies:
 *  meltdown => dbSelect => 'LIST_DEPENDENCYLOADER_DEPENDENCIES'
 *  bridging returns array of { module_name, dependency_name, allowed_version }
 *  We stuff them into global.allowedDependencies
 */
function loadDependencies(motherEmitter, jwt) {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(
      'dbSelect',
      {
        jwt,
        moduleName : 'dependencyLoader',
        moduleType : 'core',
        table      : '__rawSQL__',
        data       : {
          rawSQL: 'LIST_DEPENDENCYLOADER_DEPENDENCIES'
        }
      },
      (err, result) => {
        if (err) {
          console.error('[DEPENDENCY LOADER SERVICE] Error loading dependencies:', err.message);
          return reject(err);
        }

        const rows = Array.isArray(result) ? result : (result?.rows || []);

        // Rebuild global cache
        global.allowedDependencies = {};
        rows.forEach((row) => {
          const mName = row.module_name;
          if (!global.allowedDependencies[mName]) {
            global.allowedDependencies[mName] = [];
          }
          global.allowedDependencies[mName].push({
            dependencyName: row.dependency_name,
            allowedVersion: row.allowed_version
          });
        });

        console.log('[DEPENDENCY LOADER SERVICE] Allowed dependencies loaded into global cache.');
        resolve();
      }
    );
  });
}

/**
 * checkAndLoadDependency:
 *  checks if "dependencyName" is allowed for "moduleName"
 *  in global.allowedDependencies
 */
async function checkAndLoadDependency(motherEmitter, moduleName, dependencyName) {
  if (!global.allowedDependencies) {
    console.warn('[DEPENDENCY LOADER SERVICE] Allowed dependencies not loaded => returning false');
    return false;
  }
  const allowedForModule = global.allowedDependencies[moduleName] || [];
  const found = allowedForModule.find((dep) => dep.dependencyName === dependencyName);

  if (found) {
    console.log(`[DEPENDENCY LOADER SERVICE] Module "${moduleName}" is allowed to load "${dependencyName}".`);
    return true;
  } else {
    console.warn(`[DEPENDENCY LOADER SERVICE] Module "${moduleName}" is NOT allowed to load "${dependencyName}".`);
    return false;
  }
}

module.exports = {
  ensureDependencyLoaderDatabase,
  ensureDependencyLoaderSchemaAndTable,
  loadDependencies,
  checkAndLoadDependency,
};
