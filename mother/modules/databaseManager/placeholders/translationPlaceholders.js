'use strict';

const { ObjectId } = require('mongodb');

const TRANSLATION_PLACEHOLDERS = new Set([
  'INIT_TRANSLATION_TABLES',
  'UPSERT_TRANSLATED_TEXT',
  'UPDATE_TRANSLATED_TEXT',
  'GET_TRANSLATED_TEXT',
  'LIST_TRANSLATED_TEXTS',
  'DELETE_TRANSLATED_TEXT',
  'UPSERT_TRANSLATION_LANGUAGE',
  'GET_TRANSLATION_LANGUAGE',
  'LIST_TRANSLATION_LANGUAGES',
  'DELETE_TRANSLATION_LANGUAGE'
]);

function isTranslationPlaceholder(operation) {
  return TRANSLATION_PLACEHOLDERS.has(operation);
}

function paramsObject(params) {
  return Array.isArray(params) ? (params[0] || {}) : (params || {});
}

function jsonString(value, fallback = {}) {
  return JSON.stringify(value ?? fallback);
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
    meta: parseJson(row.meta, {})
  }));
}

function toObjectId(value) {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  return ObjectId.isValid(value) ? new ObjectId(value) : null;
}

function mongoDoc(doc) {
  if (!doc) return null;
  const id = doc.id || (doc._id ? String(doc._id) : undefined);
  const out = { ...doc, id };
  delete out._id;
  return out;
}

function mongoIdQuery(value) {
  const oid = toObjectId(value);
  return oid ? { _id: oid } : { id: String(value) };
}

