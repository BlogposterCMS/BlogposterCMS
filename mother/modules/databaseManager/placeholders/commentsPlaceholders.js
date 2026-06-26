'use strict';

const { ObjectId } = require('mongodb');

const COMMENT_PLACEHOLDERS = new Set([
  'INIT_COMMENTS_SCHEMA',
  'INIT_COMMENTS_TABLES',
  'CREATE_COMMENT',
  'GET_COMMENT',
  'LIST_COMMENTS_FOR_ENTRY',
  'UPDATE_COMMENT',
  'UPDATE_COMMENT_STATUS',
  'DELETE_COMMENT'
]);

function isCommentsPlaceholder(operation) {
  return COMMENT_PLACEHOLDERS.has(operation);
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

function normalizeSqlRows(rows) {
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map(row => ({
    ...row,
    meta: parseJson(row.meta, {})
  }));
}

function sqliteCommentWhere(p) {
  const clauses = ['deleted_at IS NULL'];
  const values = [];
  if (p.entryId) {
    clauses.push('entry_id = ?');
    values.push(String(p.entryId));
  } else {
    clauses.push('source_module = ? AND source_id = ?');
    values.push(p.sourceModule, String(p.sourceId));
  }
  if (p.status) {
    clauses.push('status = ?');
    values.push(p.status);
  }
  return { where: clauses.join(' AND '), values };
}

function postgresCommentWhere(p) {
  const clauses = ['deleted_at IS NULL'];
  const values = [];
  const add = value => {
    values.push(value);
    return `$${values.length}`;
  };
  if (p.entryId) {
    clauses.push(`entry_id = ${add(String(p.entryId))}`);
  } else {
    clauses.push(`source_module = ${add(p.sourceModule)} AND source_id = ${add(String(p.sourceId))}`);
  }
  if (p.status) {
    clauses.push(`status = ${add(p.status)}`);
  }
  return { where: clauses.join(' AND '), values, add };
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

function mongoCommentQuery(commentId) {
  const oid = toObjectId(commentId);
  return oid ? { _id: oid } : { id: String(commentId) };
}

async function handleCommentsSqlite(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_COMMENTS_SCHEMA':
      return { done: true };

    case 'INIT_COMMENTS_TABLES':
      await db.exec(`
        CREATE TABLE IF NOT EXISTS commentsManager_comments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entry_id TEXT,
          source_module TEXT,
          source_id TEXT,
          parent_id TEXT,
          author_user_id TEXT,
          author_name TEXT DEFAULT 'Anonymous',
          author_email TEXT DEFAULT '',
          author_url TEXT DEFAULT '',
          author_ip_hash TEXT DEFAULT '',
          user_agent TEXT DEFAULT '',
          content TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          meta TEXT DEFAULT '{}',
          deleted_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await db.run('CREATE INDEX IF NOT EXISTS comments_entry_status_created ON commentsManager_comments(entry_id, status, created_at ASC);');
      await db.run('CREATE INDEX IF NOT EXISTS comments_source_status_created ON commentsManager_comments(source_module, source_id, status, created_at ASC);');
      await db.run('CREATE INDEX IF NOT EXISTS comments_parent_created ON commentsManager_comments(parent_id, created_at ASC);');
      return { done: true };

    case 'CREATE_COMMENT': {
      const insert = await db.run(`
        INSERT INTO commentsManager_comments
          (entry_id, source_module, source_id, parent_id, author_user_id, author_name,
           author_email, author_url, author_ip_hash, user_agent, content, status, meta,
           created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
      `, [
        p.entryId || null,
        p.sourceModule || null,
        p.sourceId || null,
        p.parentId || null,
        p.authorUserId || null,
        p.authorName || 'Anonymous',
        p.authorEmail || '',
        p.authorUrl || '',
        p.authorIpHash || '',
        p.userAgent || '',
        p.content,
        p.status || 'pending',
        jsonString(p.meta, {})
      ]);
      return normalizeSqlRows(await db.get('SELECT * FROM commentsManager_comments WHERE id = ?', [insert.lastID]))[0];
    }

    case 'GET_COMMENT':
      return normalizeSqlRows(await db.get('SELECT * FROM commentsManager_comments WHERE id = ? AND deleted_at IS NULL', [p.commentId]))[0] || null;

    case 'LIST_COMMENTS_FOR_ENTRY': {
      const { where, values } = sqliteCommentWhere(p);
      values.push(Math.min(Number(p.limit) || 50, 100), Math.max(Number(p.offset) || 0, 0));
      return normalizeSqlRows(await db.all(
        `SELECT * FROM commentsManager_comments WHERE ${where} ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?`,
        values
      ));
    }

    case 'UPDATE_COMMENT': {
      await db.run(`
        UPDATE commentsManager_comments
           SET parent_id=?, author_user_id=?, author_name=?, author_email=?, author_url=?,
               author_ip_hash=?, user_agent=?, content=?, status=?, meta=?,
               updated_at=CURRENT_TIMESTAMP
         WHERE id=? AND deleted_at IS NULL;
      `, [
        p.parentId || null,
        p.authorUserId || null,
        p.authorName || 'Anonymous',
        p.authorEmail || '',
        p.authorUrl || '',
        p.authorIpHash || '',
        p.userAgent || '',
        p.content,
        p.status || 'pending',
        jsonString(p.meta, {}),
        p.id
      ]);
      return normalizeSqlRows(await db.get('SELECT * FROM commentsManager_comments WHERE id = ?', [p.id]))[0] || null;
    }

    case 'UPDATE_COMMENT_STATUS':
      await db.run(
        'UPDATE commentsManager_comments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL',
        [p.status, p.commentId]
      );
      return normalizeSqlRows(await db.get('SELECT * FROM commentsManager_comments WHERE id = ?', [p.commentId]))[0] || null;

    case 'DELETE_COMMENT':
      await db.run(
        "UPDATE commentsManager_comments SET status = 'trash', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL",
        [p.commentId]
      );
      return { done: true, commentId: p.commentId };

    default:
      return null;
  }
}

async function handleCommentsPostgres(client, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_COMMENTS_SCHEMA':
      await client.query('CREATE SCHEMA IF NOT EXISTS commentsManager;');
      return { done: true };

    case 'INIT_COMMENTS_TABLES':
      await client.query(`
        CREATE TABLE IF NOT EXISTS commentsManager.comments (
          id SERIAL PRIMARY KEY,
          entry_id TEXT,
          source_module TEXT,
          source_id TEXT,
          parent_id TEXT,
          author_user_id TEXT,
          author_name TEXT DEFAULT 'Anonymous',
          author_email TEXT DEFAULT '',
          author_url TEXT DEFAULT '',
          author_ip_hash TEXT DEFAULT '',
          user_agent TEXT DEFAULT '',
          content TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          meta JSONB DEFAULT '{}'::jsonb,
          deleted_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      await client.query('CREATE INDEX IF NOT EXISTS comments_entry_status_created ON commentsManager.comments(entry_id, status, created_at ASC);');
      await client.query('CREATE INDEX IF NOT EXISTS comments_source_status_created ON commentsManager.comments(source_module, source_id, status, created_at ASC);');
      await client.query('CREATE INDEX IF NOT EXISTS comments_parent_created ON commentsManager.comments(parent_id, created_at ASC);');
      return { done: true };

    case 'CREATE_COMMENT': {
      const { rows } = await client.query(`
        INSERT INTO commentsManager.comments
          (entry_id, source_module, source_id, parent_id, author_user_id, author_name,
           author_email, author_url, author_ip_hash, user_agent, content, status, meta,
           created_at, updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,NOW(),NOW())
        RETURNING *;
      `, [
        p.entryId || null,
        p.sourceModule || null,
        p.sourceId || null,
        p.parentId || null,
        p.authorUserId || null,
        p.authorName || 'Anonymous',
        p.authorEmail || '',
        p.authorUrl || '',
        p.authorIpHash || '',
        p.userAgent || '',
        p.content,
        p.status || 'pending',
        jsonString(p.meta, {})
      ]);
      return normalizeSqlRows(rows)[0] || null;
    }

    case 'GET_COMMENT': {
      const { rows } = await client.query(
        'SELECT * FROM commentsManager.comments WHERE id = $1 AND deleted_at IS NULL',
        [p.commentId]
      );
      return normalizeSqlRows(rows)[0] || null;
    }

    case 'LIST_COMMENTS_FOR_ENTRY': {
      const built = postgresCommentWhere(p);
      const limitRef = built.add(Math.min(Number(p.limit) || 50, 100));
      const offsetRef = built.add(Math.max(Number(p.offset) || 0, 0));
      const { rows } = await client.query(
        `SELECT * FROM commentsManager.comments WHERE ${built.where} ORDER BY created_at ASC, id ASC LIMIT ${limitRef} OFFSET ${offsetRef}`,
        built.values
      );
      return normalizeSqlRows(rows);
    }

    case 'UPDATE_COMMENT': {
      const { rows } = await client.query(`
        UPDATE commentsManager.comments
           SET parent_id=$1, author_user_id=$2, author_name=$3, author_email=$4,
               author_url=$5, author_ip_hash=$6, user_agent=$7, content=$8,
               status=$9, meta=$10::jsonb, updated_at=NOW()
         WHERE id=$11 AND deleted_at IS NULL
         RETURNING *;
      `, [
        p.parentId || null,
        p.authorUserId || null,
        p.authorName || 'Anonymous',
        p.authorEmail || '',
        p.authorUrl || '',
        p.authorIpHash || '',
        p.userAgent || '',
        p.content,
        p.status || 'pending',
        jsonString(p.meta, {}),
        p.id
      ]);
      return normalizeSqlRows(rows)[0] || null;
    }

    case 'UPDATE_COMMENT_STATUS': {
      const { rows } = await client.query(
        'UPDATE commentsManager.comments SET status=$1, updated_at=NOW() WHERE id=$2 AND deleted_at IS NULL RETURNING *',
        [p.status, p.commentId]
      );
      return normalizeSqlRows(rows)[0] || null;
    }

    case 'DELETE_COMMENT':
      await client.query(
        "UPDATE commentsManager.comments SET status='trash', deleted_at=NOW(), updated_at=NOW() WHERE id=$1 AND deleted_at IS NULL",
        [p.commentId]
      );
      return { done: true, commentId: p.commentId };

    default:
      return null;
  }
}

async function handleCommentsMongo(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_COMMENTS_SCHEMA':
      return { done: true };

    case 'INIT_COMMENTS_TABLES':
      await db.createCollection('comments').catch(() => {});
      await db.collection('comments').createIndex({ entry_id: 1, status: 1, created_at: 1 }).catch(() => {});
      await db.collection('comments').createIndex({ source_module: 1, source_id: 1, status: 1, created_at: 1 }).catch(() => {});
      await db.collection('comments').createIndex({ parent_id: 1, created_at: 1 }).catch(() => {});
      return { done: true };

    case 'CREATE_COMMENT': {
      const _id = new ObjectId();
      const now = new Date();
      const doc = {
        _id,
        id: _id.toHexString(),
        entry_id: p.entryId || null,
        source_module: p.sourceModule || null,
        source_id: p.sourceId || null,
        parent_id: p.parentId || null,
        author_user_id: p.authorUserId || null,
        author_name: p.authorName || 'Anonymous',
        author_email: p.authorEmail || '',
        author_url: p.authorUrl || '',
        author_ip_hash: p.authorIpHash || '',
        user_agent: p.userAgent || '',
        content: p.content,
        status: p.status || 'pending',
        meta: p.meta || {},
        deleted_at: null,
        created_at: now,
        updated_at: now
      };
      await db.collection('comments').insertOne(doc);
      return mongoDoc(doc);
    }

    case 'GET_COMMENT':
      return mongoDoc(await db.collection('comments').findOne({ ...mongoCommentQuery(p.commentId), deleted_at: null }));

    case 'LIST_COMMENTS_FOR_ENTRY': {
      const query = { deleted_at: null };
      if (p.entryId) {
        query.entry_id = String(p.entryId);
      } else {
        query.source_module = p.sourceModule;
        query.source_id = String(p.sourceId);
      }
      if (p.status) query.status = p.status;
      return (await db.collection('comments')
        .find(query)
        .sort({ created_at: 1, _id: 1 })
        .skip(Math.max(Number(p.offset) || 0, 0))
        .limit(Math.min(Number(p.limit) || 50, 100))
        .toArray()).map(mongoDoc);
    }

    case 'UPDATE_COMMENT': {
      const now = new Date();
      await db.collection('comments').updateOne(mongoCommentQuery(p.id), {
        $set: {
          parent_id: p.parentId || null,
          author_user_id: p.authorUserId || null,
          author_name: p.authorName || 'Anonymous',
          author_email: p.authorEmail || '',
          author_url: p.authorUrl || '',
          author_ip_hash: p.authorIpHash || '',
          user_agent: p.userAgent || '',
          content: p.content,
          status: p.status || 'pending',
          meta: p.meta || {},
          updated_at: now
        }
      });
      return mongoDoc(await db.collection('comments').findOne(mongoCommentQuery(p.id)));
    }

    case 'UPDATE_COMMENT_STATUS':
      await db.collection('comments').updateOne(mongoCommentQuery(p.commentId), {
        $set: { status: p.status, updated_at: new Date() }
      });
      return mongoDoc(await db.collection('comments').findOne(mongoCommentQuery(p.commentId)));

    case 'DELETE_COMMENT':
      await db.collection('comments').updateOne(mongoCommentQuery(p.commentId), {
        $set: { status: 'trash', deleted_at: new Date(), updated_at: new Date() }
      });
      return { done: true, commentId: p.commentId };

    default:
      return null;
  }
}

module.exports = {
  handleCommentsMongo,
  handleCommentsPostgres,
  handleCommentsSqlite,
  isCommentsPlaceholder
};
