'use strict';

const OPERATIONS = ['INIT_ANALYTICS', 'APPEND_ANALYTICS', 'READ_ANALYTICS', 'PRUNE_ANALYTICS'];
const isAnalyticsPlaceholder = operation => OPERATIONS.includes(operation);
const paramsObject = params => Array.isArray(params) ? params[0] || {} : params || {};

// Storage adapters own SQL dialects. Identifiers are fixed; every value is bound.
async function handleAnalyticsSql(db, operation, params, postgres = false) {
  const p = paramsObject(params);
  const table = 'analyticsManager_events';
  const bind = index => postgres ? `$${index}` : '?';
  const run = (sql, values = []) => postgres ? db.query(sql, values) : db.run(sql, values);
  if (operation === 'INIT_ANALYTICS') {
    await run(`CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, at TEXT NOT NULL, record TEXT NOT NULL)`);
    await run(`CREATE INDEX IF NOT EXISTS analytics_events_at ON ${table}(at)`);
  } else if (operation === 'APPEND_ANALYTICS') {
    // One transaction avoids a disk sync per event during startup bursts.
    await run('BEGIN');
    try {
      const records = p.records || [];
      for (let offset = 0; offset < records.length; offset += 100) {
        const batch = records.slice(offset, offset + 100);
        const values = batch.flatMap(row => [row.id, row.at, JSON.stringify(row)]);
        const tuples = batch.map((_row, index) => `(${bind(index * 3 + 1)}, ${bind(index * 3 + 2)}, ${bind(index * 3 + 3)})`).join(',');
        await run(`INSERT INTO ${table}(id, at, record) VALUES ${tuples} ON CONFLICT(id) DO NOTHING`, values);
      }
      await run('COMMIT');
    } catch (error) { await run('ROLLBACK'); throw error; }
  } else if (operation === 'PRUNE_ANALYTICS') {
    await run(`DELETE FROM ${table} WHERE at < ${bind(1)}`, [p.before]);
  } else if (operation === 'READ_ANALYTICS') {
    const sql = `SELECT record FROM ${table} WHERE at >= ${bind(1)} ORDER BY at DESC LIMIT 100001`;
    const rows = postgres ? (await db.query(sql, [p.from])).rows : await db.all(sql, [p.from]);
    return rows.map(row => JSON.parse(row.record)).reverse();
  } else throw new Error('ANALYTICS_STORAGE_OPERATION_UNKNOWN');
  return { done: true };
}
async function handleAnalyticsMongo(db, operation, params) {
  const p = paramsObject(params);
  const collection = db.collection('analytics_events');
  if (operation === 'INIT_ANALYTICS') await collection.createIndex({ at: 1 });
  else if (operation === 'APPEND_ANALYTICS') {
    if (p.records?.length) await collection.bulkWrite(p.records.map(row => ({ updateOne: { filter: { _id: row.id }, update: { $setOnInsert: row }, upsert: true } })));
  } else if (operation === 'PRUNE_ANALYTICS') await collection.deleteMany({ at: { $lt: p.before } });
  else if (operation === 'READ_ANALYTICS') return (await collection.find({ at: { $gte: p.from } }, { projection: { _id: 0 } }).sort({ at: -1 }).limit(100001).toArray()).reverse();
  else throw new Error('ANALYTICS_STORAGE_OPERATION_UNKNOWN');
  return { done: true };
}
module.exports = { OPERATIONS, isAnalyticsPlaceholder, handleAnalyticsSql, handleAnalyticsMongo };