async function handleTranslationSqlite(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_TRANSLATION_TABLES':
      await db.exec(`
        CREATE TABLE IF NOT EXISTS translationmanager_translation_texts (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          object_id     TEXT NOT NULL,
          field_name    TEXT NOT NULL,
          language_code TEXT NOT NULL,
          text_value    TEXT DEFAULT '',
          status        TEXT DEFAULT 'published',
          meta          TEXT DEFAULT '{}',
          created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(object_id, field_name, language_code)
        );

        CREATE TABLE IF NOT EXISTS translationmanager_translation_languages (
          language_code  TEXT PRIMARY KEY,
          language_name  TEXT NOT NULL,
          locale         TEXT,
          active         INTEGER DEFAULT 1,
          text_direction TEXT DEFAULT 'ltr',
          created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS translationmanager_translation_usage (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id     INTEGER,
          provider    TEXT,
          chars       INTEGER DEFAULT 0,
          from_lang   TEXT,
          to_lang     TEXT,
          created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS translationmanager_translation_cache (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          provider        TEXT,
          from_lang       TEXT,
          to_lang         TEXT,
          source_text     TEXT,
          translated_text TEXT,
          user_id         INTEGER,
          created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS translation_texts_target_lang
          ON translationmanager_translation_texts(object_id, language_code);
      `);
      return { done: true };

    case 'UPSERT_TRANSLATED_TEXT':
      await db.run(`
        INSERT INTO translationmanager_translation_texts
          (object_id, field_name, language_code, text_value, status, meta, created_at, updated_at)
        VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(object_id, field_name, language_code) DO UPDATE SET
          text_value=excluded.text_value,
          status=excluded.status,
          meta=excluded.meta,
          updated_at=CURRENT_TIMESTAMP;
      `, [p.objectId, p.fieldName, p.languageCode, p.textValue || '', p.status || 'published', jsonString(p.meta, {})]);
      return normalizeRows(await db.get(`
        SELECT * FROM translationmanager_translation_texts
         WHERE object_id = ? AND field_name = ? AND language_code = ?;
      `, [p.objectId, p.fieldName, p.languageCode]))[0] || null;

    case 'GET_TRANSLATED_TEXT':
      if (p.textId) return normalizeRows(await db.get('SELECT * FROM translationmanager_translation_texts WHERE id = ?', [p.textId]))[0] || null;
      return normalizeRows(await db.get(`
        SELECT * FROM translationmanager_translation_texts
         WHERE object_id = ? AND field_name = ? AND language_code = ?;
      `, [p.objectId, p.fieldName, p.languageCode]))[0] || null;

    case 'UPDATE_TRANSLATED_TEXT': {
      const values = [p.textValue || '', p.status || 'published', jsonString(p.meta, {})];
      if (p.textId) {
        values.push(p.textId);
        await db.run(`
          UPDATE translationmanager_translation_texts
             SET text_value = ?, status = ?, meta = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?;
        `, values);
        return normalizeRows(await db.get('SELECT * FROM translationmanager_translation_texts WHERE id = ?', [p.textId]))[0] || null;
      }
      values.push(p.objectId, p.fieldName, p.languageCode);
      await db.run(`
        UPDATE translationmanager_translation_texts
           SET text_value = ?, status = ?, meta = ?, updated_at = CURRENT_TIMESTAMP
         WHERE object_id = ? AND field_name = ? AND language_code = ?;
      `, values);
      return normalizeRows(await db.get(`
        SELECT * FROM translationmanager_translation_texts
         WHERE object_id = ? AND field_name = ? AND language_code = ?;
      `, [p.objectId, p.fieldName, p.languageCode]))[0] || null;
    }

    case 'LIST_TRANSLATED_TEXTS': {
      const values = [];
      const where = [];
      if (p.objectId) {
        where.push('object_id = ?');
        values.push(p.objectId);
      }
      if (p.fieldName) {
        where.push('field_name = ?');
        values.push(p.fieldName);
      }
      if (p.languageCode) {
        where.push('language_code = ?');
        values.push(p.languageCode);
      }
      if (p.status) {
        where.push('status = ?');
        values.push(p.status);
      }
      values.push(Number(p.limit) || 100, Number(p.offset) || 0);
      return normalizeRows(await db.all(`
        SELECT * FROM translationmanager_translation_texts
         WHERE ${where.length ? where.join(' AND ') : '1 = 1'}
         ORDER BY updated_at DESC, id DESC
         LIMIT ? OFFSET ?;
      `, values));
    }

    case 'DELETE_TRANSLATED_TEXT':
      if (p.textId) {
        await db.run('DELETE FROM translationmanager_translation_texts WHERE id = ?', [p.textId]);
        return { done: true, textId: p.textId };
      }
      await db.run(`
        DELETE FROM translationmanager_translation_texts
         WHERE object_id = ? AND field_name = ? AND language_code = ?;
      `, [p.objectId, p.fieldName, p.languageCode]);
      return { done: true };

    case 'UPSERT_TRANSLATION_LANGUAGE':
      await db.run(`
        INSERT INTO translationmanager_translation_languages
          (language_code, language_name, locale, active, text_direction, created_at, updated_at)
        VALUES(?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(language_code) DO UPDATE SET
          language_name=excluded.language_name,
          locale=excluded.locale,
          active=excluded.active,
          text_direction=excluded.text_direction,
          updated_at=CURRENT_TIMESTAMP;
      `, [p.languageCode, p.languageName, p.locale || p.languageCode, p.active === false ? 0 : 1, p.textDirection || 'ltr']);
      return await db.get('SELECT * FROM translationmanager_translation_languages WHERE language_code = ?', [p.languageCode]);

    case 'GET_TRANSLATION_LANGUAGE':
      return await db.get('SELECT * FROM translationmanager_translation_languages WHERE language_code = ?', [p.languageCode]);

    case 'LIST_TRANSLATION_LANGUAGES': {
      const values = [];
      const where = [];
      if (typeof p.active !== 'undefined' && p.active !== '') {
        where.push('active = ?');
        values.push(p.active === false || p.active === 'false' ? 0 : 1);
      }
      return await db.all(`
        SELECT * FROM translationmanager_translation_languages
         WHERE ${where.length ? where.join(' AND ') : '1 = 1'}
         ORDER BY language_name ASC, language_code ASC;
      `, values);
    }

    case 'DELETE_TRANSLATION_LANGUAGE':
      await db.run('DELETE FROM translationmanager_translation_languages WHERE language_code = ?', [p.languageCode]);
      return { done: true, languageCode: p.languageCode };

    default:
      return null;
  }
}

