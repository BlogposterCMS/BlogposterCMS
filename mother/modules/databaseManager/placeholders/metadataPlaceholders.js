'use strict';

const { ObjectId } = require('mongodb');

const METADATA_PLACEHOLDERS = new Set([
  'INIT_METADATA_SCHEMA',
  'INIT_METADATA_TABLES',
  'UPSERT_META_FIELD',
  'GET_META_FIELD',
  'LIST_META_FIELDS',
  'DELETE_META_FIELD',
  'UPSERT_METADATA_VALUE',
  'GET_METADATA_VALUES',
  'DELETE_METADATA_VALUE',
  'DELETE_METADATA_FOR_TARGET'
]);

function isMetadataPlaceholder(operation) {
  return METADATA_PLACEHOLDERS.has(operation);
}

function paramsObject(params) {
  return Array.isArray(params) ? (params[0] || {}) : (params || {});
}

function jsonString(value, fallback = null) {
  return JSON.stringify((typeof value === 'undefined' ? fallback : value) ?? fallback);
}

function parseJson(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeFieldRows(rows) {
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map(row => ({
    ...row,
    targetType: row.target_type,
    metaKey: row.meta_key,
    valueType: row.value_type,
    defaultValue: parseJson(row.default_value, null),
    public: row.public === true || row.public === 1,
    multiple: row.multiple === true || row.multiple === 1,
    searchable: row.searchable === true || row.searchable === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    settings: parseJson(row.settings, {}),
    meta: parseJson(row.meta, {})
  }));
}

function normalizeValueRows(rows) {
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map(row => ({
    ...row,
    targetType: row.target_type,
    targetId: row.target_id,
    metaKey: row.meta_key,
    valueType: row.value_type,
    sourceModule: row.source_module,
    sourceId: row.source_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    value: parseJson(row.value, null),
    meta: parseJson(row.meta, {})
  }));
}

function mongoFieldDoc(doc) {
  if (!doc) return null;
  const id = doc.id || (doc._id ? String(doc._id) : undefined);
  const out = { ...doc, id };
  delete out._id;
  out.targetType = out.target_type;
  out.metaKey = out.meta_key;
  out.valueType = out.value_type;
  out.defaultValue = out.default_value;
  out.createdAt = out.created_at;
  out.updatedAt = out.updated_at;
  return out;
}

function mongoValueDoc(doc) {
  if (!doc) return null;
  const id = doc.id || (doc._id ? String(doc._id) : undefined);
  const out = { ...doc, id };
  delete out._id;
  out.targetType = out.target_type;
  out.targetId = out.target_id;
  out.metaKey = out.meta_key;
  out.valueType = out.value_type;
  out.sourceModule = out.source_module;
  out.sourceId = out.source_id;
  out.createdAt = out.created_at;
  out.updatedAt = out.updated_at;
  return out;
}

function sqliteValueWhere(p) {
  const where = ['target_type = ?', 'target_id = ?'];
  const values = [p.targetType, String(p.targetId)];
  if (p.metaKey) {
    where.push('meta_key = ?');
    values.push(p.metaKey);
  }
  if (p.language) {
    where.push('language = ?');
    values.push(p.language);
  }
  if (p.visibility) {
    where.push('visibility = ?');
    values.push(p.visibility);
  }
  return { where: where.join(' AND '), values };
}

function postgresBuilder() {
  const values = [];
  const add = value => {
    values.push(value);
    return `$${values.length}`;
  };
  return { values, add };
}

async function handleMetadataSqlite(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_METADATA_SCHEMA':
      return { done: true };

    case 'INIT_METADATA_TABLES':
      await db.exec(`
        CREATE TABLE IF NOT EXISTS metadataManager_metadata_fields (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          target_type TEXT NOT NULL,
          meta_key TEXT NOT NULL,
          label TEXT DEFAULT '',
          description TEXT DEFAULT '',
          value_type TEXT DEFAULT 'string',
          default_value TEXT DEFAULT 'null',
          public INTEGER DEFAULT 0,
          multiple INTEGER DEFAULT 0,
          searchable INTEGER DEFAULT 0,
          settings TEXT DEFAULT '{}',
          meta TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(target_type, meta_key)
        );

        CREATE TABLE IF NOT EXISTS metadataManager_metadata_values (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          meta_key TEXT NOT NULL,
          language TEXT DEFAULT '',
          value TEXT DEFAULT 'null',
          value_type TEXT DEFAULT 'string',
          visibility TEXT DEFAULT 'private',
          source_module TEXT DEFAULT '',
          source_id TEXT DEFAULT '',
          meta TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(target_type, target_id, meta_key, language)
        );
      `);
      await db.run('CREATE INDEX IF NOT EXISTS metadata_fields_target ON metadataManager_metadata_fields(target_type, public);');
      await db.run('CREATE INDEX IF NOT EXISTS metadata_values_target ON metadataManager_metadata_values(target_type, target_id, visibility);');
      await db.run('CREATE INDEX IF NOT EXISTS metadata_values_key ON metadataManager_metadata_values(meta_key, visibility);');
      return { done: true };

    case 'UPSERT_META_FIELD':
      await db.run(`
        INSERT INTO metadataManager_metadata_fields
          (target_type, meta_key, label, description, value_type, default_value,
           public, multiple, searchable, settings, meta, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(target_type, meta_key) DO UPDATE SET
          label=excluded.label,
          description=excluded.description,
          value_type=excluded.value_type,
          default_value=excluded.default_value,
          public=excluded.public,
          multiple=excluded.multiple,
          searchable=excluded.searchable,
          settings=excluded.settings,
          meta=excluded.meta,
          updated_at=CURRENT_TIMESTAMP;
      `, [
        p.targetType, p.metaKey, p.label || '', p.description || '', p.valueType || 'string',
        jsonString(p.defaultValue, null), p.public ? 1 : 0, p.multiple ? 1 : 0,
        p.searchable ? 1 : 0, jsonString(p.settings, {}), jsonString(p.meta, {})
      ]);
      return normalizeFieldRows(await db.get(
        'SELECT * FROM metadataManager_metadata_fields WHERE target_type = ? AND meta_key = ?',
        [p.targetType, p.metaKey]
      ))[0] || null;

    case 'GET_META_FIELD':
      return normalizeFieldRows(await db.get(
        'SELECT * FROM metadataManager_metadata_fields WHERE target_type = ? AND meta_key = ?',
        [p.targetType, p.metaKey]
      ))[0] || null;

    case 'LIST_META_FIELDS': {
      const where = [];
      const values = [];
      if (p.targetType) {
        where.push('target_type = ?');
        values.push(p.targetType);
      }
      if (typeof p.public === 'boolean') {
        where.push('public = ?');
        values.push(p.public ? 1 : 0);
      }
      values.push(Number(p.limit) || 100, Number(p.offset) || 0);
      return normalizeFieldRows(await db.all(`
        SELECT * FROM metadataManager_metadata_fields
         WHERE ${where.length ? where.join(' AND ') : '1 = 1'}
         ORDER BY target_type ASC, meta_key ASC
         LIMIT ? OFFSET ?;
      `, values));
    }

    case 'DELETE_META_FIELD':
      await db.run(
        'DELETE FROM metadataManager_metadata_fields WHERE target_type = ? AND meta_key = ?',
        [p.targetType, p.metaKey]
      );
      return { done: true, targetType: p.targetType, metaKey: p.metaKey };

    case 'UPSERT_METADATA_VALUE':
      await db.run(`
        INSERT INTO metadataManager_metadata_values
          (target_type, target_id, meta_key, language, value, value_type, visibility,
           source_module, source_id, meta, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(target_type, target_id, meta_key, language) DO UPDATE SET
          value=excluded.value,
          value_type=excluded.value_type,
          visibility=excluded.visibility,
          source_module=excluded.source_module,
          source_id=excluded.source_id,
          meta=excluded.meta,
          updated_at=CURRENT_TIMESTAMP;
      `, [
        p.targetType, String(p.targetId), p.metaKey, p.language || '', jsonString(p.value, null),
        p.valueType || 'string', p.visibility || 'private', p.sourceModule || '', p.sourceId || '',
        jsonString(p.meta, {})
      ]);
      return normalizeValueRows(await db.get(`
        SELECT * FROM metadataManager_metadata_values
         WHERE target_type = ? AND target_id = ? AND meta_key = ? AND language = ?
      `, [p.targetType, String(p.targetId), p.metaKey, p.language || '']))[0] || null;

    case 'GET_METADATA_VALUES': {
      const built = sqliteValueWhere(p);
      built.values.push(Number(p.limit) || 100, Number(p.offset) || 0);
      return normalizeValueRows(await db.all(`
        SELECT * FROM metadataManager_metadata_values
         WHERE ${built.where}
         ORDER BY meta_key ASC, language ASC, id ASC
         LIMIT ? OFFSET ?;
      `, built.values));
    }

    case 'DELETE_METADATA_VALUE': {
      const built = sqliteValueWhere(p);
      await db.run(`DELETE FROM metadataManager_metadata_values WHERE ${built.where}`, built.values);
      return { done: true };
    }

    case 'DELETE_METADATA_FOR_TARGET':
      await db.run(
        'DELETE FROM metadataManager_metadata_values WHERE target_type = ? AND target_id = ?',
        [p.targetType, String(p.targetId)]
      );
      return { done: true, targetType: p.targetType, targetId: String(p.targetId) };

    default:
      return null;
  }
}

