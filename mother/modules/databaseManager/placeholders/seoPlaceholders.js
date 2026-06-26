'use strict';

const { ObjectId } = require('mongodb');

const SEO_PLACEHOLDERS = new Set([
  'INIT_SEO_SCHEMA',
  'INIT_SEO_TABLES',
  'UPSERT_SEO_META',
  'GET_SEO_META',
  'LIST_SEO_META',
  'DELETE_SEO_META'
]);

function isSeoPlaceholder(operation) {
  return SEO_PLACEHOLDERS.has(operation);
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
    canonicalUrl: row.canonical_url,
    ogImage: row.og_image,
    structuredData: parseJson(row.structured_data, {}),
    structured_data: parseJson(row.structured_data, {}),
    meta: parseJson(row.meta, {})
  }));
}

function mongoDoc(doc) {
  if (!doc) return null;
  const id = doc.id || (doc._id ? String(doc._id) : undefined);
  const out = { ...doc, id };
  delete out._id;
  out.canonicalUrl = out.canonical_url;
  out.ogImage = out.og_image;
  out.structuredData = out.structured_data || {};
  return out;
}

async function handleSeoSqlite(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_SEO_SCHEMA':
      return { done: true };

    case 'INIT_SEO_TABLES':
      await db.exec(`
        CREATE TABLE IF NOT EXISTS seoManager_seo_meta (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          target_type TEXT NOT NULL,
          target_key TEXT NOT NULL,
          title TEXT DEFAULT '',
          description TEXT DEFAULT '',
          keywords TEXT DEFAULT '',
          canonical_url TEXT DEFAULT '',
          robots TEXT DEFAULT 'index,follow',
          og_image TEXT DEFAULT '',
          structured_data TEXT DEFAULT '{}',
          meta TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(target_type, target_key)
        );
      `);
      await db.run('CREATE INDEX IF NOT EXISTS seo_meta_target ON seoManager_seo_meta(target_type, target_key);');
      return { done: true };

    case 'UPSERT_SEO_META':
      await db.run(`
        INSERT INTO seoManager_seo_meta
          (target_type, target_key, title, description, keywords, canonical_url, robots,
           og_image, structured_data, meta, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(target_type, target_key) DO UPDATE SET
          title=excluded.title,
          description=excluded.description,
          keywords=excluded.keywords,
          canonical_url=excluded.canonical_url,
          robots=excluded.robots,
          og_image=excluded.og_image,
          structured_data=excluded.structured_data,
          meta=excluded.meta,
          updated_at=CURRENT_TIMESTAMP;
      `, [
        p.targetType,
        p.targetKey,
        p.title || '',
        p.description || '',
        p.keywords || '',
        p.canonicalUrl || '',
        p.robots || 'index,follow',
        p.ogImage || '',
        jsonString(p.structuredData, {}),
        jsonString(p.meta, {})
      ]);
      return normalizeRows(await db.get(
        'SELECT * FROM seoManager_seo_meta WHERE target_type = ? AND target_key = ?',
        [p.targetType, p.targetKey]
      ))[0] || null;

    case 'GET_SEO_META':
      return normalizeRows(await db.get(
        'SELECT * FROM seoManager_seo_meta WHERE target_type = ? AND target_key = ?',
        [p.targetType, p.targetKey]
      ))[0] || null;

    case 'LIST_SEO_META': {
      const values = [];
      let where = '1 = 1';
      if (p.targetType) {
        where = 'target_type = ?';
        values.push(p.targetType);
      }
      values.push(Number(p.limit) || 50, Number(p.offset) || 0);
      return normalizeRows(await db.all(
        `SELECT * FROM seoManager_seo_meta WHERE ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
        values
      ));
    }

    case 'DELETE_SEO_META':
      await db.run('DELETE FROM seoManager_seo_meta WHERE target_type = ? AND target_key = ?', [p.targetType, p.targetKey]);
      return { done: true, targetType: p.targetType, targetKey: p.targetKey };

    default:
      return null;
  }
}

async function handleSeoPostgres(client, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_SEO_SCHEMA':
      await client.query('CREATE SCHEMA IF NOT EXISTS seoManager;');
      return { done: true };

    case 'INIT_SEO_TABLES':
      await client.query(`
        CREATE TABLE IF NOT EXISTS seoManager.seo_meta (
          id SERIAL PRIMARY KEY,
          target_type TEXT NOT NULL,
          target_key TEXT NOT NULL,
          title TEXT DEFAULT '',
          description TEXT DEFAULT '',
          keywords TEXT DEFAULT '',
          canonical_url TEXT DEFAULT '',
          robots TEXT DEFAULT 'index,follow',
          og_image TEXT DEFAULT '',
          structured_data JSONB DEFAULT '{}'::jsonb,
          meta JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(target_type, target_key)
        );
      `);
      await client.query('CREATE INDEX IF NOT EXISTS seo_meta_target ON seoManager.seo_meta(target_type, target_key);');
      return { done: true };

    case 'UPSERT_SEO_META': {
      const { rows } = await client.query(`
        INSERT INTO seoManager.seo_meta
          (target_type, target_key, title, description, keywords, canonical_url, robots,
           og_image, structured_data, meta, created_at, updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,NOW(),NOW())
        ON CONFLICT(target_type, target_key) DO UPDATE SET
          title=EXCLUDED.title,
          description=EXCLUDED.description,
          keywords=EXCLUDED.keywords,
          canonical_url=EXCLUDED.canonical_url,
          robots=EXCLUDED.robots,
          og_image=EXCLUDED.og_image,
          structured_data=EXCLUDED.structured_data,
          meta=EXCLUDED.meta,
          updated_at=NOW()
        RETURNING *;
      `, [
        p.targetType,
        p.targetKey,
        p.title || '',
        p.description || '',
        p.keywords || '',
        p.canonicalUrl || '',
        p.robots || 'index,follow',
        p.ogImage || '',
        jsonString(p.structuredData, {}),
        jsonString(p.meta, {})
      ]);
      return normalizeRows(rows)[0] || null;
    }

    case 'GET_SEO_META': {
      const { rows } = await client.query(
        'SELECT * FROM seoManager.seo_meta WHERE target_type = $1 AND target_key = $2',
        [p.targetType, p.targetKey]
      );
      return normalizeRows(rows)[0] || null;
    }

    case 'LIST_SEO_META': {
      const values = [];
      let where = '1 = 1';
      if (p.targetType) {
        where = 'target_type = $1';
        values.push(p.targetType);
      }
      values.push(Number(p.limit) || 50, Number(p.offset) || 0);
      const limitRef = `$${values.length - 1}`;
      const offsetRef = `$${values.length}`;
      const { rows } = await client.query(
        `SELECT * FROM seoManager.seo_meta WHERE ${where} ORDER BY updated_at DESC LIMIT ${limitRef} OFFSET ${offsetRef}`,
        values
      );
      return normalizeRows(rows);
    }

    case 'DELETE_SEO_META':
      await client.query('DELETE FROM seoManager.seo_meta WHERE target_type = $1 AND target_key = $2', [p.targetType, p.targetKey]);
      return { done: true, targetType: p.targetType, targetKey: p.targetKey };

    default:
      return null;
  }
}

async function handleSeoMongo(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_SEO_SCHEMA':
      return { done: true };

    case 'INIT_SEO_TABLES':
      await db.createCollection('seo_meta').catch(() => {});
      await db.collection('seo_meta').createIndex({ target_type: 1, target_key: 1 }, { unique: true }).catch(() => {});
      return { done: true };

    case 'UPSERT_SEO_META':
      await db.collection('seo_meta').updateOne(
        { target_type: p.targetType, target_key: p.targetKey },
        {
          $set: {
            target_type: p.targetType,
            target_key: p.targetKey,
            title: p.title || '',
            description: p.description || '',
            keywords: p.keywords || '',
            canonical_url: p.canonicalUrl || '',
            robots: p.robots || 'index,follow',
            og_image: p.ogImage || '',
            structured_data: p.structuredData || {},
            meta: p.meta || {},
            updated_at: new Date()
          },
          $setOnInsert: {
            _id: new ObjectId(),
            created_at: new Date()
          }
        },
        { upsert: true }
      );
      return mongoDoc(await db.collection('seo_meta').findOne({ target_type: p.targetType, target_key: p.targetKey }));

    case 'GET_SEO_META':
      return mongoDoc(await db.collection('seo_meta').findOne({ target_type: p.targetType, target_key: p.targetKey }));

    case 'LIST_SEO_META': {
      const query = p.targetType ? { target_type: p.targetType } : {};
      return (await db.collection('seo_meta')
        .find(query)
        .sort({ updated_at: -1 })
        .skip(Number(p.offset) || 0)
        .limit(Number(p.limit) || 50)
        .toArray()).map(mongoDoc);
    }

    case 'DELETE_SEO_META':
      await db.collection('seo_meta').deleteOne({ target_type: p.targetType, target_key: p.targetKey });
      return { done: true, targetType: p.targetType, targetKey: p.targetKey };

    default:
      return null;
  }
}

module.exports = {
  handleSeoMongo,
  handleSeoPostgres,
  handleSeoSqlite,
  isSeoPlaceholder
};
