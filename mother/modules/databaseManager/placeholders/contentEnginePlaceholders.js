'use strict';

const { ObjectId } = require('mongodb');

const CONTENT_PLACEHOLDERS = new Set([
  'INIT_CONTENT_ENGINE_SCHEMA',
  'INIT_CONTENT_ENGINE_TABLES',
  'UPSERT_CONTENT_TYPE',
  'GET_CONTENT_TYPE',
  'LIST_CONTENT_TYPES',
  'CREATE_CONTENT_ENTRY',
  'UPDATE_CONTENT_ENTRY',
  'GET_CONTENT_ENTRY',
  'GET_CONTENT_ENTRY_BY_SOURCE',
  'FIND_CONTENT_ENTRY_CONFLICT',
  'RESOLVE_CONTENT_PERMALINK',
  'LIST_CONTENT_ENTRIES',
  'LIST_TRASHED_CONTENT_ENTRIES',
  'LIST_SCHEDULED_CONTENT_ENTRIES',
  'LIST_CONTENT_REVISIONS',
  'GET_CONTENT_REVISION',
  'RESTORE_CONTENT_REVISION',
  'TRASH_CONTENT_ENTRY',
  'RESTORE_CONTENT_ENTRY'
]);

function isContentEnginePlaceholder(operation) {
  return CONTENT_PLACEHOLDERS.has(operation);
}

function paramsObject(params) {
  return Array.isArray(params) ? (params[0] || {}) : (params || {});
}

