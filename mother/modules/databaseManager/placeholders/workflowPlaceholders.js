'use strict';

const { ObjectId } = require('mongodb');

const WORKFLOW_PLACEHOLDERS = new Set([
  'INIT_WORKFLOW_SCHEMA',
  'INIT_WORKFLOW_TABLES',
  'ACQUIRE_CONTENT_LOCK',
  'REFRESH_CONTENT_LOCK',
  'RELEASE_CONTENT_LOCK',
  'GET_CONTENT_LOCK',
  'UPSERT_CONTENT_AUTOSAVE',
  'GET_CONTENT_AUTOSAVE',
  'LIST_CONTENT_AUTOSAVES',
  'DELETE_CONTENT_AUTOSAVE',
  'UPSERT_CONTENT_REVIEW',
  'UPDATE_CONTENT_REVIEW_STATUS',
  'GET_CONTENT_REVIEW',
  'LIST_CONTENT_REVIEWS'
]);

function isWorkflowPlaceholder(operation) {
  return WORKFLOW_PLACEHOLDERS.has(operation);
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

function normalizeLockRows(rows) {
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map(row => ({
    ...row,
    targetType: row.target_type,
    targetId: row.target_id,
    ownerId: row.owner_id,
    ownerName: row.owner_name,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    locked: typeof row.locked === 'undefined' ? true : row.locked === true || row.locked === 1,
    meta: parseJson(row.meta, {})
  }));
}

function normalizeAutosaveRows(rows) {
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map(row => ({
    ...row,
    targetType: row.target_type,
    targetId: row.target_id,
    authorId: row.author_id,
    baseRevisionId: row.base_revision_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    content: parseJson(row.content, {}),
    meta: parseJson(row.meta, {})
  }));
}

function normalizeReviewRows(rows) {
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map(row => ({
    ...row,
    targetType: row.target_type,
    targetId: row.target_id,
    submittedBy: row.submitted_by,
    reviewerId: row.reviewer_id,
    resolutionNote: row.resolution_note,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    meta: parseJson(row.meta, {})
  }));
}

function mongoDoc(doc, type) {
  if (!doc) return null;
  const id = doc.id || (doc._id ? String(doc._id) : undefined);
  const out = { ...doc, id };
  delete out._id;
  out.targetType = out.target_type;
  out.targetId = out.target_id;
  out.createdAt = out.created_at;
  out.updatedAt = out.updated_at;
  if (type === 'lock') {
    out.ownerId = out.owner_id;
    out.ownerName = out.owner_name;
    out.expiresAt = out.expires_at;
    out.locked = typeof out.locked === 'undefined' ? true : out.locked;
  }
  if (type === 'autosave') {
    out.authorId = out.author_id;
    out.baseRevisionId = out.base_revision_id;
  }
  if (type === 'review') {
    out.submittedBy = out.submitted_by;
    out.reviewerId = out.reviewer_id;
    out.resolutionNote = out.resolution_note;
    out.resolvedAt = out.resolved_at;
  }
  return out;
}

function isActiveLock(row, now) {
  if (!row) return false;
  return new Date(row.expires_at || row.expiresAt || 0).getTime() > new Date(now).getTime();
}

async function handleWorkflowSqlite(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_WORKFLOW_SCHEMA':
      return { done: true };

    case 'INIT_WORKFLOW_TABLES':
      await db.exec(`
        CREATE TABLE IF NOT EXISTS workflowManager_content_locks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          owner_name TEXT DEFAULT '',
          token TEXT DEFAULT '',
          expires_at DATETIME NOT NULL,
          meta TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(target_type, target_id)
        );

        CREATE TABLE IF NOT EXISTS workflowManager_content_autosaves (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          author_id TEXT NOT NULL,
          title TEXT DEFAULT '',
          excerpt TEXT DEFAULT '',
          content TEXT DEFAULT '{}',
          meta TEXT DEFAULT '{}',
          base_revision_id TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(target_type, target_id, author_id)
        );

        CREATE TABLE IF NOT EXISTS workflowManager_content_reviews (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          submitted_by TEXT NOT NULL,
          reviewer_id TEXT,
          note TEXT DEFAULT '',
          resolution_note TEXT DEFAULT '',
          resolved_at DATETIME,
          meta TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await db.run('CREATE INDEX IF NOT EXISTS workflow_locks_target ON workflowManager_content_locks(target_type, target_id, expires_at);');
      await db.run('CREATE INDEX IF NOT EXISTS workflow_autosaves_target ON workflowManager_content_autosaves(target_type, target_id, updated_at DESC);');
      await db.run('CREATE INDEX IF NOT EXISTS workflow_reviews_status ON workflowManager_content_reviews(status, target_type, target_id, updated_at DESC);');
      return { done: true };

    case 'ACQUIRE_CONTENT_LOCK': {
      const existing = await db.get(
        'SELECT * FROM workflowManager_content_locks WHERE target_type = ? AND target_id = ?',
        [p.targetType, String(p.targetId)]
      );
      if (existing && isActiveLock(existing, p.now) && existing.owner_id !== String(p.ownerId) && !p.force) {
        return { ...normalizeLockRows(existing)[0], locked: false };
      }
      await db.run(`
        INSERT INTO workflowManager_content_locks
          (target_type, target_id, owner_id, owner_name, token, expires_at, meta, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(target_type, target_id) DO UPDATE SET
          owner_id=excluded.owner_id,
          owner_name=excluded.owner_name,
          token=excluded.token,
          expires_at=excluded.expires_at,
          meta=excluded.meta,
          updated_at=CURRENT_TIMESTAMP;
      `, [p.targetType, String(p.targetId), String(p.ownerId), p.ownerName || '', p.token || '', p.expiresAt, jsonString(p.meta, {})]);
      return { ...normalizeLockRows(await db.get(
        'SELECT * FROM workflowManager_content_locks WHERE target_type = ? AND target_id = ?',
        [p.targetType, String(p.targetId)]
      ))[0], locked: true };
    }

    case 'REFRESH_CONTENT_LOCK': {
      const existing = await db.get(
        'SELECT * FROM workflowManager_content_locks WHERE target_type = ? AND target_id = ?',
        [p.targetType, String(p.targetId)]
      );
      if (existing && existing.owner_id !== String(p.ownerId) && !p.force) {
        return { ...normalizeLockRows(existing)[0], locked: false };
      }
      await db.run(`
        UPDATE workflowManager_content_locks
           SET owner_id = ?, owner_name = ?, token = ?, expires_at = ?, meta = ?, updated_at = CURRENT_TIMESTAMP
         WHERE target_type = ? AND target_id = ?;
      `, [String(p.ownerId), p.ownerName || '', p.token || '', p.expiresAt, jsonString(p.meta, {}), p.targetType, String(p.targetId)]);
      return { ...normalizeLockRows(await db.get(
        'SELECT * FROM workflowManager_content_locks WHERE target_type = ? AND target_id = ?',
        [p.targetType, String(p.targetId)]
      ))[0], locked: true };
    }

    case 'RELEASE_CONTENT_LOCK': {
      const values = [p.targetType, String(p.targetId)];
      let ownerClause = '';
      if (!p.force && p.ownerId) {
        ownerClause = ' AND owner_id = ?';
        values.push(String(p.ownerId));
      }
      await db.run(`DELETE FROM workflowManager_content_locks WHERE target_type = ? AND target_id = ?${ownerClause}`, values);
      return { done: true };
    }

    case 'GET_CONTENT_LOCK':
      return normalizeLockRows(await db.get(`
        SELECT * FROM workflowManager_content_locks
         WHERE target_type = ? AND target_id = ? AND expires_at > ?
      `, [p.targetType, String(p.targetId), p.now]))[0] || null;

    case 'UPSERT_CONTENT_AUTOSAVE':
      await db.run(`
        INSERT INTO workflowManager_content_autosaves
          (target_type, target_id, author_id, title, excerpt, content, meta, base_revision_id, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(target_type, target_id, author_id) DO UPDATE SET
          title=excluded.title,
          excerpt=excluded.excerpt,
          content=excluded.content,
          meta=excluded.meta,
          base_revision_id=excluded.base_revision_id,
          updated_at=CURRENT_TIMESTAMP;
      `, [p.targetType, String(p.targetId), String(p.authorId), p.title || '', p.excerpt || '', jsonString(p.content, {}), jsonString(p.meta, {}), p.baseRevisionId || null]);
      return normalizeAutosaveRows(await db.get(`
        SELECT * FROM workflowManager_content_autosaves
         WHERE target_type = ? AND target_id = ? AND author_id = ?
      `, [p.targetType, String(p.targetId), String(p.authorId)]))[0] || null;

    case 'GET_CONTENT_AUTOSAVE': {
      if (p.id) {
        return normalizeAutosaveRows(await db.get('SELECT * FROM workflowManager_content_autosaves WHERE id = ?', [p.id]))[0] || null;
      }
      const values = [p.targetType, String(p.targetId)];
      let authorClause = '';
      if (p.authorId) {
        authorClause = ' AND author_id = ?';
        values.push(String(p.authorId));
      }
      return normalizeAutosaveRows(await db.get(`
        SELECT * FROM workflowManager_content_autosaves
         WHERE target_type = ? AND target_id = ?${authorClause}
         ORDER BY updated_at DESC, id DESC
         LIMIT 1;
      `, values))[0] || null;
    }

    case 'LIST_CONTENT_AUTOSAVES': {
      const values = [p.targetType, String(p.targetId)];
      let authorClause = '';
      if (p.authorId) {
        authorClause = ' AND author_id = ?';
        values.push(String(p.authorId));
      }
      values.push(Number(p.limit) || 20, Number(p.offset) || 0);
      return normalizeAutosaveRows(await db.all(`
        SELECT * FROM workflowManager_content_autosaves
         WHERE target_type = ? AND target_id = ?${authorClause}
         ORDER BY updated_at DESC, id DESC
         LIMIT ? OFFSET ?;
      `, values));
    }

    case 'DELETE_CONTENT_AUTOSAVE':
      if (p.id) {
        await db.run('DELETE FROM workflowManager_content_autosaves WHERE id = ?', [p.id]);
      } else {
        await db.run(
          'DELETE FROM workflowManager_content_autosaves WHERE target_type = ? AND target_id = ? AND author_id = ?',
          [p.targetType, String(p.targetId), String(p.authorId)]
        );
      }
      return { done: true };

    case 'UPSERT_CONTENT_REVIEW': {
      const result = await db.run(`
        INSERT INTO workflowManager_content_reviews
          (target_type, target_id, status, submitted_by, reviewer_id, note, resolution_note, meta, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
      `, [p.targetType, String(p.targetId), p.status || 'pending', String(p.submittedBy), p.reviewerId || null, p.note || '', p.resolutionNote || '', jsonString(p.meta, {})]);
      return normalizeReviewRows(await db.get('SELECT * FROM workflowManager_content_reviews WHERE id = ?', [result.lastID]))[0] || null;
    }

    case 'UPDATE_CONTENT_REVIEW_STATUS': {
      const current = p.id
        ? await db.get('SELECT * FROM workflowManager_content_reviews WHERE id = ?', [p.id])
        : await db.get(`
          SELECT * FROM workflowManager_content_reviews
           WHERE target_type = ? AND target_id = ? AND status = 'pending'
           ORDER BY updated_at DESC, id DESC LIMIT 1;
        `, [p.targetType, String(p.targetId)]);
      if (!current) return null;
      await db.run(`
        UPDATE workflowManager_content_reviews
           SET status = ?, reviewer_id = ?, resolution_note = ?, resolved_at = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?;
      `, [p.status, p.reviewerId || null, p.resolutionNote || '', p.resolvedAt || null, current.id]);
      return normalizeReviewRows(await db.get('SELECT * FROM workflowManager_content_reviews WHERE id = ?', [current.id]))[0] || null;
    }

    case 'GET_CONTENT_REVIEW':
      if (p.id) return normalizeReviewRows(await db.get('SELECT * FROM workflowManager_content_reviews WHERE id = ?', [p.id]))[0] || null;
      return normalizeReviewRows(await db.get(`
        SELECT * FROM workflowManager_content_reviews
         WHERE target_type = ? AND target_id = ?
         ORDER BY updated_at DESC, id DESC LIMIT 1;
      `, [p.targetType, String(p.targetId)]))[0] || null;

    case 'LIST_CONTENT_REVIEWS': {
      const values = [];
      const where = [];
      if (p.status) {
        where.push('status = ?');
        values.push(p.status);
      }
      if (p.targetType && p.targetId) {
        where.push('target_type = ? AND target_id = ?');
        values.push(p.targetType, String(p.targetId));
      }
      values.push(Number(p.limit) || 50, Number(p.offset) || 0);
      return normalizeReviewRows(await db.all(`
        SELECT * FROM workflowManager_content_reviews
         WHERE ${where.length ? where.join(' AND ') : '1 = 1'}
         ORDER BY updated_at DESC, id DESC
         LIMIT ? OFFSET ?;
      `, values));
    }

    default:
      return null;
  }
}

function pgBuilder() {
  const values = [];
  const add = value => {
    values.push(value);
    return `$${values.length}`;
  };
  return { values, add };
}

async function handleWorkflowPostgres(client, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_WORKFLOW_SCHEMA':
      await client.query('CREATE SCHEMA IF NOT EXISTS workflowManager;');
      return { done: true };

    case 'INIT_WORKFLOW_TABLES':
      await client.query(`
        CREATE TABLE IF NOT EXISTS workflowManager.content_locks (
          id SERIAL PRIMARY KEY,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          owner_id TEXT NOT NULL,
          owner_name TEXT DEFAULT '',
          token TEXT DEFAULT '',
          expires_at TIMESTAMP NOT NULL,
          meta JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(target_type, target_id)
        );

        CREATE TABLE IF NOT EXISTS workflowManager.content_autosaves (
          id SERIAL PRIMARY KEY,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          author_id TEXT NOT NULL,
          title TEXT DEFAULT '',
          excerpt TEXT DEFAULT '',
          content JSONB DEFAULT '{}'::jsonb,
          meta JSONB DEFAULT '{}'::jsonb,
          base_revision_id TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(target_type, target_id, author_id)
        );

        CREATE TABLE IF NOT EXISTS workflowManager.content_reviews (
          id SERIAL PRIMARY KEY,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          submitted_by TEXT NOT NULL,
          reviewer_id TEXT,
          note TEXT DEFAULT '',
          resolution_note TEXT DEFAULT '',
          resolved_at TIMESTAMP,
          meta JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      await client.query('CREATE INDEX IF NOT EXISTS workflow_locks_target ON workflowManager.content_locks(target_type, target_id, expires_at);');
      await client.query('CREATE INDEX IF NOT EXISTS workflow_autosaves_target ON workflowManager.content_autosaves(target_type, target_id, updated_at DESC);');
      await client.query('CREATE INDEX IF NOT EXISTS workflow_reviews_status ON workflowManager.content_reviews(status, target_type, target_id, updated_at DESC);');
      return { done: true };

    case 'ACQUIRE_CONTENT_LOCK': {
      const current = await client.query(
        'SELECT * FROM workflowManager.content_locks WHERE target_type = $1 AND target_id = $2',
        [p.targetType, String(p.targetId)]
      );
      const existing = current.rows[0];
      if (existing && isActiveLock(existing, p.now) && existing.owner_id !== String(p.ownerId) && !p.force) {
        return { ...normalizeLockRows(existing)[0], locked: false };
      }
      const { rows } = await client.query(`
        INSERT INTO workflowManager.content_locks
          (target_type, target_id, owner_id, owner_name, token, expires_at, meta, created_at, updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,NOW(),NOW())
        ON CONFLICT(target_type, target_id) DO UPDATE SET
          owner_id=EXCLUDED.owner_id,
          owner_name=EXCLUDED.owner_name,
          token=EXCLUDED.token,
          expires_at=EXCLUDED.expires_at,
          meta=EXCLUDED.meta,
          updated_at=NOW()
        RETURNING *;
      `, [p.targetType, String(p.targetId), String(p.ownerId), p.ownerName || '', p.token || '', p.expiresAt, jsonString(p.meta, {})]);
      return { ...normalizeLockRows(rows)[0], locked: true };
    }

    case 'REFRESH_CONTENT_LOCK': {
      const current = await client.query(
        'SELECT * FROM workflowManager.content_locks WHERE target_type = $1 AND target_id = $2',
        [p.targetType, String(p.targetId)]
      );
      const existing = current.rows[0];
      if (existing && existing.owner_id !== String(p.ownerId) && !p.force) {
        return { ...normalizeLockRows(existing)[0], locked: false };
      }
      const { rows } = await client.query(`
        UPDATE workflowManager.content_locks
           SET owner_id=$1, owner_name=$2, token=$3, expires_at=$4, meta=$5::jsonb, updated_at=NOW()
         WHERE target_type=$6 AND target_id=$7
         RETURNING *;
      `, [String(p.ownerId), p.ownerName || '', p.token || '', p.expiresAt, jsonString(p.meta, {}), p.targetType, String(p.targetId)]);
      return { ...normalizeLockRows(rows)[0], locked: true };
    }

    case 'RELEASE_CONTENT_LOCK': {
      const built = pgBuilder();
      const where = [`target_type = ${built.add(p.targetType)}`, `target_id = ${built.add(String(p.targetId))}`];
      if (!p.force && p.ownerId) where.push(`owner_id = ${built.add(String(p.ownerId))}`);
      await client.query(`DELETE FROM workflowManager.content_locks WHERE ${where.join(' AND ')}`, built.values);
      return { done: true };
    }

    case 'GET_CONTENT_LOCK': {
      const { rows } = await client.query(`
        SELECT * FROM workflowManager.content_locks
         WHERE target_type = $1 AND target_id = $2 AND expires_at > $3
      `, [p.targetType, String(p.targetId), p.now]);
      return normalizeLockRows(rows)[0] || null;
    }

    case 'UPSERT_CONTENT_AUTOSAVE': {
      const { rows } = await client.query(`
        INSERT INTO workflowManager.content_autosaves
          (target_type, target_id, author_id, title, excerpt, content, meta, base_revision_id, created_at, updated_at)
        VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,NOW(),NOW())
        ON CONFLICT(target_type, target_id, author_id) DO UPDATE SET
          title=EXCLUDED.title,
          excerpt=EXCLUDED.excerpt,
          content=EXCLUDED.content,
          meta=EXCLUDED.meta,
          base_revision_id=EXCLUDED.base_revision_id,
          updated_at=NOW()
        RETURNING *;
      `, [p.targetType, String(p.targetId), String(p.authorId), p.title || '', p.excerpt || '', jsonString(p.content, {}), jsonString(p.meta, {}), p.baseRevisionId || null]);
      return normalizeAutosaveRows(rows)[0] || null;
    }

    case 'GET_CONTENT_AUTOSAVE': {
      if (p.id) {
        const { rows } = await client.query('SELECT * FROM workflowManager.content_autosaves WHERE id = $1', [p.id]);
        return normalizeAutosaveRows(rows)[0] || null;
      }
      const built = pgBuilder();
      const where = [`target_type = ${built.add(p.targetType)}`, `target_id = ${built.add(String(p.targetId))}`];
      if (p.authorId) where.push(`author_id = ${built.add(String(p.authorId))}`);
      const { rows } = await client.query(`
        SELECT * FROM workflowManager.content_autosaves
         WHERE ${where.join(' AND ')}
         ORDER BY updated_at DESC, id DESC LIMIT 1;
      `, built.values);
      return normalizeAutosaveRows(rows)[0] || null;
    }

    case 'LIST_CONTENT_AUTOSAVES': {
      const built = pgBuilder();
      const where = [`target_type = ${built.add(p.targetType)}`, `target_id = ${built.add(String(p.targetId))}`];
      if (p.authorId) where.push(`author_id = ${built.add(String(p.authorId))}`);
      const limitRef = built.add(Number(p.limit) || 20);
      const offsetRef = built.add(Number(p.offset) || 0);
      const { rows } = await client.query(`
        SELECT * FROM workflowManager.content_autosaves
         WHERE ${where.join(' AND ')}
         ORDER BY updated_at DESC, id DESC
         LIMIT ${limitRef} OFFSET ${offsetRef};
      `, built.values);
      return normalizeAutosaveRows(rows);
    }

    case 'DELETE_CONTENT_AUTOSAVE':
      if (p.id) {
        await client.query('DELETE FROM workflowManager.content_autosaves WHERE id = $1', [p.id]);
      } else {
        await client.query(
          'DELETE FROM workflowManager.content_autosaves WHERE target_type = $1 AND target_id = $2 AND author_id = $3',
          [p.targetType, String(p.targetId), String(p.authorId)]
        );
      }
      return { done: true };

    case 'UPSERT_CONTENT_REVIEW': {
      const { rows } = await client.query(`
        INSERT INTO workflowManager.content_reviews
          (target_type, target_id, status, submitted_by, reviewer_id, note, resolution_note, meta, created_at, updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW(),NOW())
        RETURNING *;
      `, [p.targetType, String(p.targetId), p.status || 'pending', String(p.submittedBy), p.reviewerId || null, p.note || '', p.resolutionNote || '', jsonString(p.meta, {})]);
      return normalizeReviewRows(rows)[0] || null;
    }

    case 'UPDATE_CONTENT_REVIEW_STATUS': {
      const current = p.id
        ? await client.query('SELECT * FROM workflowManager.content_reviews WHERE id = $1', [p.id])
        : await client.query(`
          SELECT * FROM workflowManager.content_reviews
           WHERE target_type = $1 AND target_id = $2 AND status = 'pending'
           ORDER BY updated_at DESC, id DESC LIMIT 1;
        `, [p.targetType, String(p.targetId)]);
      const existing = current.rows[0];
      if (!existing) return null;
      const { rows } = await client.query(`
        UPDATE workflowManager.content_reviews
           SET status=$1, reviewer_id=$2, resolution_note=$3, resolved_at=$4, updated_at=NOW()
         WHERE id=$5
         RETURNING *;
      `, [p.status, p.reviewerId || null, p.resolutionNote || '', p.resolvedAt || null, existing.id]);
      return normalizeReviewRows(rows)[0] || null;
    }

    case 'GET_CONTENT_REVIEW': {
      if (p.id) {
        const { rows } = await client.query('SELECT * FROM workflowManager.content_reviews WHERE id = $1', [p.id]);
        return normalizeReviewRows(rows)[0] || null;
      }
      const { rows } = await client.query(`
        SELECT * FROM workflowManager.content_reviews
         WHERE target_type = $1 AND target_id = $2
         ORDER BY updated_at DESC, id DESC LIMIT 1;
      `, [p.targetType, String(p.targetId)]);
      return normalizeReviewRows(rows)[0] || null;
    }

    case 'LIST_CONTENT_REVIEWS': {
      const built = pgBuilder();
      const where = [];
      if (p.status) where.push(`status = ${built.add(p.status)}`);
      if (p.targetType && p.targetId) {
        where.push(`target_type = ${built.add(p.targetType)}`);
        where.push(`target_id = ${built.add(String(p.targetId))}`);
      }
      const limitRef = built.add(Number(p.limit) || 50);
      const offsetRef = built.add(Number(p.offset) || 0);
      const { rows } = await client.query(`
        SELECT * FROM workflowManager.content_reviews
         WHERE ${where.length ? where.join(' AND ') : '1 = 1'}
         ORDER BY updated_at DESC, id DESC
         LIMIT ${limitRef} OFFSET ${offsetRef};
      `, built.values);
      return normalizeReviewRows(rows);
    }

    default:
      return null;
  }
}

function mongoIdQuery(id) {
  if (ObjectId.isValid(String(id))) return { _id: new ObjectId(String(id)) };
  return { id: String(id) };
}

async function handleWorkflowMongo(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_WORKFLOW_SCHEMA':
      return { done: true };

    case 'INIT_WORKFLOW_TABLES':
      await db.createCollection('content_locks').catch(() => {});
      await db.createCollection('content_autosaves').catch(() => {});
      await db.createCollection('content_reviews').catch(() => {});
      await db.collection('content_locks').createIndex({ target_type: 1, target_id: 1 }, { unique: true }).catch(() => {});
      await db.collection('content_autosaves').createIndex({ target_type: 1, target_id: 1, author_id: 1 }, { unique: true }).catch(() => {});
      await db.collection('content_reviews').createIndex({ status: 1, target_type: 1, target_id: 1, updated_at: -1 }).catch(() => {});
      return { done: true };

    case 'ACQUIRE_CONTENT_LOCK': {
      const query = { target_type: p.targetType, target_id: String(p.targetId) };
      const existing = await db.collection('content_locks').findOne(query);
      if (existing && isActiveLock(existing, p.now) && existing.owner_id !== String(p.ownerId) && !p.force) {
        return { ...mongoDoc(existing, 'lock'), locked: false };
      }
      await db.collection('content_locks').updateOne(query, {
        $set: {
          target_type: p.targetType,
          target_id: String(p.targetId),
          owner_id: String(p.ownerId),
          owner_name: p.ownerName || '',
          token: p.token || '',
          expires_at: p.expiresAt,
          meta: p.meta || {},
          updated_at: new Date().toISOString()
        },
        $setOnInsert: { _id: new ObjectId(), created_at: new Date().toISOString() }
      }, { upsert: true });
      return { ...mongoDoc(await db.collection('content_locks').findOne(query), 'lock'), locked: true };
    }

    case 'REFRESH_CONTENT_LOCK': {
      const query = { target_type: p.targetType, target_id: String(p.targetId) };
      const existing = await db.collection('content_locks').findOne(query);
      if (existing && existing.owner_id !== String(p.ownerId) && !p.force) {
        return { ...mongoDoc(existing, 'lock'), locked: false };
      }
      await db.collection('content_locks').updateOne(query, {
        $set: {
          owner_id: String(p.ownerId),
          owner_name: p.ownerName || '',
          token: p.token || '',
          expires_at: p.expiresAt,
          meta: p.meta || {},
          updated_at: new Date().toISOString()
        }
      });
      return { ...mongoDoc(await db.collection('content_locks').findOne(query), 'lock'), locked: true };
    }

    case 'RELEASE_CONTENT_LOCK': {
      const query = { target_type: p.targetType, target_id: String(p.targetId) };
      if (!p.force && p.ownerId) query.owner_id = String(p.ownerId);
      await db.collection('content_locks').deleteOne(query);
      return { done: true };
    }

    case 'GET_CONTENT_LOCK':
      return mongoDoc(await db.collection('content_locks').findOne({
        target_type: p.targetType,
        target_id: String(p.targetId),
        expires_at: { $gt: p.now }
      }), 'lock');

    case 'UPSERT_CONTENT_AUTOSAVE': {
      const query = { target_type: p.targetType, target_id: String(p.targetId), author_id: String(p.authorId) };
      await db.collection('content_autosaves').updateOne(query, {
        $set: {
          ...query,
          title: p.title || '',
          excerpt: p.excerpt || '',
          content: p.content || {},
          meta: p.meta || {},
          base_revision_id: p.baseRevisionId || null,
          updated_at: new Date().toISOString()
        },
        $setOnInsert: { _id: new ObjectId(), created_at: new Date().toISOString() }
      }, { upsert: true });
      return mongoDoc(await db.collection('content_autosaves').findOne(query), 'autosave');
    }

    case 'GET_CONTENT_AUTOSAVE':
      if (p.id) return mongoDoc(await db.collection('content_autosaves').findOne(mongoIdQuery(p.id)), 'autosave');
      return mongoDoc(await db.collection('content_autosaves').findOne(
        {
          target_type: p.targetType,
          target_id: String(p.targetId),
          ...(p.authorId ? { author_id: String(p.authorId) } : {})
        },
        { sort: { updated_at: -1, _id: -1 } }
      ), 'autosave');

    case 'LIST_CONTENT_AUTOSAVES':
      return (await db.collection('content_autosaves')
        .find({
          target_type: p.targetType,
          target_id: String(p.targetId),
          ...(p.authorId ? { author_id: String(p.authorId) } : {})
        })
        .sort({ updated_at: -1, _id: -1 })
        .skip(Number(p.offset) || 0)
        .limit(Number(p.limit) || 20)
        .toArray()).map(doc => mongoDoc(doc, 'autosave'));

    case 'DELETE_CONTENT_AUTOSAVE':
      if (p.id) await db.collection('content_autosaves').deleteOne(mongoIdQuery(p.id));
      else await db.collection('content_autosaves').deleteOne({ target_type: p.targetType, target_id: String(p.targetId), author_id: String(p.authorId) });
      return { done: true };

    case 'UPSERT_CONTENT_REVIEW': {
      const id = new ObjectId();
      await db.collection('content_reviews').insertOne({
        _id: id,
        target_type: p.targetType,
        target_id: String(p.targetId),
        status: p.status || 'pending',
        submitted_by: String(p.submittedBy),
        reviewer_id: p.reviewerId || null,
        note: p.note || '',
        resolution_note: p.resolutionNote || '',
        resolved_at: null,
        meta: p.meta || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      return mongoDoc(await db.collection('content_reviews').findOne({ _id: id }), 'review');
    }

    case 'UPDATE_CONTENT_REVIEW_STATUS': {
      const query = p.id
        ? mongoIdQuery(p.id)
        : { target_type: p.targetType, target_id: String(p.targetId), status: 'pending' };
      const current = await db.collection('content_reviews').findOne(query, { sort: { updated_at: -1, _id: -1 } });
      if (!current) return null;
      await db.collection('content_reviews').updateOne({ _id: current._id }, {
        $set: {
          status: p.status,
          reviewer_id: p.reviewerId || null,
          resolution_note: p.resolutionNote || '',
          resolved_at: p.resolvedAt || null,
          updated_at: new Date().toISOString()
        }
      });
      return mongoDoc(await db.collection('content_reviews').findOne({ _id: current._id }), 'review');
    }

    case 'GET_CONTENT_REVIEW':
      if (p.id) return mongoDoc(await db.collection('content_reviews').findOne(mongoIdQuery(p.id)), 'review');
      return mongoDoc(await db.collection('content_reviews').findOne(
        { target_type: p.targetType, target_id: String(p.targetId) },
        { sort: { updated_at: -1, _id: -1 } }
      ), 'review');

    case 'LIST_CONTENT_REVIEWS':
      return (await db.collection('content_reviews')
        .find({
          ...(p.status ? { status: p.status } : {}),
          ...(p.targetType && p.targetId ? { target_type: p.targetType, target_id: String(p.targetId) } : {})
        })
        .sort({ updated_at: -1, _id: -1 })
        .skip(Number(p.offset) || 0)
        .limit(Number(p.limit) || 50)
        .toArray()).map(doc => mongoDoc(doc, 'review'));

    default:
      return null;
  }
}

module.exports = {
  handleWorkflowMongo,
  handleWorkflowPostgres,
  handleWorkflowSqlite,
  isWorkflowPlaceholder
};