async function handleTranslationPostgres(client, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_TRANSLATION_TABLES':
      await client.query(`
        CREATE SCHEMA IF NOT EXISTS translationmanager;

        CREATE TABLE IF NOT EXISTS translationmanager.translation_texts (
          id SERIAL PRIMARY KEY,
          object_id TEXT NOT NULL,
          field_name TEXT NOT NULL,
          language_code TEXT NOT NULL,
          text_value TEXT DEFAULT '',
          status TEXT DEFAULT 'published',
          meta JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE(object_id, field_name, language_code)
        );

        CREATE TABLE IF NOT EXISTS translationmanager.translation_languages (
          language_code TEXT PRIMARY KEY,
          language_name TEXT NOT NULL,
          locale TEXT,
          active BOOLEAN DEFAULT TRUE,
          text_direction TEXT DEFAULT 'ltr',
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS translationmanager.translation_usage (
          id SERIAL PRIMARY KEY,
          user_id INT,
          provider VARCHAR(50),
          chars INT DEFAULT 0,
          from_lang VARCHAR(16),
          to_lang VARCHAR(16),
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS translationmanager.translation_cache (
          id SERIAL PRIMARY KEY,
          provider VARCHAR(50),
          from_lang VARCHAR(16),
          to_lang VARCHAR(16),
          source_text TEXT,
          translated_text TEXT,
          user_id INT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS translation_texts_target_lang
          ON translationmanager.translation_texts(object_id, language_code);
      `);
      return { done: true };

    case 'UPSERT_TRANSLATED_TEXT': {
      const { rows } = await client.query(`
        INSERT INTO translationmanager.translation_texts
          (object_id, field_name, language_code, text_value, status, meta, created_at, updated_at)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,NOW(),NOW())
        ON CONFLICT(object_id, field_name, language_code) DO UPDATE SET
          text_value=EXCLUDED.text_value,
          status=EXCLUDED.status,
          meta=EXCLUDED.meta,
          updated_at=NOW()
        RETURNING *;
      `, [p.objectId, p.fieldName, p.languageCode, p.textValue || '', p.status || 'published', jsonString(p.meta, {})]);
      return rows[0] || null;
    }

    case 'GET_TRANSLATED_TEXT': {
      const { rows } = p.textId
        ? await client.query('SELECT * FROM translationmanager.translation_texts WHERE id = $1', [p.textId])
        : await client.query(`
          SELECT * FROM translationmanager.translation_texts
           WHERE object_id = $1 AND field_name = $2 AND language_code = $3;
        `, [p.objectId, p.fieldName, p.languageCode]);
      return rows[0] || null;
    }

    case 'UPDATE_TRANSLATED_TEXT': {
      const { rows } = p.textId
        ? await client.query(`
          UPDATE translationmanager.translation_texts
             SET text_value=$1, status=$2, meta=$3::jsonb, updated_at=NOW()
           WHERE id=$4
           RETURNING *;
        `, [p.textValue || '', p.status || 'published', jsonString(p.meta, {}), p.textId])
        : await client.query(`
          UPDATE translationmanager.translation_texts
             SET text_value=$1, status=$2, meta=$3::jsonb, updated_at=NOW()
           WHERE object_id=$4 AND field_name=$5 AND language_code=$6
           RETURNING *;
        `, [p.textValue || '', p.status || 'published', jsonString(p.meta, {}), p.objectId, p.fieldName, p.languageCode]);
      return rows[0] || null;
    }

    case 'LIST_TRANSLATED_TEXTS': {
      const values = [];
      const where = [];
      if (p.objectId) {
        values.push(p.objectId);
        where.push(`object_id = $${values.length}`);
      }
      if (p.fieldName) {
        values.push(p.fieldName);
        where.push(`field_name = $${values.length}`);
      }
      if (p.languageCode) {
        values.push(p.languageCode);
        where.push(`language_code = $${values.length}`);
      }
      if (p.status) {
        values.push(p.status);
        where.push(`status = $${values.length}`);
      }
      values.push(Number(p.limit) || 100, Number(p.offset) || 0);
      const limitRef = values.length - 1;
      const offsetRef = values.length;
      const { rows } = await client.query(`
        SELECT * FROM translationmanager.translation_texts
         WHERE ${where.length ? where.join(' AND ') : '1 = 1'}
         ORDER BY updated_at DESC, id DESC
         LIMIT $${limitRef} OFFSET $${offsetRef};
      `, values);
      return rows;
    }

    case 'DELETE_TRANSLATED_TEXT':
      if (p.textId) {
        await client.query('DELETE FROM translationmanager.translation_texts WHERE id = $1', [p.textId]);
        return { done: true, textId: p.textId };
      }
      await client.query(`
        DELETE FROM translationmanager.translation_texts
         WHERE object_id = $1 AND field_name = $2 AND language_code = $3;
      `, [p.objectId, p.fieldName, p.languageCode]);
      return { done: true };

    case 'UPSERT_TRANSLATION_LANGUAGE': {
      const { rows } = await client.query(`
        INSERT INTO translationmanager.translation_languages
          (language_code, language_name, locale, active, text_direction, created_at, updated_at)
        VALUES($1,$2,$3,$4,$5,NOW(),NOW())
        ON CONFLICT(language_code) DO UPDATE SET
          language_name=EXCLUDED.language_name,
          locale=EXCLUDED.locale,
          active=EXCLUDED.active,
          text_direction=EXCLUDED.text_direction,
          updated_at=NOW()
        RETURNING *;
      `, [p.languageCode, p.languageName, p.locale || p.languageCode, p.active !== false, p.textDirection || 'ltr']);
      return rows[0] || null;
    }

    case 'GET_TRANSLATION_LANGUAGE': {
      const { rows } = await client.query('SELECT * FROM translationmanager.translation_languages WHERE language_code = $1', [p.languageCode]);
      return rows[0] || null;
    }

    case 'LIST_TRANSLATION_LANGUAGES': {
      const values = [];
      const where = [];
      if (typeof p.active !== 'undefined' && p.active !== '') {
        values.push(!(p.active === false || p.active === 'false'));
        where.push(`active = $${values.length}`);
      }
      const { rows } = await client.query(`
        SELECT * FROM translationmanager.translation_languages
         WHERE ${where.length ? where.join(' AND ') : '1 = 1'}
         ORDER BY language_name ASC, language_code ASC;
      `, values);
      return rows;
    }

    case 'DELETE_TRANSLATION_LANGUAGE':
      await client.query('DELETE FROM translationmanager.translation_languages WHERE language_code = $1', [p.languageCode]);
      return { done: true, languageCode: p.languageCode };

    default:
      return null;
  }
}

