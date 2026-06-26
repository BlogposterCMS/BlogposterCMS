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
const mongoPath = path.join(__dirname, '../mother/modules/databaseManager/placeholders/mongoPlaceholders.js');

const pgCases = extractCases(fs.readFileSync(pgPath, 'utf8'));
const mongoCases = extractCases(fs.readFileSync(mongoPath, 'utf8'));

test('all Postgres placeholders exist in Mongo', () => {
  for (const c of pgCases) {
    assert(mongoCases.includes(c), `Mongo placeholder missing: ${c}`);
  }
});

