'use strict';

const { ObjectId } = require('mongodb');

const SEARCH_PLACEHOLDERS = new Set([
  'INIT_SEARCH_SCHEMA',
  'INIT_SEARCH_TABLES',
  'UPSERT_SEARCH_DOCUMENT',
  'GET_SEARCH_DOCUMENT',
  'SEARCH_DOCUMENTS',
  'DELETE_SEARCH_DOCUMENT'
]);

function isSearchPlaceholder(operation) {
  return SEARCH_PLACEHOLDERS.has(operation);
}

function paramsObject(params) {
  return Array.isArray(params) ? (params[0] || {}) : (params || {});
}

function jsonString(value, fallback = {}) {
  return JSON.stringify((typeof value === 'undefined' ? fallback : value) ?? fallback);
}

function parseJson(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeRows(rows) {
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map(row => ({
    ...row,
    sourceModule: row.source_module,
    sourceId: row.source_id,
    entryId: row.entry_id,
    contentTypeKey: row.content_type_key,
    searchText: row.search_text,
    indexedAt: row.indexed_at,
    meta: parseJson(row.meta, {})
  }));
}

function searchTokens(query = '') {
  return String(query || '').toLowerCase().split(/\s+/).map(t => t.trim()).filter(Boolean).slice(0, 8);
}

function escapeRegex(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sqliteWhere(p) {
  const where = [];
  const values = [];
  for (const token of searchTokens(p.query)) {
    where.push('LOWER(search_text) LIKE ?');
    values.push(`%${token}%`);
  }
  if (p.contentTypeKey) {
    where.push('content_type_key = ?');
    values.push(p.contentTypeKey);
  }
  if (p.language) {
    where.push('language = ?');
    values.push(p.language);
  }
  if (p.status) {
    where.push('status = ?');
    values.push(p.status);
  }
  if (p.visibility) {
    where.push('visibility = ?');
    values.push(p.visibility);
  }
  return { where: where.length ? where.join(' AND ') : '1 = 1', values };
}

function postgresWhere(p) {
  const where = [];
  const values = [];
  const add = value => {
    values.push(value);
    return `$${values.length}`;
  };
  for (const token of searchTokens(p.query)) {
    where.push(`LOWER(search_text) LIKE ${add(`%${token}%`)}`);
  }
  if (p.contentTypeKey) where.push(`content_type_key = ${add(p.contentTypeKey)}`);
  if (p.language) where.push(`language = ${add(p.language)}`);
  if (p.status) where.push(`status = ${add(p.status)}`);
  if (p.visibility) where.push(`visibility = ${add(p.visibility)}`);
  return { where: where.length ? where.join(' AND ') : '1 = 1', values, add };
}

function mongoDoc(doc) {
  if (!doc) return null;
  const id = doc.id || (doc._id ? String(doc._id) : undefined);
  const out = { ...doc, id };
  delete out._id;
  out.sourceModule = out.source_module;
  out.sourceId = out.source_id;
  out.entryId = out.entry_id;
  out.contentTypeKey = out.content_type_key;
  out.searchText = out.search_text;
  out.indexedAt = out.indexed_at;
  return out;
}

function mongoSourceQuery(p) {
  return {
    source_module: p.sourceModule,
    source_id: String(p.sourceId)
  };
}

async function handleSearchSqlite(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_SEARCH_SCHEMA':
      return { done: true };

    case 'INIT_SEARCH_TABLES':
      await db.exec(`
        CREATE TABLE IF NOT EXISTS searchManager_search_documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_module TEXT NOT NULL,
          source_id TEXT NOT NULL,
          entry_id TEXT,
          content_type_key TEXT DEFAULT '',
          title TEXT DEFAULT '',
          excerpt TEXT DEFAULT '',
          body TEXT DEFAULT '',
          url TEXT DEFAULT '',
          language TEXT DEFAULT 'en',
          status TEXT DEFAULT 'published',
          visibility TEXT DEFAULT 'public',
          search_text TEXT DEFAULT '',
          meta TEXT DEFAULT '{}',
          indexed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(source_module, source_id)
        );
      `);
      await db.run('CREATE INDEX IF NOT EXISTS search_documents_filters ON searchManager_search_documents(status, visibility, content_type_key, language);');
      await db.run('CREATE INDEX IF NOT EXISTS search_documents_indexed_at ON searchManager_search_documents(indexed_at DESC);');
      return { done: true };

    case 'UPSERT_SEARCH_DOCUMENT':
      await db.run(`
        INSERT INTO searchManager_search_documents
          (source_module, source_id, entry_id, content_type_key, title, excerpt, body,
           url, language, status, visibility, search_text, meta, indexed_at, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(source_module, source_id) DO UPDATE SET
          entry_id=excluded.entry_id,
          content_type_key=excluded.content_type_key,
          title=excluded.title,
          excerpt=excluded.excerpt,
          body=excluded.body,
          url=excluded.url,
          language=excluded.language,
          status=excluded.status,
          visibility=excluded.visibility,
          search_text=excluded.search_text,
          meta=excluded.meta,
          indexed_at=CURRENT_TIMESTAMP,
          updated_at=CURRENT_TIMESTAMP;
      `, [
        p.sourceModule,
        String(p.sourceId),
        p.entryId || null,
        p.contentTypeKey || '',
        p.title || '',
        p.excerpt || '',
        p.body || '',
        p.url || '',
        p.language || 'en',
        p.status || 'published',
        p.visibility || 'public',
        p.searchText || '',
        jsonString(p.meta, {})
      ]);
      return normalizeRows(await db.get(
        'SELECT * FROM searchManager_search_documents WHERE source_module = ? AND source_id = ?',
        [p.sourceModule, String(p.sourceId)]
      ))[0] || null;

    case 'GET_SEARCH_DOCUMENT':
      return normalizeRows(await db.get(
        'SELECT * FROM searchManager_search_documents WHERE source_module = ? AND source_id = ?',
        [p.sourceModule, String(p.sourceId)]
      ))[0] || null;

    case 'SEARCH_DOCUMENTS': {
      const built = sqliteWhere(p);
      built.values.push(Number(p.limit) || 20, Number(p.offset) || 0);
      return normalizeRows(await db.all(`
        SELECT * FROM searchManager_search_documents
         WHERE ${built.where}
         ORDER BY indexed_at DESC, id DESC
         LIMIT ? OFFSET ?;
      `, built.values));
    }

    case 'DELETE_SEARCH_DOCUMENT':
      await db.run(
        'DELETE FROM searchManager_search_documents WHERE source_module = ? AND source_id = ?',
        [p.sourceModule, String(p.sourceId)]
      );
      return { done: true, sourceModule: p.sourceModule, sourceId: String(p.sourceId) };

    default:
      return null;
  }
}

async function handleSearchPostgres(client, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_SEARCH_SCHEMA':
      await client.query('CREATE SCHEMA IF NOT EXISTS searchManager;');
      return { done: true };

    case 'INIT_SEARCH_TABLES':
      await client.query(`
        CREATE TABLE IF NOT EXISTS searchManager.search_documents (
          id SERIAL PRIMARY KEY,
          source_module TEXT NOT NULL,
          source_id TEXT NOT NULL,
          entry_id TEXT,
          content_type_key TEXT DEFAULT '',
          title TEXT DEFAULT '',
          excerpt TEXT DEFAULT '',
          body TEXT DEFAULT '',
          url TEXT DEFAULT '',
          language TEXT DEFAULT 'en',
          status TEXT DEFAULT 'published',
          visibility TEXT DEFAULT 'public',
          search_text TEXT DEFAULT '',
          meta JSONB DEFAULT '{}'::jsonb,
          indexed_at TIMESTAMP DEFAULT NOW(),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(source_module, source_id)
        );
      `);
      await client.query('CREATE INDEX IF NOT EXISTS search_documents_filters ON searchManager.search_documents(status, visibility, content_type_key, language);');
      await client.query('CREATE INDEX IF NOT EXISTS search_documents_indexed_at ON searchManager.search_documents(indexed_at DESC);');
      return { done: true };

    case 'UPSERT_SEARCH_DOCUMENT': {
      const { rows } = await client.query(`
        INSERT INTO searchManager.search_documents
          (source_module, source_id, entry_id, content_type_key, title, excerpt, body,
           url, language, status, visibility, search_text, meta, indexed_at, created_at, updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,NOW(),NOW(),NOW())
        ON CONFLICT(source_module, source_id) DO UPDATE SET
          entry_id=EXCLUDED.entry_id,
          content_type_key=EXCLUDED.content_type_key,
          title=EXCLUDED.title,
          excerpt=EXCLUDED.excerpt,
          body=EXCLUDED.body,
          url=EXCLUDED.url,
          language=EXCLUDED.language,
          status=EXCLUDED.status,
          visibility=EXCLUDED.visibility,
          search_text=EXCLUDED.search_text,
          meta=EXCLUDED.meta,
          indexed_at=NOW(),
          updated_at=NOW()
        RETURNING *;
      `, [
        p.sourceModule,
        String(p.sourceId),
        p.entryId || null,
        p.contentTypeKey || '',
        p.title || '',
        p.excerpt || '',
        p.body || '',
        p.url || '',
        p.language || 'en',
        p.status || 'published',
        p.visibility || 'public',
        p.searchText || '',
        jsonString(p.meta, {})
      ]);
      return normalizeRows(rows)[0] || null;
    }

    case 'GET_SEARCH_DOCUMENT': {
      const { rows } = await client.query(
        'SELECT * FROM searchManager.search_documents WHERE source_module = $1 AND source_id = $2',
        [p.sourceModule, String(p.sourceId)]
      );
      return normalizeRows(rows)[0] || null;
    }

    case 'SEARCH_DOCUMENTS': {
      const built = postgresWhere(p);
      const limitRef = built.add(Number(p.limit) || 20);
      const offsetRef = built.add(Number(p.offset) || 0);
      const { rows } = await client.query(`
        SELECT * FROM searchManager.search_documents
         WHERE ${built.where}
         ORDER BY indexed_at DESC, id DESC
         LIMIT ${limitRef} OFFSET ${offsetRef};
      `, built.values);
      return normalizeRows(rows);
    }

    case 'DELETE_SEARCH_DOCUMENT':
      await client.query(
        'DELETE FROM searchManager.search_documents WHERE source_module = $1 AND source_id = $2',
        [p.sourceModule, String(p.sourceId)]
      );
      return { done: true, sourceModule: p.sourceModule, sourceId: String(p.sourceId) };

    default:
      return null;
  }
}

