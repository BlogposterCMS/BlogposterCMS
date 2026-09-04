

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

/**
 * mother/modules/pagesManager/pageService.js
 *
 * Ensures DB or schema for pagesManager.
 * meltdown => dbUpdate with placeholders:
 *   - INIT_PAGES_SCHEMA
 *   - INIT_PAGES_TABLE
 */

require('dotenv').config();

async function ensurePagesManagerDatabase(motherEmitter, jwt, nonce) {
  console.log('[PAGE SERVICE] Ensuring pagesManager DB/Schema via createDatabase meltdown...');
  const meltdownPayload = {
    jwt,
    moduleName: 'pagesManager',
    moduleType: 'core',
    nonce,
    targetModuleName: 'pagesManager'
  };
  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CREATE_DATABASE, meltdownPayload);
    console.log('[PAGE SERVICE] pagesManager DB/Schema creation done (if needed).');
  } catch (err) {
    console.error('[PAGE SERVICE] Error creating/fixing pagesManager DB:', err.message);
    throw err;
  }
}

async function ensurePageSchemaAndTable(motherEmitter, jwt, nonce) {
  console.log('[PAGE SERVICE] Creating schema & table/collection for pagesManager...');
  const meltdownPayload = {
    jwt,
    moduleName: 'pagesManager',
    moduleType: 'core',
    nonce
  };

  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
      ...meltdownPayload,
      table: '__rawSQL__',
      where: {},
      data: { rawSQL: 'INIT_PAGES_SCHEMA' }
    });
    console.log('[PAGE SERVICE] Placeholder "INIT_PAGES_SCHEMA" done.');
  } catch (err) {
    console.error('[PAGE SERVICE] Error creating pages schema =>', err.message);
    throw err;
  }

  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
      ...meltdownPayload,
      table: '__rawSQL__',
      where: {},
      data: { rawSQL: 'INIT_PAGES_TABLE' }
    });
    console.log('[PAGE SERVICE] Placeholder "INIT_PAGES_TABLE" done.');
  } catch (err) {
    console.error('[PAGE SERVICE] Error creating pages table =>', err.message);
    throw err;
  }

  try {
    await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
        ...meltdownPayload,
        table: '__rawSQL__',
        where: {},
        data: { rawSQL: 'CHECK_AND_ALTER_PAGES_TABLE' }
    });
    console.log('[PAGE SERVICE] Placeholder "CHECK_AND_ALTER_PAGES_TABLE" done.');
  } catch (err) {
    console.error('[PAGE SERVICE] Error checking/altering pages table =>', err.message);
    throw err;
  }
}

async function getPageBySlugLocal(motherEmitter, jwt, slug, lane = 'public', language = 'en') {
  return requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
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
  }).then((result = null) => {
    const rows = Array.isArray(result) ? result : Array.isArray(result?.rows) ? result.rows : result ? [result] : [];
    return rows[0] ?? null;
  });
}


module.exports = {
  ensurePagesManagerDatabase,
  ensurePageSchemaAndTable,
  getPageBySlugLocal
};
