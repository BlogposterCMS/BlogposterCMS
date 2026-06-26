const assert = require('assert');
const fs = require('fs');
const path = require('path');

function extractCases(code) {
  const re = /case\s+'([^']+)'/g;
  const cases = [];
  let m;
  while ((m = re.exec(code)) !== null) {
    cases.push(m[1]);
  }
  return cases;
}

const pgPath = path.join(__dirname, '../mother/modules/databaseManager/placeholders/postgresPlaceholders.js');
const sqlitePath = path.join(__dirname, '../mother/modules/databaseManager/placeholders/sqlitePlaceholders.js');

const pgCases = extractCases(fs.readFileSync(pgPath, 'utf8'));
const sqliteCases = extractCases(fs.readFileSync(sqlitePath, 'utf8'));

test('all Postgres placeholders exist in SQLite', () => {
  for (const c of pgCases) {
    assert(sqliteCases.includes(c), `SQLite placeholder missing: ${c}`);
  }
});

