/**
 * mother/modules/pagesManager/pageService.js
 *
 * Ensures DB or schema for pagesManager.
 * meltdown => dbUpdate with placeholders:
 *   - INIT_PAGES_SCHEMA
 *   - INIT_PAGES_TABLE
 */

require('dotenv').config();

function ensurePagesManagerDatabase(motherEmitter, jwt, nonce) {
  return new Promise((resolve, reject) => {
    console.log('[PAGE SERVICE] Ensuring pagesManager DB/Schema via createDatabase meltdown...');

    const meltdownPayload = {
      jwt,
      moduleName : 'pagesManager',
      moduleType : 'core',
      nonce,
      targetModuleName: 'pagesManager'
    };

    motherEmitter.emit('createDatabase', meltdownPayload, (err) => {
      if (err) {
        console.error('[PAGE SERVICE] Error creating/fixing pagesManager DB:', err.message);
        return reject(err);
      }
      console.log('[PAGE SERVICE] pagesManager DB/Schema creation done (if needed).');
      resolve();
    });
  });
}

function ensurePageSchemaAndTable(motherEmitter, jwt, nonce) {
  return new Promise((resolve, reject) => {
    console.log('[PAGE SERVICE] Creating schema & table/collection for pagesManager...');

    const meltdownPayload = {
      jwt,
      moduleName : 'pagesManager',
      moduleType : 'core',
      nonce
    };

    // meltdown => dbUpdate => 'INIT_PAGES_SCHEMA'
    motherEmitter.emit(
      'dbUpdate',
      {
        ...meltdownPayload,
        table: '__rawSQL__',
        where: {},
        data: { rawSQL: 'INIT_PAGES_SCHEMA' }
      },
      async (schemaErr) => {
        if (schemaErr) {
          console.error('[PAGE SERVICE] Error creating pages schema =>', schemaErr.message);
          return reject(schemaErr);
        }
        console.log('[PAGE SERVICE] Placeholder "INIT_PAGES_SCHEMA" done.');

        // meltdown => dbUpdate => 'INIT_PAGES_TABLE'
        motherEmitter.emit(
          'dbUpdate',
          {
            ...meltdownPayload,
            table: '__rawSQL__',
            where: {},
            data: { rawSQL: 'INIT_PAGES_TABLE' }
          },
          (tableErr) => {
            if (tableErr) {
              console.error('[PAGE SERVICE] Error creating pages table =>', tableErr.message);
              return reject(tableErr);
            }
            console.log('[PAGE SERVICE] Placeholder "INIT_PAGES_TABLE" done.');

            // Ensure columns and indexes exist across databases
            motherEmitter.emit(
              'dbUpdate',
              {
                ...meltdownPayload,
                table: '__rawSQL__',
                where: {},
                data: { rawSQL: 'CHECK_AND_ALTER_PAGES_TABLE' }
              },
              (alterErr) => {
                if (alterErr) {
                  console.error('[PAGE SERVICE] Error checking/altering pages table =>', alterErr.message);
                  return reject(alterErr);
                }
                console.log('[PAGE SERVICE] Placeholder "CHECK_AND_ALTER_PAGES_TABLE" done.');
                resolve();
              }
            );
          }
        );
      }
    );
  });
}

async function getPageBySlugLocal(motherEmitter, jwt, slug, lane = 'public', language = 'en') {
  return new Promise((resolve, reject) => {
    motherEmitter.emit(
      'dbSelect',
      {
        jwt,
        moduleName: 'pagesManager',
        moduleType: 'core',
        table: '__rawSQL__',
        data: {
          rawSQL: 'GET_PAGE_BY_SLUG',
          0: slug,
          1: lane,
          2: language
        }
      },
      (err, result = null) => {
        if (err) return reject(err);
        const rows = Array.isArray(result)
          ? result
          : Array.isArray(result?.rows)
            ? result.rows
            : (result ? [result] : []);
        resolve(rows[0] ?? null);
      }
    );
  });
}


module.exports = {
  ensurePagesManagerDatabase,
  ensurePageSchemaAndTable,
  getPageBySlugLocal
};
