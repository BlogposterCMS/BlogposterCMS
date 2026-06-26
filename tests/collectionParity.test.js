const fs = require('fs');
const path = require('path');

function extractFunctionBlock(code, functionName, nextFunctionName = null) {
  const start = code.indexOf(`async function ${functionName}`);
  if (start === -1) return '';
  if (!nextFunctionName) return code.slice(start);
  const end = code.indexOf(`async function ${nextFunctionName}`, start + functionName.length);
  return end === -1 ? code.slice(start) : code.slice(start, end);
}

function pgTables() {
  const postgresCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/postgresPlaceholders.js'),
    'utf8'
  );
  const contentEngineCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/contentEnginePlaceholders.js'),
    'utf8'
  );
  const commentsCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/commentsPlaceholders.js'),
    'utf8'
  );
  const navigationCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/navigationPlaceholders.js'),
    'utf8'
  );
  const seoCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/seoPlaceholders.js'),
    'utf8'
  );
  const searchCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/searchPlaceholders.js'),
    'utf8'
  );
  const redirectCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/redirectPlaceholders.js'),
    'utf8'
  );
  const mediaCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/mediaPlaceholders.js'),
    'utf8'
  );
  const metadataCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/metadataPlaceholders.js'),
    'utf8'
  );
  const workflowCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/workflowPlaceholders.js'),
    'utf8'
  );
  const translationCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/translationPlaceholders.js'),
    'utf8'
  );
  const code = [
    postgresCode,
    extractFunctionBlock(contentEngineCode, 'handleContentEnginePostgres', 'handleContentEngineMongo'),
    extractFunctionBlock(commentsCode, 'handleCommentsPostgres', 'handleCommentsMongo'),
    extractFunctionBlock(navigationCode, 'handleNavigationPostgres', 'handleNavigationMongo'),
    extractFunctionBlock(seoCode, 'handleSeoPostgres', 'handleSeoMongo'),
    extractFunctionBlock(searchCode, 'handleSearchPostgres', 'handleSearchMongo'),
    extractFunctionBlock(redirectCode, 'handleRedirectPostgres', 'handleRedirectMongo'),
    extractFunctionBlock(mediaCode, 'handleMediaPostgres', 'handleMediaMongo'),
    extractFunctionBlock(metadataCode, 'handleMetadataPostgres', 'handleMetadataMongo'),
    extractFunctionBlock(workflowCode, 'handleWorkflowPostgres', 'handleWorkflowMongo'),
    extractFunctionBlock(translationCode, 'handleTranslationPostgres', 'handleTranslationMongo'),
  ].join('\n');
  const tableRegex = /CREATE TABLE IF NOT EXISTS\s+([^\s(]+)/gi;
  const tables = new Set();
  let m;
  while ((m = tableRegex.exec(code)) !== null) {
    let name = m[1].replace(/["`]/g, '');
    if (name.includes('.')) {
      const [schema, table] = name.split('.');
      name = schema === 'plainspace' ? `${schema}_${table}` : table;
    }
    tables.add(name);
  }
  return Array.from(tables).sort();
}

function mongoCollections() {
  const mongoCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/mongoPlaceholders.js'),
    'utf8'
  );
  const contentEngineCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/contentEnginePlaceholders.js'),
    'utf8'
  );
  const commentsCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/commentsPlaceholders.js'),
    'utf8'
  );
  const navigationCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/navigationPlaceholders.js'),
    'utf8'
  );
  const seoCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/seoPlaceholders.js'),
    'utf8'
  );
  const searchCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/searchPlaceholders.js'),
    'utf8'
  );
  const redirectCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/redirectPlaceholders.js'),
    'utf8'
  );
  const mediaCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/mediaPlaceholders.js'),
    'utf8'
  );
  const metadataCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/metadataPlaceholders.js'),
    'utf8'
  );
  const workflowCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/workflowPlaceholders.js'),
    'utf8'
  );
  const translationCode = fs.readFileSync(
    path.join(__dirname, '../mother/modules/databaseManager/placeholders/translationPlaceholders.js'),
    'utf8'
  );
  const code = [
    mongoCode,
    extractFunctionBlock(contentEngineCode, 'handleContentEngineMongo'),
    extractFunctionBlock(commentsCode, 'handleCommentsMongo'),
    extractFunctionBlock(navigationCode, 'handleNavigationMongo'),
    extractFunctionBlock(seoCode, 'handleSeoMongo'),
    extractFunctionBlock(searchCode, 'handleSearchMongo'),
    extractFunctionBlock(redirectCode, 'handleRedirectMongo'),
    extractFunctionBlock(mediaCode, 'handleMediaMongo'),
    extractFunctionBlock(metadataCode, 'handleMetadataMongo'),
    extractFunctionBlock(workflowCode, 'handleWorkflowMongo'),
    extractFunctionBlock(translationCode, 'handleTranslationMongo'),
  ].join('\n');
  const direct = /createCollection\(['"]([^'"\)]+)['"]\)/gi;
  const variable = /const\s+collectionName\s*=\s*['"]([^'"]+)['"]/gi;
  const cols = new Set();
  let m;
  while ((m = direct.exec(code)) !== null) cols.add(m[1]);
  while ((m = variable.exec(code)) !== null) cols.add(m[1]);
  cols.delete('widgetmanager_widgets'); // collection only used in Mongo
  return Array.from(cols).sort();
}

test('Mongo collections match Postgres tables across modules', () => {
  expect(mongoCollections()).toEqual(pgTables());
});
