/**
 * mother/modules/pagesManager/pageService.js
 *
 * Ensures DB or schema for pagesManager.
 * meltdown => dbUpdate with placeholders:
 *   - INIT_PAGES_SCHEMA
 *   - INIT_PAGES_TABLE
 *   weight migration and indexes run via raw SQL after table creation
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

        // After schema creation ensure the table exists
        motherEmitter.emit(
          'dbUpdate',
          {
            ...meltdownPayload,
            table: '__rawSQL__',
            where: {},
            data: { rawSQL: 'INIT_PAGES_TABLE' }
          },
          async (tableErr) => {
            if (tableErr) {
              console.error('[PAGE SERVICE] Error creating pages table =>', tableErr.message);
              return reject(tableErr);
            }
            console.log('[PAGE SERVICE] Placeholder "INIT_PAGES_TABLE" done.');

            try {
              await checkAndAlterPagesTable(motherEmitter, jwt, nonce);
              resolve();
            } catch (alterErr) {
              reject(alterErr);
            }
          }
        );
      }
    );
  });
}

function checkAndAlterPagesTable(motherEmitter, jwt, nonce) {
  return new Promise((resolve, reject) => {
    console.log('[PAGE SERVICE] Checking/altering pages table/collection...');

    const basePayload = {
      jwt,
      moduleName: 'pagesManager',
      moduleType: 'core',
      nonce
    };

    motherEmitter.emit(
      'dbUpdate',
      {
        ...basePayload,
        table: '__rawSQL__',
        where: {},
        data: { rawSQL: 'ALTER TABLE pagesManager_pages ADD COLUMN weight INTEGER DEFAULT 0;' }
      },
      (alterErr) => {
        if (alterErr && !/duplicate column/i.test(String(alterErr.message))) {
          console.error('[PAGE SERVICE] Error adding weight column =>', alterErr.message);
          return reject(alterErr);
        }

        motherEmitter.emit(
          'dbUpdate',
          {
            ...basePayload,
            table: '__rawSQL__',
            where: {},
            data: { rawSQL: 'UPDATE pagesManager_pages SET weight = 0 WHERE weight IS NULL;' }
          },
          (updateErr) => {
            if (updateErr) {
              console.error('[PAGE SERVICE] Error normalising weight column =>', updateErr.message);
              return reject(updateErr);
            }

            // Create indexes after ensuring the column
            motherEmitter.emit(
              'dbUpdate',
              {
                ...basePayload,
                table: '__rawSQL__',
                where: {},
                data: { rawSQL: 'CREATE UNIQUE INDEX IF NOT EXISTS pages_slug_lane_unique ON pagesManager_pages (slug, lane);' }
              },
              (idxErr1) => {
                if (idxErr1) {
                  console.error('[PAGE SERVICE] Error creating slug/lane index =>', idxErr1.message);
                  return reject(idxErr1);
                }

                motherEmitter.emit(
                  'dbUpdate',
                  {
                    ...basePayload,
                    table: '__rawSQL__',
                    where: {},
                    data: { rawSQL: 'CREATE INDEX IF NOT EXISTS pages_lane_weight_created_at ON pagesManager_pages (lane, weight, created_at DESC);' }
                  },
                  (idxErr2) => {
                    if (idxErr2) {
                      console.error('[PAGE SERVICE] Error creating lane/weight index =>', idxErr2.message);
                      return reject(idxErr2);
                    }

                    motherEmitter.emit(
                      'dbUpdate',
                      {
                        ...basePayload,
                        table: '__rawSQL__',
                        where: {},
                        data: { rawSQL: 'CREATE INDEX IF NOT EXISTS pages_parent_weight_created_at ON pagesManager_pages (parent_id, weight, created_at DESC);' }
                      },
                      (idxErr3) => {
                        if (idxErr3) {
                          console.error('[PAGE SERVICE] Error creating parent/weight index =>', idxErr3.message);
                          return reject(idxErr3);
                        }

                        console.log('[PAGE SERVICE] Added missing "weight" column to pages table.');
                        resolve();
                      }
                    );
                  }
                );
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
