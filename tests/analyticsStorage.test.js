const sqlite3 = require('sqlite3');
const { handleAnalyticsSql, handleAnalyticsMongo } = require('../mother/modules/databaseManager/placeholders/analyticsPlaceholders');

test('SQLite persists idempotent retries, reads chronologically and prunes expired records', async () => {
  const raw = new sqlite3.Database(':memory:');
  const db = {
    run: (sql, params = []) => new Promise((resolve, reject) => raw.run(sql, params, err => err ? reject(err) : resolve())),
    all: (sql, params = []) => new Promise((resolve, reject) => raw.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)))
  };
  try {
    await handleAnalyticsSql(db, 'INIT_ANALYTICS');
    const records = [{ id: '1', at: '2026-09-01', event: "x'); DROP TABLE test;--" }, { id: '2', at: '2026-09-07' }];
    await handleAnalyticsSql(db, 'APPEND_ANALYTICS', { records });
    await handleAnalyticsSql(db, 'APPEND_ANALYTICS', { records });
    expect(await handleAnalyticsSql(db, 'READ_ANALYTICS', { from: '2026-01-01' })).toEqual(records);
    await handleAnalyticsSql(db, 'PRUNE_ANALYTICS', { before: '2026-09-02' });
    expect(await handleAnalyticsSql(db, 'READ_ANALYTICS', { from: '2026-01-01' })).toEqual([records[1]]);
    // Startup can fill the complete queue; persist that batch without per-row commits.
    const burst = Array.from({ length: 2000 }, (_, id) => ({ id: `burst-${id}`, at: '2026-09-07' }));
    await handleAnalyticsSql(db, 'APPEND_ANALYTICS', { records: burst });
    expect(await handleAnalyticsSql(db, 'READ_ANALYTICS', { from: '2026-01-01' })).toHaveLength(2001);
  } finally { await new Promise(resolve => raw.close(resolve)); }
});

test('Postgres binds values and Mongo retries use stable IDs', async () => {
  const query = jest.fn().mockResolvedValue({ rows: [] });
  const row = { id: 'same', at: '2026-09-07', kind: 'system' };
  await handleAnalyticsSql({ query }, 'APPEND_ANALYTICS', { records: [row] }, true);
  expect(query.mock.calls[1][0]).toContain('VALUES ($1, $2, $3)');
  expect(query.mock.calls[1][1]).toEqual([row.id, row.at, JSON.stringify(row)]);
  const bulkWrite = jest.fn().mockResolvedValue({});
  await handleAnalyticsMongo({ collection: () => ({ bulkWrite }) }, 'APPEND_ANALYTICS', { records: [row] });
  expect(bulkWrite.mock.calls[0][0][0].updateOne).toMatchObject({ filter: { _id: 'same' }, upsert: true });
});