function jsonString(value, fallback) {
  const actual = typeof value === 'undefined' ? fallback : value;
  return JSON.stringify(actual ?? fallback);
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

function normalizeSqlRows(rows) {
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map(row => ({
    ...row,
    fields: parseJson(row.fields, []),
    settings: parseJson(row.settings, {}),
    content: parseJson(row.content, {}),
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

function mongoIdValues(value) {
  if (value == null) return [];
  const values = [value];
  const asString = String(value);
  if (asString && !values.some(item => String(item) === asString)) values.push(asString);
  const asObjectId = toObjectId(value);
  if (asObjectId && !values.some(item => String(item) === String(asObjectId))) values.push(asObjectId);
  return values;
}

function mongoEntryQuery(entryId) {
  const oid = toObjectId(entryId);
  const idValues = mongoIdValues(entryId).filter(value => !(value instanceof ObjectId));
  const clauses = [];
  if (oid) clauses.push({ _id: oid });
  if (idValues.length) clauses.push({ id: { $in: idValues } });
  if (!clauses.length) return { id: String(entryId || '') };
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

async function handleContentEngineSqlite(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_CONTENT_ENGINE_SCHEMA':
      return { done: true };

    case 'INIT_CONTENT_ENGINE_TABLES':
      await db.exec(`
        CREATE TABLE IF NOT EXISTS contentEngine_content_types (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          label TEXT NOT NULL,
          description TEXT DEFAULT '',
          icon TEXT DEFAULT '',
          fields TEXT DEFAULT '[]',
          settings TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS contentEngine_content_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          content_type_key TEXT NOT NULL,
          slug TEXT NOT NULL,
          permalink TEXT NOT NULL UNIQUE,
          status TEXT DEFAULT 'draft',
          title TEXT NOT NULL,
          language TEXT DEFAULT 'en',
          parent_id INTEGER,
          source_module TEXT,
          source_id TEXT,
          author_id TEXT,
          excerpt TEXT DEFAULT '',
          content TEXT DEFAULT '{}',
          meta TEXT DEFAULT '{}',
          current_revision_id INTEGER,
          published_at DATETIME,
          deleted_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(content_type_key, slug, language)
        );

        CREATE TABLE IF NOT EXISTS contentEngine_content_revisions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entry_id INTEGER NOT NULL,
          version INTEGER NOT NULL,
          status TEXT,
          title TEXT,
          excerpt TEXT,
          content TEXT DEFAULT '{}',
          meta TEXT DEFAULT '{}',
          author_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(entry_id, version)
        );

      `);
      await db.run('ALTER TABLE contentEngine_content_entries ADD COLUMN source_module TEXT;').catch(err => {
        if (!/duplicate column/i.test(String(err.message))) throw err;
      });
      await db.run('ALTER TABLE contentEngine_content_entries ADD COLUMN source_id TEXT;').catch(err => {
        if (!/duplicate column/i.test(String(err.message))) throw err;
      });
      await db.run('CREATE INDEX IF NOT EXISTS content_entries_type_status ON contentEngine_content_entries(content_type_key, status, updated_at DESC);');
      await db.run('CREATE INDEX IF NOT EXISTS content_entries_permalink_language ON contentEngine_content_entries(permalink, language);');
      await db.run('CREATE UNIQUE INDEX IF NOT EXISTS content_entries_source_unique ON contentEngine_content_entries(source_module, source_id);');
      await db.run('CREATE INDEX IF NOT EXISTS content_revisions_entry_version ON contentEngine_content_revisions(entry_id, version DESC);');
      return { done: true };

    case 'UPSERT_CONTENT_TYPE': {
      await db.run(`
        INSERT INTO contentEngine_content_types(key, label, description, icon, fields, settings, created_at, updated_at)
        VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          label=excluded.label,
          description=excluded.description,
          icon=excluded.icon,
          fields=excluded.fields,
          settings=excluded.settings,
          updated_at=CURRENT_TIMESTAMP;
      `, [p.key, p.label, p.description || '', p.icon || '', jsonString(p.fields, []), jsonString(p.settings, {})]);
      return normalizeSqlRows(await db.get('SELECT * FROM contentEngine_content_types WHERE key = ?', [p.key]))[0];
    }

    case 'GET_CONTENT_TYPE':
      return normalizeSqlRows(await db.get('SELECT * FROM contentEngine_content_types WHERE key = ?', [p.key]))[0] || null;

    case 'LIST_CONTENT_TYPES':
      return normalizeSqlRows(await db.all('SELECT * FROM contentEngine_content_types ORDER BY label ASC'));

    case 'CREATE_CONTENT_ENTRY': {
      const insert = await db.run(`
        INSERT INTO contentEngine_content_entries
          (content_type_key, slug, permalink, status, title, language, parent_id, author_id,
           source_module, source_id, excerpt, content, meta, published_at, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
      `, [
        p.contentTypeKey,
        p.slug,
        p.permalink,
        p.status || 'draft',
        p.title,
        p.language || 'en',
        p.parentId || null,
        p.authorId || null,
        p.sourceModule || null,
        p.sourceId || null,
        p.excerpt || '',
        jsonString(p.content, {}),
        jsonString(p.meta, {}),
        p.publishedAt || null
      ]);
      const entryId = insert.lastID;
      const rev = await db.run(`
        INSERT INTO contentEngine_content_revisions
          (entry_id, version, status, title, excerpt, content, meta, author_id, created_at)
        VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP);
      `, [entryId, 1, p.status || 'draft', p.title, p.excerpt || '', jsonString(p.content, {}), jsonString(p.meta, {}), p.authorId || null]);
      await db.run('UPDATE contentEngine_content_entries SET current_revision_id = ? WHERE id = ?', [rev.lastID, entryId]);
      return { entryId, revisionId: rev.lastID, version: 1, slug: p.slug, permalink: p.permalink };
    }

    case 'UPDATE_CONTENT_ENTRY': {
      const current = await db.get('SELECT * FROM contentEngine_content_entries WHERE id = ?', [p.id]);
      if (!current) return null;
      const versionRow = await db.get('SELECT COALESCE(MAX(version), 0) + 1 AS version FROM contentEngine_content_revisions WHERE entry_id = ?', [p.id]);
      const version = versionRow?.version || 1;
      const rev = await db.run(`
        INSERT INTO contentEngine_content_revisions
          (entry_id, version, status, title, excerpt, content, meta, author_id, created_at)
        VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP);
      `, [p.id, version, p.status, p.title, p.excerpt || '', jsonString(p.content, {}), jsonString(p.meta, {}), p.authorId || null]);
      await db.run(`
        UPDATE contentEngine_content_entries
           SET content_type_key=?, slug=?, permalink=?, status=?, title=?, language=?, parent_id=?,
               author_id=?, source_module=?, source_id=?, excerpt=?, content=?, meta=?, current_revision_id=?, published_at=?,
               updated_at=CURRENT_TIMESTAMP
         WHERE id=?;
      `, [
        p.contentTypeKey,
        p.slug,
        p.permalink,
        p.status,
        p.title,
        p.language || 'en',
        p.parentId || null,
        p.authorId || null,
        p.sourceModule || null,
        p.sourceId || null,
        p.excerpt || '',
        jsonString(p.content, {}),
        jsonString(p.meta, {}),
        rev.lastID,
        p.publishedAt || null,
        p.id
      ]);
      return { entryId: p.id, revisionId: rev.lastID, version, slug: p.slug, permalink: p.permalink };
    }

    case 'GET_CONTENT_ENTRY':
      return normalizeSqlRows(await db.get('SELECT * FROM contentEngine_content_entries WHERE id = ? AND deleted_at IS NULL', [p.entryId]))[0] || null;

    case 'GET_CONTENT_ENTRY_BY_SOURCE':
      return normalizeSqlRows(await db.get(
        'SELECT * FROM contentEngine_content_entries WHERE source_module = ? AND source_id = ? AND deleted_at IS NULL',
        [p.sourceModule, String(p.sourceId)]
      ))[0] || null;

    case 'FIND_CONTENT_ENTRY_CONFLICT':
      return normalizeSqlRows(await db.get(`
        SELECT *
          FROM contentEngine_content_entries
         WHERE (
               permalink = ?
            OR (content_type_key = ? AND slug = ? AND language = ?)
         )
           AND (? IS NULL OR CAST(id AS TEXT) != CAST(? AS TEXT))
         ORDER BY CASE WHEN permalink = ? THEN 0 ELSE 1 END, updated_at DESC
         LIMIT 1;
      `, [
        p.permalink,
        p.contentTypeKey,
        p.slug,
        p.language || 'en',
        p.entryId || null,
        p.entryId || null,
        p.permalink
      ]))[0] || null;

    case 'RESOLVE_CONTENT_PERMALINK':
      return normalizeSqlRows(await db.get(
        'SELECT * FROM contentEngine_content_entries WHERE permalink = ? AND language = ? AND deleted_at IS NULL',
        [p.permalink, p.language || 'en']
      ))[0] || null;

    case 'LIST_CONTENT_ENTRIES': {
      const where = ['deleted_at IS NULL'];
      const values = [];
      if (p.contentTypeKey) {
        where.push('content_type_key = ?');
        values.push(p.contentTypeKey);
      }
      if (p.status) {
        where.push('status = ?');
        values.push(p.status);
      }
      if (p.language) {
        where.push('language = ?');
        values.push(p.language);
      }
      values.push(Number(p.limit) || 50, Number(p.offset) || 0);
      return normalizeSqlRows(await db.all(`
        SELECT * FROM contentEngine_content_entries
         WHERE ${where.join(' AND ')}
         ORDER BY updated_at DESC
         LIMIT ? OFFSET ?;
      `, values));
    }

    case 'LIST_TRASHED_CONTENT_ENTRIES': {
      const where = ['deleted_at IS NOT NULL'];
      const values = [];
      if (p.contentTypeKey) {
        where.push('content_type_key = ?');
        values.push(p.contentTypeKey);
      }
      if (p.language) {
        where.push('language = ?');
        values.push(p.language);
      }
      values.push(Number(p.limit) || 50, Number(p.offset) || 0);
      return normalizeSqlRows(await db.all(`
        SELECT * FROM contentEngine_content_entries
         WHERE ${where.join(' AND ')}
         ORDER BY deleted_at DESC, updated_at DESC
         LIMIT ? OFFSET ?;
      `, values));
    }

    case 'LIST_SCHEDULED_CONTENT_ENTRIES': {
      const where = ['deleted_at IS NULL', "status = 'scheduled'", 'published_at IS NOT NULL', 'published_at <= ?'];
      const values = [p.dueBefore || new Date().toISOString()];
      if (p.contentTypeKey) {
        where.push('content_type_key = ?');
        values.push(p.contentTypeKey);
      }
      if (p.language) {
        where.push('language = ?');
        values.push(p.language);
      }
      values.push(Number(p.limit) || 50, Number(p.offset) || 0);
      return normalizeSqlRows(await db.all(`
        SELECT * FROM contentEngine_content_entries
         WHERE ${where.join(' AND ')}
         ORDER BY published_at ASC, updated_at ASC
         LIMIT ? OFFSET ?;
      `, values));
    }

    case 'LIST_CONTENT_REVISIONS':
      return normalizeSqlRows(await db.all(
        'SELECT * FROM contentEngine_content_revisions WHERE entry_id = ? ORDER BY version DESC',
        [p.entryId]
      ));

    case 'GET_CONTENT_REVISION': {
      if (p.revisionId) {
        return normalizeSqlRows(await db.get(
          'SELECT * FROM contentEngine_content_revisions WHERE id = ?',
          [p.revisionId]
        ))[0] || null;
      }
      return normalizeSqlRows(await db.get(
        'SELECT * FROM contentEngine_content_revisions WHERE entry_id = ? AND version = ?',
        [p.entryId, p.version]
      ))[0] || null;
    }

    case 'RESTORE_CONTENT_REVISION': {
      const revision = p.revisionId
        ? await db.get('SELECT * FROM contentEngine_content_revisions WHERE id = ?', [p.revisionId])
        : await db.get('SELECT * FROM contentEngine_content_revisions WHERE entry_id = ? AND version = ?', [p.entryId, p.version]);
      if (!revision) return null;
      const entry = await db.get('SELECT * FROM contentEngine_content_entries WHERE id = ?', [revision.entry_id]);
      if (!entry) return null;
      const versionRow = await db.get('SELECT COALESCE(MAX(version), 0) + 1 AS version FROM contentEngine_content_revisions WHERE entry_id = ?', [revision.entry_id]);
      const restoredVersion = versionRow?.version || 1;
      const rev = await db.run(`
        INSERT INTO contentEngine_content_revisions
          (entry_id, version, status, title, excerpt, content, meta, author_id, created_at)
        VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP);
      `, [
        revision.entry_id,
        restoredVersion,
        revision.status,
        revision.title,
        revision.excerpt || '',
        revision.content || '{}',
        revision.meta || '{}',
        p.authorId || revision.author_id || null
      ]);
      await db.run(`
        UPDATE contentEngine_content_entries
           SET status=?, title=?, excerpt=?, content=?, meta=?, current_revision_id=?,
               author_id=COALESCE(?, author_id), updated_at=CURRENT_TIMESTAMP
         WHERE id=?;
      `, [
        revision.status,
        revision.title,
        revision.excerpt || '',
        revision.content || '{}',
        revision.meta || '{}',
        rev.lastID,
        p.authorId || null,
        revision.entry_id
      ]);
      return {
        entryId: revision.entry_id,
        revisionId: rev.lastID,
        version: restoredVersion,
        restoredFromRevisionId: revision.id,
        restoredFromVersion: revision.version
      };
    }

    case 'TRASH_CONTENT_ENTRY':
      await db.run(`
        UPDATE contentEngine_content_entries
           SET status = 'deleted',
               deleted_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND deleted_at IS NULL;
      `, [p.entryId]);
      return normalizeSqlRows(await db.get('SELECT * FROM contentEngine_content_entries WHERE id = ?', [p.entryId]))[0] || null;

    case 'RESTORE_CONTENT_ENTRY':
      await db.run(`
        UPDATE contentEngine_content_entries
           SET status = ?,
               deleted_at = NULL,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?;
      `, [p.status || 'draft', p.entryId]);
      return normalizeSqlRows(await db.get('SELECT * FROM contentEngine_content_entries WHERE id = ?', [p.entryId]))[0] || null;

    default:
      return null;
  }
}

async function handleContentEnginePostgres(client, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_CONTENT_ENGINE_SCHEMA':
      await client.query('CREATE SCHEMA IF NOT EXISTS contentengine;');
      return { done: true };

    case 'INIT_CONTENT_ENGINE_TABLES':
      await client.query(`
        CREATE TABLE IF NOT EXISTS contentengine.content_types (
          id SERIAL PRIMARY KEY,
          key TEXT NOT NULL UNIQUE,
          label TEXT NOT NULL,
          description TEXT DEFAULT '',
          icon TEXT DEFAULT '',
          fields JSONB DEFAULT '[]'::jsonb,
          settings JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS contentengine.content_entries (
          id SERIAL PRIMARY KEY,
          content_type_key TEXT NOT NULL,
          slug TEXT NOT NULL,
          permalink TEXT NOT NULL UNIQUE,
          status TEXT DEFAULT 'draft',
          title TEXT NOT NULL,
          language TEXT DEFAULT 'en',
          parent_id INT,
          source_module TEXT,
          source_id TEXT,
          author_id TEXT,
          excerpt TEXT DEFAULT '',
          content JSONB DEFAULT '{}'::jsonb,
          meta JSONB DEFAULT '{}'::jsonb,
          current_revision_id INT,
          published_at TIMESTAMP,
          deleted_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(content_type_key, slug, language)
        );

        CREATE TABLE IF NOT EXISTS contentengine.content_revisions (
          id SERIAL PRIMARY KEY,
          entry_id INT NOT NULL REFERENCES contentengine.content_entries(id) ON DELETE CASCADE,
          version INT NOT NULL,
          status TEXT,
          title TEXT,
          excerpt TEXT,
          content JSONB DEFAULT '{}'::jsonb,
          meta JSONB DEFAULT '{}'::jsonb,
          author_id TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(entry_id, version)
        );

      `);
      await client.query('CREATE INDEX IF NOT EXISTS content_entries_type_status ON contentengine.content_entries(content_type_key, status, updated_at DESC);');
      await client.query('CREATE INDEX IF NOT EXISTS content_entries_permalink_language ON contentengine.content_entries(permalink, language);');
      await client.query('ALTER TABLE contentengine.content_entries ADD COLUMN IF NOT EXISTS source_module TEXT;');
      await client.query('ALTER TABLE contentengine.content_entries ADD COLUMN IF NOT EXISTS source_id TEXT;');
      await client.query('CREATE UNIQUE INDEX IF NOT EXISTS content_entries_source_unique ON contentengine.content_entries(source_module, source_id);');
      await client.query('CREATE INDEX IF NOT EXISTS content_revisions_entry_version ON contentengine.content_revisions(entry_id, version DESC);');
      return { done: true };

    case 'UPSERT_CONTENT_TYPE': {
      const { rows } = await client.query(`
        INSERT INTO contentengine.content_types(key, label, description, icon, fields, settings, created_at, updated_at)
        VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,NOW(),NOW())
        ON CONFLICT(key) DO UPDATE SET
          label=EXCLUDED.label,
          description=EXCLUDED.description,
          icon=EXCLUDED.icon,
          fields=EXCLUDED.fields,
          settings=EXCLUDED.settings,
          updated_at=NOW()
        RETURNING *;
      `, [p.key, p.label, p.description || '', p.icon || '', jsonString(p.fields, []), jsonString(p.settings, {})]);
      return rows[0];
    }

    case 'GET_CONTENT_TYPE': {
      const { rows } = await client.query('SELECT * FROM contentengine.content_types WHERE key = $1', [p.key]);
      return rows[0] || null;
    }

    case 'LIST_CONTENT_TYPES': {
      const { rows } = await client.query('SELECT * FROM contentengine.content_types ORDER BY label ASC');
      return rows;
    }

    case 'CREATE_CONTENT_ENTRY': {
      const { rows } = await client.query(`
        INSERT INTO contentengine.content_entries
          (content_type_key, slug, permalink, status, title, language, parent_id, author_id,
           source_module, source_id, excerpt, content, meta, published_at, created_at, updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,NOW(),NOW())
        RETURNING id;
      `, [p.contentTypeKey, p.slug, p.permalink, p.status || 'draft', p.title, p.language || 'en', p.parentId || null, p.authorId || null, p.sourceModule || null, p.sourceId || null, p.excerpt || '', jsonString(p.content, {}), jsonString(p.meta, {}), p.publishedAt || null]);
      const entryId = rows[0].id;
      const rev = await client.query(`
        INSERT INTO contentengine.content_revisions
          (entry_id, version, status, title, excerpt, content, meta, author_id, created_at)
        VALUES($1,1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,NOW())
        RETURNING id;
      `, [entryId, p.status || 'draft', p.title, p.excerpt || '', jsonString(p.content, {}), jsonString(p.meta, {}), p.authorId || null]);
      await client.query('UPDATE contentengine.content_entries SET current_revision_id = $1 WHERE id = $2', [rev.rows[0].id, entryId]);
      return { entryId, revisionId: rev.rows[0].id, version: 1, slug: p.slug, permalink: p.permalink };
    }

    case 'UPDATE_CONTENT_ENTRY': {
      const current = await client.query('SELECT * FROM contentengine.content_entries WHERE id = $1', [p.id]);
      if (!current.rows[0]) return null;
      const versionResult = await client.query('SELECT COALESCE(MAX(version), 0) + 1 AS version FROM contentengine.content_revisions WHERE entry_id = $1', [p.id]);
      const version = versionResult.rows[0].version;
      const rev = await client.query(`
        INSERT INTO contentengine.content_revisions
          (entry_id, version, status, title, excerpt, content, meta, author_id, created_at)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,NOW())
        RETURNING id;
      `, [p.id, version, p.status, p.title, p.excerpt || '', jsonString(p.content, {}), jsonString(p.meta, {}), p.authorId || null]);
      await client.query(`
        UPDATE contentengine.content_entries
           SET content_type_key=$1, slug=$2, permalink=$3, status=$4, title=$5, language=$6,
               parent_id=$7, author_id=$8, source_module=$9, source_id=$10,
               excerpt=$11, content=$12::jsonb, meta=$13::jsonb,
               current_revision_id=$14, published_at=$15, updated_at=NOW()
         WHERE id=$16;
      `, [p.contentTypeKey, p.slug, p.permalink, p.status, p.title, p.language || 'en', p.parentId || null, p.authorId || null, p.sourceModule || null, p.sourceId || null, p.excerpt || '', jsonString(p.content, {}), jsonString(p.meta, {}), rev.rows[0].id, p.publishedAt || null, p.id]);
      return { entryId: p.id, revisionId: rev.rows[0].id, version, slug: p.slug, permalink: p.permalink };
    }

    case 'GET_CONTENT_ENTRY': {
      const { rows } = await client.query('SELECT * FROM contentengine.content_entries WHERE id = $1 AND deleted_at IS NULL', [p.entryId]);
      return rows[0] || null;
    }

    case 'GET_CONTENT_ENTRY_BY_SOURCE': {
      const { rows } = await client.query(
        'SELECT * FROM contentengine.content_entries WHERE source_module = $1 AND source_id = $2 AND deleted_at IS NULL',
        [p.sourceModule, String(p.sourceId)]
      );
      return rows[0] || null;
    }

    case 'FIND_CONTENT_ENTRY_CONFLICT': {
      const { rows } = await client.query(`
        SELECT *
          FROM contentengine.content_entries
         WHERE (
               permalink = $1
            OR (content_type_key = $2 AND slug = $3 AND language = $4)
         )
           AND ($5::text IS NULL OR id::text != $5::text)
         ORDER BY CASE WHEN permalink = $1 THEN 0 ELSE 1 END, updated_at DESC
         LIMIT 1;
      `, [p.permalink, p.contentTypeKey, p.slug, p.language || 'en', p.entryId || null]);
      return rows[0] || null;
    }

    case 'RESOLVE_CONTENT_PERMALINK': {
      const { rows } = await client.query(
        'SELECT * FROM contentengine.content_entries WHERE permalink = $1 AND language = $2 AND deleted_at IS NULL',
        [p.permalink, p.language || 'en']
      );
      return rows[0] || null;
    }

    case 'LIST_CONTENT_ENTRIES': {
      const where = ['deleted_at IS NULL'];
      const values = [];
      let idx = 1;
      if (p.contentTypeKey) {
        where.push(`content_type_key = $${idx++}`);
        values.push(p.contentTypeKey);
      }
      if (p.status) {
        where.push(`status = $${idx++}`);
        values.push(p.status);
      }
      if (p.language) {
        where.push(`language = $${idx++}`);
        values.push(p.language);
      }
      values.push(Number(p.limit) || 50, Number(p.offset) || 0);
      const { rows } = await client.query(`
        SELECT * FROM contentengine.content_entries
         WHERE ${where.join(' AND ')}
         ORDER BY updated_at DESC
         LIMIT $${idx++} OFFSET $${idx};
      `, values);
      return rows;
    }

    case 'LIST_TRASHED_CONTENT_ENTRIES': {
      const where = ['deleted_at IS NOT NULL'];
      const values = [];
      let idx = 1;
      if (p.contentTypeKey) {
        where.push(`content_type_key = $${idx++}`);
        values.push(p.contentTypeKey);
      }
      if (p.language) {
        where.push(`language = $${idx++}`);
        values.push(p.language);
      }
      values.push(Number(p.limit) || 50, Number(p.offset) || 0);
      const { rows } = await client.query(`
        SELECT * FROM contentengine.content_entries
         WHERE ${where.join(' AND ')}
         ORDER BY deleted_at DESC, updated_at DESC
         LIMIT $${idx++} OFFSET $${idx};
      `, values);
      return rows;
    }

    case 'LIST_SCHEDULED_CONTENT_ENTRIES': {
      const where = ['deleted_at IS NULL', "status = 'scheduled'", 'published_at IS NOT NULL'];
      const values = [p.dueBefore || new Date().toISOString()];
      let idx = 2;
      where.push('published_at <= $1');
      if (p.contentTypeKey) {
        where.push(`content_type_key = $${idx++}`);
        values.push(p.contentTypeKey);
      }
      if (p.language) {
        where.push(`language = $${idx++}`);
        values.push(p.language);
      }
      values.push(Number(p.limit) || 50, Number(p.offset) || 0);
      const { rows } = await client.query(`
        SELECT * FROM contentengine.content_entries
         WHERE ${where.join(' AND ')}
         ORDER BY published_at ASC, updated_at ASC
         LIMIT $${idx++} OFFSET $${idx};
      `, values);
      return rows;
    }

    case 'LIST_CONTENT_REVISIONS': {
      const { rows } = await client.query(
        'SELECT * FROM contentengine.content_revisions WHERE entry_id = $1 ORDER BY version DESC',
        [p.entryId]
      );
      return rows;
    }

    case 'GET_CONTENT_REVISION': {
      const { rows } = p.revisionId
        ? await client.query('SELECT * FROM contentengine.content_revisions WHERE id = $1', [p.revisionId])
        : await client.query('SELECT * FROM contentengine.content_revisions WHERE entry_id = $1 AND version = $2', [p.entryId, p.version]);
      return normalizeSqlRows(rows)[0] || null;
    }

    case 'RESTORE_CONTENT_REVISION': {
      const revisionResult = p.revisionId
        ? await client.query('SELECT * FROM contentengine.content_revisions WHERE id = $1', [p.revisionId])
        : await client.query('SELECT * FROM contentengine.content_revisions WHERE entry_id = $1 AND version = $2', [p.entryId, p.version]);
      const revision = revisionResult.rows[0];
      if (!revision) return null;
      const entryResult = await client.query('SELECT * FROM contentengine.content_entries WHERE id = $1', [revision.entry_id]);
      if (!entryResult.rows[0]) return null;
      const versionResult = await client.query('SELECT COALESCE(MAX(version), 0) + 1 AS version FROM contentengine.content_revisions WHERE entry_id = $1', [revision.entry_id]);
      const restoredVersion = versionResult.rows[0]?.version || 1;
      const rev = await client.query(`
        INSERT INTO contentengine.content_revisions
          (entry_id, version, status, title, excerpt, content, meta, author_id, created_at)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,NOW())
        RETURNING id;
      `, [
        revision.entry_id,
        restoredVersion,
        revision.status,
        revision.title,
        revision.excerpt || '',
        jsonString(revision.content, {}),
        jsonString(revision.meta, {}),
        p.authorId || revision.author_id || null
      ]);
      await client.query(`
        UPDATE contentengine.content_entries
           SET status=$1, title=$2, excerpt=$3, content=$4::jsonb, meta=$5::jsonb,
               current_revision_id=$6, author_id=COALESCE($7, author_id), updated_at=NOW()
         WHERE id=$8;
      `, [
        revision.status,
        revision.title,
        revision.excerpt || '',
        jsonString(revision.content, {}),
        jsonString(revision.meta, {}),
        rev.rows[0].id,
        p.authorId || null,
        revision.entry_id
      ]);
      return {
        entryId: revision.entry_id,
        revisionId: rev.rows[0].id,
        version: restoredVersion,
        restoredFromRevisionId: revision.id,
        restoredFromVersion: revision.version
      };
    }

    case 'TRASH_CONTENT_ENTRY': {
      const { rows } = await client.query(`
        UPDATE contentengine.content_entries
           SET status='deleted', deleted_at=NOW(), updated_at=NOW()
         WHERE id=$1 AND deleted_at IS NULL
         RETURNING *;
      `, [p.entryId]);
      return normalizeSqlRows(rows)[0] || null;
    }

    case 'RESTORE_CONTENT_ENTRY': {
      const { rows } = await client.query(`
        UPDATE contentengine.content_entries
           SET status=$1, deleted_at=NULL, updated_at=NOW()
         WHERE id=$2
         RETURNING *;
      `, [p.status || 'draft', p.entryId]);
      return normalizeSqlRows(rows)[0] || null;
    }

    default:
      return null;
  }
}

async function handleContentEngineMongo(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_CONTENT_ENGINE_SCHEMA':
      return { done: true };

    case 'INIT_CONTENT_ENGINE_TABLES':
      await db.createCollection('content_types').catch(() => {});
      await db.createCollection('content_entries').catch(() => {});
      await db.createCollection('content_revisions').catch(() => {});
      await db.collection('content_types').createIndex({ key: 1 }, { unique: true }).catch(() => {});
      await db.collection('content_entries').createIndex({ permalink: 1 }, { unique: true }).catch(() => {});
      await db.collection('content_entries').createIndex({ content_type_key: 1, slug: 1, language: 1 }, { unique: true }).catch(() => {});
      await db.collection('content_entries').createIndex(
        { source_module: 1, source_id: 1 },
        {
          unique: true,
          name: 'content_entries_source_unique',
          partialFilterExpression: {
            source_module: { $type: 'string' },
            source_id: { $type: 'string' }
          }
        }
      ).catch(() => {});
      await db.collection('content_entries').createIndex({ content_type_key: 1, status: 1, updated_at: -1 }).catch(() => {});
      await db.collection('content_revisions').createIndex({ entry_id: 1, version: -1 }, { unique: true }).catch(() => {});
      return { done: true };

    case 'UPSERT_CONTENT_TYPE':
      await db.collection('content_types').updateOne(
        { key: p.key },
        {
          $set: {
            key: p.key,
            label: p.label,
            description: p.description || '',
            icon: p.icon || '',
            fields: p.fields || [],
            settings: p.settings || {},
            updated_at: new Date()
          },
          $setOnInsert: { created_at: new Date() }
        },
        { upsert: true }
      );
      return mongoDoc(await db.collection('content_types').findOne({ key: p.key }));

    case 'GET_CONTENT_TYPE':
      return mongoDoc(await db.collection('content_types').findOne({ key: p.key }));

    case 'LIST_CONTENT_TYPES':
      return (await db.collection('content_types').find({}).sort({ label: 1 }).toArray()).map(mongoDoc);

    case 'CREATE_CONTENT_ENTRY': {
      const entryId = new ObjectId();
      const now = new Date();
      const entry = {
        _id: entryId,
        id: entryId.toHexString(),
        content_type_key: p.contentTypeKey,
        slug: p.slug,
        permalink: p.permalink,
        status: p.status || 'draft',
        title: p.title,
        language: p.language || 'en',
        parent_id: p.parentId || null,
        source_module: p.sourceModule || null,
        source_id: p.sourceId || null,
        author_id: p.authorId || null,
        excerpt: p.excerpt || '',
        content: p.content || {},
        meta: p.meta || {},
        published_at: p.publishedAt || null,
        deleted_at: null,
        created_at: now,
        updated_at: now
      };
      await db.collection('content_entries').insertOne(entry);
      const revId = new ObjectId();
      await db.collection('content_revisions').insertOne({
        _id: revId,
        id: revId.toHexString(),
        entry_id: entry.id,
        version: 1,
        status: entry.status,
        title: entry.title,
        excerpt: entry.excerpt,
        content: entry.content,
        meta: entry.meta,
        author_id: entry.author_id,
        created_at: now
      });
      await db.collection('content_entries').updateOne({ _id: entryId }, { $set: { current_revision_id: revId.toHexString() } });
      return { entryId: entry.id, revisionId: revId.toHexString(), version: 1, slug: p.slug, permalink: p.permalink };
    }

    case 'UPDATE_CONTENT_ENTRY': {
      const current = await db.collection('content_entries').findOne(mongoEntryQuery(p.id));
      if (!current) return null;
      const last = await db.collection('content_revisions').find({ entry_id: current.id }).sort({ version: -1 }).limit(1).toArray();
      const version = (last[0]?.version || 0) + 1;
      const revId = new ObjectId();
      const now = new Date();
      await db.collection('content_revisions').insertOne({
        _id: revId,
        id: revId.toHexString(),
        entry_id: current.id,
        version,
        status: p.status,
        title: p.title,
        excerpt: p.excerpt || '',
        content: p.content || {},
        meta: p.meta || {},
        author_id: p.authorId || null,
        created_at: now
      });
      await db.collection('content_entries').updateOne(mongoEntryQuery(p.id), {
        $set: {
          content_type_key: p.contentTypeKey,
          slug: p.slug,
          permalink: p.permalink,
          status: p.status,
          title: p.title,
          language: p.language || 'en',
          parent_id: p.parentId || null,
          source_module: p.sourceModule || null,
          source_id: p.sourceId || null,
          author_id: p.authorId || null,
          excerpt: p.excerpt || '',
          content: p.content || {},
          meta: p.meta || {},
          current_revision_id: revId.toHexString(),
          published_at: p.publishedAt || null,
          updated_at: now
        }
      });
      return { entryId: current.id, revisionId: revId.toHexString(), version, slug: p.slug, permalink: p.permalink };
    }

    case 'GET_CONTENT_ENTRY':
      return mongoDoc(await db.collection('content_entries').findOne({ ...mongoEntryQuery(p.entryId), deleted_at: null }));

    case 'GET_CONTENT_ENTRY_BY_SOURCE':
      return mongoDoc(await db.collection('content_entries').findOne({
        source_module: p.sourceModule,
        source_id: String(p.sourceId),
        deleted_at: null
      }));

    case 'FIND_CONTENT_ENTRY_CONFLICT': {
      const clauses = [
        { permalink: p.permalink },
        {
          content_type_key: p.contentTypeKey,
          slug: p.slug,
          language: p.language || 'en'
        }
      ];
      const excludeValues = mongoIdValues(p.entryId);
      const objectIds = excludeValues.filter(value => value instanceof ObjectId);
      const scalarIds = excludeValues.filter(value => !(value instanceof ObjectId)).map(String);
      const exclude = [];
      if (objectIds.length) exclude.push({ _id: { $in: objectIds } });
      if (scalarIds.length) exclude.push({ id: { $in: scalarIds } });
      const query = exclude.length
        ? { $and: [{ $or: clauses }, { $nor: exclude }] }
        : { $or: clauses };
      return mongoDoc(await db.collection('content_entries').findOne(query, {
        sort: { updated_at: -1 }
      }));
    }

    case 'RESOLVE_CONTENT_PERMALINK':
      return mongoDoc(await db.collection('content_entries').findOne({
        permalink: p.permalink,
        language: p.language || 'en',
        deleted_at: null
      }));

    case 'LIST_CONTENT_ENTRIES': {
      const query = { deleted_at: null };
      if (p.contentTypeKey) query.content_type_key = p.contentTypeKey;
      if (p.status) query.status = p.status;
      if (p.language) query.language = p.language;
      return (await db.collection('content_entries')
        .find(query)
        .sort({ updated_at: -1 })
        .skip(Number(p.offset) || 0)
        .limit(Number(p.limit) || 50)
        .toArray()).map(mongoDoc);
    }

    case 'LIST_TRASHED_CONTENT_ENTRIES': {
      const query = { deleted_at: { $ne: null } };
      if (p.contentTypeKey) query.content_type_key = p.contentTypeKey;
      if (p.language) query.language = p.language;
      return (await db.collection('content_entries')
        .find(query)
        .sort({ deleted_at: -1, updated_at: -1 })
        .skip(Number(p.offset) || 0)
        .limit(Number(p.limit) || 50)
        .toArray()).map(mongoDoc);
    }

    case 'LIST_SCHEDULED_CONTENT_ENTRIES': {
      const query = {
        deleted_at: null,
        status: 'scheduled',
        published_at: { $ne: null, $lte: p.dueBefore || new Date().toISOString() }
      };
      if (p.contentTypeKey) query.content_type_key = p.contentTypeKey;
      if (p.language) query.language = p.language;
      return (await db.collection('content_entries')
        .find(query)
        .sort({ published_at: 1, updated_at: 1 })
        .skip(Number(p.offset) || 0)
        .limit(Number(p.limit) || 50)
        .toArray()).map(mongoDoc);
    }

    case 'LIST_CONTENT_REVISIONS': {
      const entry = await db.collection('content_entries').findOne(mongoEntryQuery(p.entryId));
      if (!entry) return [];
      return (await db.collection('content_revisions').find({ entry_id: entry.id }).sort({ version: -1 }).toArray()).map(mongoDoc);
    }

    case 'GET_CONTENT_REVISION': {
      if (p.revisionId) {
        return mongoDoc(await db.collection('content_revisions').findOne(mongoEntryQuery(p.revisionId)));
      }
      const entry = await db.collection('content_entries').findOne(mongoEntryQuery(p.entryId));
      if (!entry) return null;
      return mongoDoc(await db.collection('content_revisions').findOne({ entry_id: entry.id, version: Number(p.version) }));
    }

    case 'RESTORE_CONTENT_REVISION': {
      const revision = p.revisionId
        ? await db.collection('content_revisions').findOne(mongoEntryQuery(p.revisionId))
        : await (async () => {
            const entry = await db.collection('content_entries').findOne(mongoEntryQuery(p.entryId));
            if (!entry) return null;
            return db.collection('content_revisions').findOne({ entry_id: entry.id, version: Number(p.version) });
          })();
      if (!revision) return null;
      const entry = await db.collection('content_entries').findOne({ id: String(revision.entry_id) });
      if (!entry) return null;
      const last = await db.collection('content_revisions').find({ entry_id: entry.id }).sort({ version: -1 }).limit(1).toArray();
      const restoredVersion = (last[0]?.version || 0) + 1;
      const revId = new ObjectId();
      const now = new Date();
      await db.collection('content_revisions').insertOne({
        _id: revId,
        id: revId.toHexString(),
        entry_id: entry.id,
        version: restoredVersion,
        status: revision.status,
        title: revision.title,
        excerpt: revision.excerpt || '',
        content: revision.content || {},
        meta: revision.meta || {},
        author_id: p.authorId || revision.author_id || null,
        created_at: now
      });
      await db.collection('content_entries').updateOne({ id: entry.id }, {
        $set: {
          status: revision.status,
          title: revision.title,
          excerpt: revision.excerpt || '',
          content: revision.content || {},
          meta: revision.meta || {},
          current_revision_id: revId.toHexString(),
          author_id: p.authorId || entry.author_id || null,
          updated_at: now
        }
      });
      return {
        entryId: entry.id,
        revisionId: revId.toHexString(),
        version: restoredVersion,
        restoredFromRevisionId: revision.id,
        restoredFromVersion: revision.version
      };
    }

    case 'TRASH_CONTENT_ENTRY':
      await db.collection('content_entries').updateOne(
        { ...mongoEntryQuery(p.entryId), deleted_at: null },
        { $set: { status: 'deleted', deleted_at: new Date(), updated_at: new Date() } }
      );
      return mongoDoc(await db.collection('content_entries').findOne(mongoEntryQuery(p.entryId)));

    case 'RESTORE_CONTENT_ENTRY':
      await db.collection('content_entries').updateOne(
        mongoEntryQuery(p.entryId),
        { $set: { status: p.status || 'draft', deleted_at: null, updated_at: new Date() } }
      );
      return mongoDoc(await db.collection('content_entries').findOne(mongoEntryQuery(p.entryId)));

    default:
      return null;
  }
}

module.exports = {
  handleContentEngineMongo,
  handleContentEnginePostgres,
  handleContentEngineSqlite,
  isContentEnginePlaceholder
};