async function handleMetadataPostgres(client, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_METADATA_SCHEMA':
      await client.query('CREATE SCHEMA IF NOT EXISTS metadataManager;');
      return { done: true };

    case 'INIT_METADATA_TABLES':
      await client.query(`
        CREATE TABLE IF NOT EXISTS metadataManager.metadata_fields (
          id SERIAL PRIMARY KEY,
          target_type TEXT NOT NULL,
          meta_key TEXT NOT NULL,
          label TEXT DEFAULT '',
          description TEXT DEFAULT '',
          value_type TEXT DEFAULT 'string',
          default_value JSONB DEFAULT 'null'::jsonb,
          public BOOLEAN DEFAULT false,
          multiple BOOLEAN DEFAULT false,
          searchable BOOLEAN DEFAULT false,
          settings JSONB DEFAULT '{}'::jsonb,
          meta JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(target_type, meta_key)
        );

        CREATE TABLE IF NOT EXISTS metadataManager.metadata_values (
          id SERIAL PRIMARY KEY,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          meta_key TEXT NOT NULL,
          language TEXT DEFAULT '',
          value JSONB DEFAULT 'null'::jsonb,
          value_type TEXT DEFAULT 'string',
          visibility TEXT DEFAULT 'private',
          source_module TEXT DEFAULT '',
          source_id TEXT DEFAULT '',
          meta JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(target_type, target_id, meta_key, language)
        );
      `);
      await client.query('CREATE INDEX IF NOT EXISTS metadata_fields_target ON metadataManager.metadata_fields(target_type, public);');
      await client.query('CREATE INDEX IF NOT EXISTS metadata_values_target ON metadataManager.metadata_values(target_type, target_id, visibility);');
      await client.query('CREATE INDEX IF NOT EXISTS metadata_values_key ON metadataManager.metadata_values(meta_key, visibility);');
      return { done: true };

    case 'UPSERT_META_FIELD': {
      const { rows } = await client.query(`
        INSERT INTO metadataManager.metadata_fields
          (target_type, meta_key, label, description, value_type, default_value,
           public, multiple, searchable, settings, meta, created_at, updated_at)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb,$11::jsonb,NOW(),NOW())
        ON CONFLICT(target_type, meta_key) DO UPDATE SET
          label=EXCLUDED.label,
          description=EXCLUDED.description,
          value_type=EXCLUDED.value_type,
          default_value=EXCLUDED.default_value,
          public=EXCLUDED.public,
          multiple=EXCLUDED.multiple,
          searchable=EXCLUDED.searchable,
          settings=EXCLUDED.settings,
          meta=EXCLUDED.meta,
          updated_at=NOW()
        RETURNING *;
      `, [
        p.targetType, p.metaKey, p.label || '', p.description || '', p.valueType || 'string',
        jsonString(p.defaultValue, null), p.public === true, p.multiple === true, p.searchable === true,
        jsonString(p.settings, {}), jsonString(p.meta, {})
      ]);
      return normalizeFieldRows(rows)[0] || null;
    }

    case 'GET_META_FIELD': {
      const { rows } = await client.query(
        'SELECT * FROM metadataManager.metadata_fields WHERE target_type = $1 AND meta_key = $2',
        [p.targetType, p.metaKey]
      );
      return normalizeFieldRows(rows)[0] || null;
    }

    case 'LIST_META_FIELDS': {
      const built = postgresBuilder();
      const where = [];
      if (p.targetType) where.push(`target_type = ${built.add(p.targetType)}`);
      if (typeof p.public === 'boolean') where.push(`public = ${built.add(p.public)}`);
      const limitRef = built.add(Number(p.limit) || 100);
      const offsetRef = built.add(Number(p.offset) || 0);
      const { rows } = await client.query(`
        SELECT * FROM metadataManager.metadata_fields
         WHERE ${where.length ? where.join(' AND ') : '1 = 1'}
         ORDER BY target_type ASC, meta_key ASC
         LIMIT ${limitRef} OFFSET ${offsetRef};
      `, built.values);
      return normalizeFieldRows(rows);
    }

    case 'DELETE_META_FIELD':
      await client.query(
        'DELETE FROM metadataManager.metadata_fields WHERE target_type = $1 AND meta_key = $2',
        [p.targetType, p.metaKey]
      );
      return { done: true, targetType: p.targetType, metaKey: p.metaKey };

    case 'UPSERT_METADATA_VALUE': {
      const { rows } = await client.query(`
        INSERT INTO metadataManager.metadata_values
          (target_type, target_id, meta_key, language, value, value_type, visibility,
           source_module, source_id, meta, created_at, updated_at)
        VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10::jsonb,NOW(),NOW())
        ON CONFLICT(target_type, target_id, meta_key, language) DO UPDATE SET
          value=EXCLUDED.value,
          value_type=EXCLUDED.value_type,
          visibility=EXCLUDED.visibility,
          source_module=EXCLUDED.source_module,
          source_id=EXCLUDED.source_id,
          meta=EXCLUDED.meta,
          updated_at=NOW()
        RETURNING *;
      `, [
        p.targetType, String(p.targetId), p.metaKey, p.language || '', jsonString(p.value, null),
        p.valueType || 'string', p.visibility || 'private', p.sourceModule || '', p.sourceId || '',
        jsonString(p.meta, {})
      ]);
      return normalizeValueRows(rows)[0] || null;
    }

    case 'GET_METADATA_VALUES': {
      const built = postgresBuilder();
      const where = [
        `target_type = ${built.add(p.targetType)}`,
        `target_id = ${built.add(String(p.targetId))}`
      ];
      if (p.metaKey) where.push(`meta_key = ${built.add(p.metaKey)}`);
      if (p.language) where.push(`language = ${built.add(p.language)}`);
      if (p.visibility) where.push(`visibility = ${built.add(p.visibility)}`);
      const limitRef = built.add(Number(p.limit) || 100);
      const offsetRef = built.add(Number(p.offset) || 0);
      const { rows } = await client.query(`
        SELECT * FROM metadataManager.metadata_values
         WHERE ${where.join(' AND ')}
         ORDER BY meta_key ASC, language ASC, id ASC
         LIMIT ${limitRef} OFFSET ${offsetRef};
      `, built.values);
      return normalizeValueRows(rows);
    }

    case 'DELETE_METADATA_VALUE': {
      const built = postgresBuilder();
      const where = [
        `target_type = ${built.add(p.targetType)}`,
        `target_id = ${built.add(String(p.targetId))}`
      ];
      if (p.metaKey) where.push(`meta_key = ${built.add(p.metaKey)}`);
      if (p.language) where.push(`language = ${built.add(p.language)}`);
      if (p.visibility) where.push(`visibility = ${built.add(p.visibility)}`);
      await client.query(`DELETE FROM metadataManager.metadata_values WHERE ${where.join(' AND ')}`, built.values);
      return { done: true };
    }

    case 'DELETE_METADATA_FOR_TARGET':
      await client.query(
        'DELETE FROM metadataManager.metadata_values WHERE target_type = $1 AND target_id = $2',
        [p.targetType, String(p.targetId)]
      );
      return { done: true, targetType: p.targetType, targetId: String(p.targetId) };

    default:
      return null;
  }
}

