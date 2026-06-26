/**
 * mother/modules/translationManager/dbInit.js
 *
 * meltdown => dbUpdate => rawSQL: 'INIT_TRANSLATION_TABLES'
 */
require('dotenv').config();

async function initTranslationTables(motherEmitter, jwt) {
  console.log('[TRANSLATION MANAGER] Ensuring translation tables/collections...');

  return new Promise((resolve, reject) => {
    motherEmitter.emit(
      'dbUpdate',
      {
        jwt,
        moduleName: 'translationManager',
        moduleType: 'core',
        table: '__rawSQL__',
        data: { rawSQL: 'INIT_TRANSLATION_TABLES' }
      },
      (err, res) => {
        if (err) {
          console.error('[TRANSLATION] Could not create/fix translation tables =>', err.message);
          return reject(err);
        }
        console.log('[TRANSLATION] translation tables/collections ensured.');
        resolve(res);
      }
    );
  });
}

module.exports = {
  initTranslationTables
};