async function handleSearchMongo(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_SEARCH_SCHEMA':
      return { done: true };

    case 'INIT_SEARCH_TABLES':
      await db.createCollection('search_documents').catch(() => {});
      await db.collection('search_documents').createIndex({ source_module: 1, source_id: 1 }, { unique: true }).catch(() => {});
      await db.collection('search_documents').createIndex({ status: 1, visibility: 1, content_type_key: 1, language: 1 }).catch(() => {});
      await db.collection('search_documents').createIndex({ indexed_at: -1 }).catch(() => {});
      return { done: true };

    case 'UPSERT_SEARCH_DOCUMENT':
      await db.collection('search_documents').updateOne(
        mongoSourceQuery(p),
        {
          $set: {
            source_module: p.sourceModule,
            source_id: String(p.sourceId),
            entry_id: p.entryId || null,
            content_type_key: p.contentTypeKey || '',
            title: p.title || '',
            excerpt: p.excerpt || '',
            body: p.body || '',
            url: p.url || '',
            language: p.language || 'en',
            status: p.status || 'published',
            visibility: p.visibility || 'public',
            search_text: p.searchText || '',
            meta: p.meta || {},
            indexed_at: new Date(),
            updated_at: new Date()
          },
          $setOnInsert: {
            _id: new ObjectId(),
            created_at: new Date()
          }
        },
        { upsert: true }
      );
      return mongoDoc(await db.collection('search_documents').findOne(mongoSourceQuery(p)));

    case 'GET_SEARCH_DOCUMENT':
      return mongoDoc(await db.collection('search_documents').findOne(mongoSourceQuery(p)));

    case 'SEARCH_DOCUMENTS': {
      const query = {};
      const tokens = searchTokens(p.query);
      if (tokens.length) {
        query.$and = tokens.map(token => ({ search_text: { $regex: escapeRegex(token), $options: 'i' } }));
      }
      if (p.contentTypeKey) query.content_type_key = p.contentTypeKey;
      if (p.language) query.language = p.language;
      if (p.status) query.status = p.status;
      if (p.visibility) query.visibility = p.visibility;
      return (await db.collection('search_documents')
        .find(query)
        .sort({ indexed_at: -1, _id: -1 })
        .skip(Number(p.offset) || 0)
        .limit(Number(p.limit) || 20)
        .toArray()).map(mongoDoc);
    }

    case 'DELETE_SEARCH_DOCUMENT':
      await db.collection('search_documents').deleteOne(mongoSourceQuery(p));
      return { done: true, sourceModule: p.sourceModule, sourceId: String(p.sourceId) };

    default:
      return null;
  }
}

module.exports = {
  handleSearchMongo,
  handleSearchPostgres,
  handleSearchSqlite,
  isSearchPlaceholder
};