async function handleMetadataMongo(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_METADATA_SCHEMA':
      return { done: true };

    case 'INIT_METADATA_TABLES':
      await db.createCollection('metadata_fields').catch(() => {});
      await db.createCollection('metadata_values').catch(() => {});
      await db.collection('metadata_fields').createIndex({ target_type: 1, meta_key: 1 }, { unique: true }).catch(() => {});
      await db.collection('metadata_fields').createIndex({ target_type: 1, public: 1 }).catch(() => {});
      await db.collection('metadata_values').createIndex({ target_type: 1, target_id: 1, meta_key: 1, language: 1 }, { unique: true }).catch(() => {});
      await db.collection('metadata_values').createIndex({ target_type: 1, target_id: 1, visibility: 1 }).catch(() => {});
      return { done: true };

    case 'UPSERT_META_FIELD':
      await db.collection('metadata_fields').updateOne(
        { target_type: p.targetType, meta_key: p.metaKey },
        {
          $set: {
            target_type: p.targetType,
            meta_key: p.metaKey,
            label: p.label || '',
            description: p.description || '',
            value_type: p.valueType || 'string',
            default_value: p.defaultValue ?? null,
            public: p.public === true,
            multiple: p.multiple === true,
            searchable: p.searchable === true,
            settings: p.settings || {},
            meta: p.meta || {},
            updated_at: new Date().toISOString()
          },
          $setOnInsert: {
            _id: new ObjectId(),
            created_at: new Date().toISOString()
          }
        },
        { upsert: true }
      );
      return mongoFieldDoc(await db.collection('metadata_fields').findOne({ target_type: p.targetType, meta_key: p.metaKey }));

    case 'GET_META_FIELD':
      return mongoFieldDoc(await db.collection('metadata_fields').findOne({ target_type: p.targetType, meta_key: p.metaKey }));

    case 'LIST_META_FIELDS': {
      const query = {};
      if (p.targetType) query.target_type = p.targetType;
      if (typeof p.public === 'boolean') query.public = p.public;
      return (await db.collection('metadata_fields')
        .find(query)
        .sort({ target_type: 1, meta_key: 1 })
        .skip(Number(p.offset) || 0)
        .limit(Number(p.limit) || 100)
        .toArray()).map(mongoFieldDoc);
    }

    case 'DELETE_META_FIELD':
      await db.collection('metadata_fields').deleteOne({ target_type: p.targetType, meta_key: p.metaKey });
      return { done: true, targetType: p.targetType, metaKey: p.metaKey };

    case 'UPSERT_METADATA_VALUE':
      await db.collection('metadata_values').updateOne(
        {
          target_type: p.targetType,
          target_id: String(p.targetId),
          meta_key: p.metaKey,
          language: p.language || ''
        },
        {
          $set: {
            target_type: p.targetType,
            target_id: String(p.targetId),
            meta_key: p.metaKey,
            language: p.language || '',
            value: p.value ?? null,
            value_type: p.valueType || 'string',
            visibility: p.visibility || 'private',
            source_module: p.sourceModule || '',
            source_id: p.sourceId || '',
            meta: p.meta || {},
            updated_at: new Date().toISOString()
          },
          $setOnInsert: {
            _id: new ObjectId(),
            created_at: new Date().toISOString()
          }
        },
        { upsert: true }
      );
      return mongoValueDoc(await db.collection('metadata_values').findOne({
        target_type: p.targetType,
        target_id: String(p.targetId),
        meta_key: p.metaKey,
        language: p.language || ''
      }));

    case 'GET_METADATA_VALUES': {
      const query = {
        target_type: p.targetType,
        target_id: String(p.targetId)
      };
      if (p.metaKey) query.meta_key = p.metaKey;
      if (p.language) query.language = p.language;
      if (p.visibility) query.visibility = p.visibility;
      return (await db.collection('metadata_values')
        .find(query)
        .sort({ meta_key: 1, language: 1, _id: 1 })
        .skip(Number(p.offset) || 0)
        .limit(Number(p.limit) || 100)
        .toArray()).map(mongoValueDoc);
    }

    case 'DELETE_METADATA_VALUE': {
      const query = {
        target_type: p.targetType,
        target_id: String(p.targetId)
      };
      if (p.metaKey) query.meta_key = p.metaKey;
      if (p.language) query.language = p.language;
      if (p.visibility) query.visibility = p.visibility;
      await db.collection('metadata_values').deleteMany(query);
      return { done: true };
    }

    case 'DELETE_METADATA_FOR_TARGET':
      await db.collection('metadata_values').deleteMany({
        target_type: p.targetType,
        target_id: String(p.targetId)
      });
      return { done: true, targetType: p.targetType, targetId: String(p.targetId) };

    default:
      return null;
  }
}

module.exports = {
  handleMetadataMongo,
  handleMetadataPostgres,
  handleMetadataSqlite,
  isMetadataPlaceholder
};