async function handleTranslationMongo(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_TRANSLATION_TABLES':
      await db.createCollection('translation_texts').catch(() => {});
      await db.createCollection('translation_languages').catch(() => {});
      await db.createCollection('translation_usage').catch(() => {});
      await db.createCollection('translation_cache').catch(() => {});
      await db.collection('translation_texts').createIndex(
        { object_id: 1, field_name: 1, language_code: 1 },
        { unique: true }
      ).catch(() => {});
      await db.collection('translation_texts').createIndex({ object_id: 1, language_code: 1 }).catch(() => {});
      await db.collection('translation_languages').createIndex({ language_code: 1 }, { unique: true }).catch(() => {});
      return { done: true };

    case 'UPSERT_TRANSLATED_TEXT':
      await db.collection('translation_texts').updateOne(
        { object_id: String(p.objectId), field_name: p.fieldName, language_code: p.languageCode },
        {
          $set: {
            object_id: String(p.objectId),
            field_name: p.fieldName,
            language_code: p.languageCode,
            text_value: p.textValue || '',
            status: p.status || 'published',
            meta: p.meta || {},
            updated_at: new Date()
          },
          $setOnInsert: { created_at: new Date() }
        },
        { upsert: true }
      );
      return mongoDoc(await db.collection('translation_texts').findOne({
        object_id: String(p.objectId),
        field_name: p.fieldName,
        language_code: p.languageCode
      }));

    case 'GET_TRANSLATED_TEXT':
      if (p.textId) return mongoDoc(await db.collection('translation_texts').findOne(mongoIdQuery(p.textId)));
      return mongoDoc(await db.collection('translation_texts').findOne({
        object_id: String(p.objectId),
        field_name: p.fieldName,
        language_code: p.languageCode
      }));

    case 'UPDATE_TRANSLATED_TEXT': {
      const update = {
        $set: {
          text_value: p.textValue || '',
          status: p.status || 'published',
          meta: p.meta || {},
          updated_at: new Date()
        }
      };
      const query = p.textId
        ? mongoIdQuery(p.textId)
        : { object_id: String(p.objectId), field_name: p.fieldName, language_code: p.languageCode };
      await db.collection('translation_texts').updateOne(query, update);
      return mongoDoc(await db.collection('translation_texts').findOne(query));
    }

    case 'LIST_TRANSLATED_TEXTS': {
      const query = {};
      if (p.objectId) query.object_id = String(p.objectId);
      if (p.fieldName) query.field_name = p.fieldName;
      if (p.languageCode) query.language_code = p.languageCode;
      if (p.status) query.status = p.status;
      return (await db.collection('translation_texts')
        .find(query)
        .sort({ updated_at: -1 })
        .skip(Number(p.offset) || 0)
        .limit(Number(p.limit) || 100)
        .toArray()).map(mongoDoc);
    }

    case 'DELETE_TRANSLATED_TEXT':
      if (p.textId) {
        await db.collection('translation_texts').deleteOne(mongoIdQuery(p.textId));
        return { done: true, textId: p.textId };
      }
      await db.collection('translation_texts').deleteOne({
        object_id: String(p.objectId),
        field_name: p.fieldName,
        language_code: p.languageCode
      });
      return { done: true };

    case 'UPSERT_TRANSLATION_LANGUAGE':
      await db.collection('translation_languages').updateOne(
        { language_code: p.languageCode },
        {
          $set: {
            language_code: p.languageCode,
            language_name: p.languageName,
            locale: p.locale || p.languageCode,
            active: p.active !== false,
            text_direction: p.textDirection || 'ltr',
            updated_at: new Date()
          },
          $setOnInsert: { created_at: new Date() }
        },
        { upsert: true }
      );
      return mongoDoc(await db.collection('translation_languages').findOne({ language_code: p.languageCode }));

    case 'GET_TRANSLATION_LANGUAGE':
      return mongoDoc(await db.collection('translation_languages').findOne({ language_code: p.languageCode }));

    case 'LIST_TRANSLATION_LANGUAGES': {
      const query = {};
      if (typeof p.active !== 'undefined' && p.active !== '') {
        query.active = !(p.active === false || p.active === 'false');
      }
      return (await db.collection('translation_languages')
        .find(query)
        .sort({ language_name: 1, language_code: 1 })
        .toArray()).map(mongoDoc);
    }

    case 'DELETE_TRANSLATION_LANGUAGE':
      await db.collection('translation_languages').deleteOne({ language_code: p.languageCode });
      return { done: true, languageCode: p.languageCode };

    default:
      return null;
  }
}

module.exports = {
  handleTranslationMongo,
  handleTranslationPostgres,
  handleTranslationSqlite,
  isTranslationPlaceholder
};
