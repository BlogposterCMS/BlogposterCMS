'use strict';

const { ObjectId } = require('mongodb');

const MEDIA_PLACEHOLDERS = new Set([
  'INIT_MEDIA_SCHEMA',
  'MEDIA_ADD_FILE',
  'MEDIA_LIST_FILES',
  'MEDIA_DELETE_FILE',
  'MEDIA_UPDATE_FILE',
  'UPSERT_MEDIA_ATTACHMENT',
  'GET_MEDIA_ATTACHMENT',
  'LIST_MEDIA_ATTACHMENTS',
  'DELETE_MEDIA_ATTACHMENT',
  'UPSERT_MEDIA_VARIANT',
  'LIST_MEDIA_VARIANTS',
  'DELETE_MEDIA_VARIANT',
  'LINK_MEDIA_ATTACHMENT',
  'UNLINK_MEDIA_ATTACHMENT',
  'LIST_MEDIA_FOR_CONTENT',
  'LIST_CONTENT_FOR_MEDIA'
]);

function isMediaPlaceholder(operation) {
  return MEDIA_PLACEHOLDERS.has(operation);
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

function normalizeAttachmentRows(rows) {
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map(row => ({
    ...row,
    fileName: row.file_name,
    fileType: row.file_type,
    mimeType: row.mime_type,
    storagePath: row.storage_path,
    altText: row.alt_text,
    sizeBytes: row.size_bytes,
    userId: row.user_id,
    sourceModule: row.source_module,
    sourceId: row.source_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    meta: parseJson(row.meta, {})
  }));
}

function normalizeVariantRows(rows) {
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map(row => ({
    ...row,
    attachmentId: row.attachment_id,
    variantKey: row.variant_key,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    meta: parseJson(row.meta, {})
  }));
}

function normalizeRelationRows(rows) {
  return (Array.isArray(rows) ? rows : [rows]).filter(Boolean).map(row => ({
    ...row,
    attachmentId: row.attachment_id,
    targetType: row.target_type,
    targetId: row.target_id,
    sourceModule: row.source_module,
    sourceId: row.source_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    meta: parseJson(row.meta, {})
  }));
}

function mongoIdQuery(id) {
  if (ObjectId.isValid(String(id))) return { _id: new ObjectId(String(id)) };
  return { id: String(id) };
}

function mongoDoc(doc) {
  if (!doc) return null;
  const id = doc.id || (doc._id ? String(doc._id) : undefined);
  const out = { ...doc, id };
  delete out._id;
  out.fileName = out.file_name;
  out.fileType = out.file_type;
  out.mimeType = out.mime_type;
  out.storagePath = out.storage_path;
  out.altText = out.alt_text;
  out.sizeBytes = out.size_bytes;
  out.userId = out.user_id;
  out.sourceModule = out.source_module;
  out.sourceId = out.source_id;
  out.createdAt = out.created_at;
  out.updatedAt = out.updated_at;
  return out;
}

function mongoVariantDoc(doc) {
  if (!doc) return null;
  const id = doc.id || (doc._id ? String(doc._id) : undefined);
  const out = { ...doc, id };
  delete out._id;
  out.attachmentId = out.attachment_id;
  out.variantKey = out.variant_key;
  out.storagePath = out.storage_path;
  out.mimeType = out.mime_type;
  out.sizeBytes = out.size_bytes;
  out.createdAt = out.created_at;
  out.updatedAt = out.updated_at;
  return out;
}

function mongoRelationDoc(doc) {
  if (!doc) return null;
  const id = doc.id || (doc._id ? String(doc._id) : undefined);
  const out = { ...doc, id };
  delete out._id;
  out.attachmentId = out.attachment_id;
  out.targetType = out.target_type;
  out.targetId = out.target_id;
  out.sourceModule = out.source_module;
  out.sourceId = out.source_id;
  out.sortOrder = out.sort_order;
  out.createdAt = out.created_at;
  out.updatedAt = out.updated_at;
  return out;
}

function sqliteListWhere(p) {
  const where = [];
  const values = [];
  if (p.category) {
    where.push('category = ?');
    values.push(p.category);
  }
  if (p.fileType) {
    where.push('file_type = ?');
    values.push(p.fileType);
  }
  if (p.mimeType) {
    where.push('mime_type = ?');
    values.push(p.mimeType);
  }
  if (p.status) {
    where.push('status = ?');
    values.push(p.status);
  }
  if (p.visibility) {
    where.push('visibility = ?');
    values.push(p.visibility);
  }
  if (p.folder) {
    where.push('folder = ?');
    values.push(p.folder);
  }
  if (p.query) {
    where.push('(LOWER(file_name) LIKE ? OR LOWER(title) LIKE ? OR LOWER(alt_text) LIKE ? OR LOWER(caption) LIKE ?)');
    const like = `%${String(p.query).toLowerCase()}%`;
    values.push(like, like, like, like);
  }
  return { where: where.length ? where.join(' AND ') : '1 = 1', values };
}

function postgresBuilder() {
  const values = [];
  const add = value => {
    values.push(value);
    return `$${values.length}`;
  };
  return { values, add };
}

async function handleMediaSqlite(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_MEDIA_SCHEMA':
      await db.exec(`
        CREATE TABLE IF NOT EXISTS mediamanager_media_files (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_name TEXT NOT NULL,
          file_type TEXT NOT NULL,
          category TEXT,
          user_id INTEGER,
          location TEXT,
          folder TEXT,
          notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS mediamanager_media_attachments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          file_name TEXT NOT NULL,
          file_type TEXT NOT NULL DEFAULT '',
          mime_type TEXT DEFAULT '',
          url TEXT DEFAULT '',
          storage_path TEXT DEFAULT '',
          folder TEXT DEFAULT '',
          title TEXT DEFAULT '',
          alt_text TEXT DEFAULT '',
          caption TEXT DEFAULT '',
          description TEXT DEFAULT '',
          credit TEXT DEFAULT '',
          category TEXT DEFAULT '',
          status TEXT DEFAULT 'active',
          visibility TEXT DEFAULT 'public',
          user_id TEXT,
          size_bytes INTEGER DEFAULT 0,
          width INTEGER DEFAULT 0,
          height INTEGER DEFAULT 0,
          checksum TEXT DEFAULT '',
          source_module TEXT DEFAULT '',
          source_id TEXT DEFAULT '',
          meta TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS mediamanager_media_variants (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          attachment_id TEXT NOT NULL,
          variant_key TEXT NOT NULL,
          url TEXT DEFAULT '',
          storage_path TEXT DEFAULT '',
          mime_type TEXT DEFAULT '',
          width INTEGER DEFAULT 0,
          height INTEGER DEFAULT 0,
          size_bytes INTEGER DEFAULT 0,
          meta TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(attachment_id, variant_key)
        );

        CREATE TABLE IF NOT EXISTS mediamanager_media_relations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          attachment_id TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          source_module TEXT DEFAULT '',
          source_id TEXT DEFAULT '',
          role TEXT DEFAULT 'inline',
          sort_order INTEGER DEFAULT 0,
          meta TEXT DEFAULT '{}',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(attachment_id, target_type, target_id, role)
        );
      `);
      await db.run('CREATE INDEX IF NOT EXISTS media_attachments_filters ON mediamanager_media_attachments(status, visibility, category, file_type, folder);');
      await db.run('CREATE INDEX IF NOT EXISTS media_variants_attachment ON mediamanager_media_variants(attachment_id, variant_key);');
      await db.run('CREATE INDEX IF NOT EXISTS media_relations_target ON mediamanager_media_relations(target_type, target_id, role);');
      return { done: true };

    case 'MEDIA_ADD_FILE': {
      const { fileName, fileType, category, userId, location, folder, notes } = p;
      const result = await db.run(`
        INSERT INTO mediamanager_media_files
          (file_name, file_type, category, user_id, location, folder, notes, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
      `, [fileName, fileType, category, userId, location, folder, notes]);
      return { done: true, id: result.lastID };
    }

    case 'MEDIA_LIST_FILES': {
      const where = [];
      const values = [];
      if (p.filterCategory) {
        where.push('category = ?');
        values.push(p.filterCategory);
      }
      if (p.filterFileType) {
        where.push('file_type = ?');
        values.push(p.filterFileType);
      }
      return await db.all(`
        SELECT * FROM mediamanager_media_files
         ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY id DESC;
      `, values);
    }

    case 'MEDIA_DELETE_FILE':
      await db.run('DELETE FROM mediamanager_media_files WHERE id = ?', [p.fileId]);
      return { done: true };

    case 'MEDIA_UPDATE_FILE':
      await db.run(`
        UPDATE mediamanager_media_files
           SET category = COALESCE(?, category),
               notes = COALESCE(?, notes),
               folder = COALESCE(?, folder),
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?;
      `, [p.newCategory, p.newNotes, p.newFolder, p.fileId]);
      return { done: true };

    case 'UPSERT_MEDIA_ATTACHMENT': {
      if (p.id) {
        await db.run(`
          UPDATE mediamanager_media_attachments
             SET file_name=COALESCE(?, file_name),
                 file_type=COALESCE(?, file_type),
                 mime_type=COALESCE(?, mime_type),
                 url=COALESCE(?, url),
                 storage_path=COALESCE(?, storage_path),
                 folder=COALESCE(?, folder),
                 title=COALESCE(?, title),
                 alt_text=COALESCE(?, alt_text),
                 caption=COALESCE(?, caption),
                 description=COALESCE(?, description),
                 credit=COALESCE(?, credit),
                 category=COALESCE(?, category),
                 status=COALESCE(?, status),
                 visibility=COALESCE(?, visibility),
                 user_id=COALESCE(?, user_id),
                 size_bytes=COALESCE(?, size_bytes),
                 width=COALESCE(?, width),
                 height=COALESCE(?, height),
                 checksum=COALESCE(?, checksum),
                 source_module=COALESCE(?, source_module),
                 source_id=COALESCE(?, source_id),
                 meta=COALESCE(?, meta),
                 updated_at=CURRENT_TIMESTAMP
           WHERE id = ?;
        `, [
          p.fileName ?? null, p.fileType ?? null, p.mimeType ?? null, p.url ?? null,
          p.storagePath ?? null, p.folder ?? null, p.title ?? null, p.altText ?? null,
          p.caption ?? null, p.description ?? null, p.credit ?? null, p.category ?? null,
          p.status ?? null, p.visibility ?? null, p.userId ?? null,
          p.sizeBytes ?? null, p.width ?? null, p.height ?? null, p.checksum ?? null,
          p.sourceModule ?? null, p.sourceId ?? null,
          typeof p.meta === 'undefined' ? null : jsonString(p.meta, {}),
          p.id
        ]);
        return normalizeAttachmentRows(await db.get('SELECT * FROM mediamanager_media_attachments WHERE id = ?', [p.id]))[0] || null;
      }

      if (p.sourceModule && p.sourceId) {
        const existing = await db.get(
          'SELECT id FROM mediamanager_media_attachments WHERE source_module = ? AND source_id = ? LIMIT 1',
          [p.sourceModule, p.sourceId]
        );
        if (existing) {
          return await handleMediaSqlite(db, 'UPSERT_MEDIA_ATTACHMENT', { ...p, id: existing.id });
        }
      }

      const result = await db.run(`
        INSERT INTO mediamanager_media_attachments
          (file_name, file_type, mime_type, url, storage_path, folder, title, alt_text,
           caption, description, credit, category, status, visibility, user_id,
           size_bytes, width, height, checksum, source_module, source_id, meta,
           created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
      `, [
        p.fileName, p.fileType || '', p.mimeType || '', p.url || '', p.storagePath || '',
        p.folder || '', p.title || '', p.altText || '', p.caption || '', p.description || '',
        p.credit || '', p.category || '', p.status || 'active', p.visibility || 'public',
        p.userId || null, Number(p.sizeBytes) || 0, Number(p.width) || 0, Number(p.height) || 0,
        p.checksum || '', p.sourceModule || '', p.sourceId || '', jsonString(p.meta, {})
      ]);
      return normalizeAttachmentRows(await db.get('SELECT * FROM mediamanager_media_attachments WHERE id = ?', [result.lastID]))[0] || null;
    }

    case 'GET_MEDIA_ATTACHMENT': {
      if (p.id) {
        return normalizeAttachmentRows(await db.get('SELECT * FROM mediamanager_media_attachments WHERE id = ?', [p.id]))[0] || null;
      }
      if (p.sourceModule && p.sourceId) {
        return normalizeAttachmentRows(await db.get(
          'SELECT * FROM mediamanager_media_attachments WHERE source_module = ? AND source_id = ?',
          [p.sourceModule, p.sourceId]
        ))[0] || null;
      }
      return null;
    }

    case 'LIST_MEDIA_ATTACHMENTS': {
      const built = sqliteListWhere(p);
      built.values.push(Number(p.limit) || 50, Number(p.offset) || 0);
      return normalizeAttachmentRows(await db.all(`
        SELECT * FROM mediamanager_media_attachments
         WHERE ${built.where}
         ORDER BY updated_at DESC, id DESC
         LIMIT ? OFFSET ?;
      `, built.values));
    }

    case 'DELETE_MEDIA_ATTACHMENT':
      await db.run('DELETE FROM mediamanager_media_variants WHERE attachment_id = ?', [String(p.id)]);
      await db.run('DELETE FROM mediamanager_media_relations WHERE attachment_id = ?', [String(p.id)]);
      await db.run('DELETE FROM mediamanager_media_attachments WHERE id = ?', [p.id]);
      return { done: true, id: p.id };

    case 'UPSERT_MEDIA_VARIANT':
      await db.run(`
        INSERT INTO mediamanager_media_variants
          (attachment_id, variant_key, url, storage_path, mime_type, width, height, size_bytes, meta, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(attachment_id, variant_key) DO UPDATE SET
          url=excluded.url,
          storage_path=excluded.storage_path,
          mime_type=excluded.mime_type,
          width=excluded.width,
          height=excluded.height,
          size_bytes=excluded.size_bytes,
          meta=excluded.meta,
          updated_at=CURRENT_TIMESTAMP;
      `, [
        String(p.attachmentId), p.variantKey, p.url || '', p.storagePath || '', p.mimeType || '',
        Number(p.width) || 0, Number(p.height) || 0, Number(p.sizeBytes) || 0, jsonString(p.meta, {})
      ]);
      return normalizeVariantRows(await db.get(
        'SELECT * FROM mediamanager_media_variants WHERE attachment_id = ? AND variant_key = ?',
        [String(p.attachmentId), p.variantKey]
      ))[0] || null;

    case 'LIST_MEDIA_VARIANTS':
      return normalizeVariantRows(await db.all(
        'SELECT * FROM mediamanager_media_variants WHERE attachment_id = ? ORDER BY variant_key ASC',
        [String(p.attachmentId)]
      ));

    case 'DELETE_MEDIA_VARIANT':
      await db.run(
        'DELETE FROM mediamanager_media_variants WHERE attachment_id = ? AND variant_key = ?',
        [String(p.attachmentId), p.variantKey]
      );
      return { done: true, attachmentId: String(p.attachmentId), variantKey: p.variantKey };

    case 'LINK_MEDIA_ATTACHMENT':
      await db.run(`
        INSERT INTO mediamanager_media_relations
          (attachment_id, target_type, target_id, source_module, source_id, role, sort_order, meta, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(attachment_id, target_type, target_id, role) DO UPDATE SET
          source_module=excluded.source_module,
          source_id=excluded.source_id,
          sort_order=excluded.sort_order,
          meta=excluded.meta,
          updated_at=CURRENT_TIMESTAMP;
      `, [
        String(p.attachmentId), p.targetType, String(p.targetId), p.sourceModule || '',
        p.sourceId || '', p.role || 'inline', Number(p.sortOrder) || 0, jsonString(p.meta, {})
      ]);
      return normalizeRelationRows(await db.get(`
        SELECT * FROM mediamanager_media_relations
         WHERE attachment_id = ? AND target_type = ? AND target_id = ? AND role = ?
      `, [String(p.attachmentId), p.targetType, String(p.targetId), p.role || 'inline']))[0] || null;

    case 'UNLINK_MEDIA_ATTACHMENT':
      await db.run(`
        DELETE FROM mediamanager_media_relations
         WHERE attachment_id = ? AND target_type = ? AND target_id = ? AND role = ?;
      `, [String(p.attachmentId), p.targetType, String(p.targetId), p.role || 'inline']);
      return { done: true };

    case 'LIST_MEDIA_FOR_CONTENT':
      return normalizeAttachmentRows(await db.all(`
        SELECT a.*, r.role, r.sort_order, r.meta AS relation_meta
          FROM mediamanager_media_relations r
          JOIN mediamanager_media_attachments a ON CAST(a.id AS TEXT) = r.attachment_id
         WHERE r.target_type = ? AND r.target_id = ?
         ORDER BY r.sort_order ASC, a.id ASC;
      `, [p.targetType, String(p.targetId)]));

    case 'LIST_CONTENT_FOR_MEDIA':
      return normalizeRelationRows(await db.all(
        'SELECT * FROM mediamanager_media_relations WHERE attachment_id = ? ORDER BY target_type ASC, target_id ASC',
        [String(p.attachmentId)]
      ));

    default:
      return null;
  }
}

async function handleMediaPostgres(client, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_MEDIA_SCHEMA':
      await client.query('CREATE SCHEMA IF NOT EXISTS mediamanager;');
      await client.query(`
        CREATE TABLE IF NOT EXISTS mediamanager.media_files (
          id SERIAL PRIMARY KEY,
          file_name VARCHAR(255) NOT NULL,
          file_type VARCHAR(100) NOT NULL,
          category VARCHAR(100),
          user_id INT,
          location VARCHAR(500),
          folder VARCHAR(500),
          notes TEXT,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS mediamanager.media_attachments (
          id SERIAL PRIMARY KEY,
          file_name TEXT NOT NULL,
          file_type TEXT DEFAULT '',
          mime_type TEXT DEFAULT '',
          url TEXT DEFAULT '',
          storage_path TEXT DEFAULT '',
          folder TEXT DEFAULT '',
          title TEXT DEFAULT '',
          alt_text TEXT DEFAULT '',
          caption TEXT DEFAULT '',
          description TEXT DEFAULT '',
          credit TEXT DEFAULT '',
          category TEXT DEFAULT '',
          status TEXT DEFAULT 'active',
          visibility TEXT DEFAULT 'public',
          user_id TEXT,
          size_bytes INTEGER DEFAULT 0,
          width INTEGER DEFAULT 0,
          height INTEGER DEFAULT 0,
          checksum TEXT DEFAULT '',
          source_module TEXT DEFAULT '',
          source_id TEXT DEFAULT '',
          meta JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS mediamanager.media_variants (
          id SERIAL PRIMARY KEY,
          attachment_id TEXT NOT NULL,
          variant_key TEXT NOT NULL,
          url TEXT DEFAULT '',
          storage_path TEXT DEFAULT '',
          mime_type TEXT DEFAULT '',
          width INTEGER DEFAULT 0,
          height INTEGER DEFAULT 0,
          size_bytes INTEGER DEFAULT 0,
          meta JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(attachment_id, variant_key)
        );

        CREATE TABLE IF NOT EXISTS mediamanager.media_relations (
          id SERIAL PRIMARY KEY,
          attachment_id TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          source_module TEXT DEFAULT '',
          source_id TEXT DEFAULT '',
          role TEXT DEFAULT 'inline',
          sort_order INTEGER DEFAULT 0,
          meta JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(attachment_id, target_type, target_id, role)
        );
      `);
      await client.query('CREATE INDEX IF NOT EXISTS media_attachments_filters ON mediamanager.media_attachments(status, visibility, category, file_type, folder);');
      await client.query('CREATE INDEX IF NOT EXISTS media_variants_attachment ON mediamanager.media_variants(attachment_id, variant_key);');
      await client.query('CREATE INDEX IF NOT EXISTS media_relations_target ON mediamanager.media_relations(target_type, target_id, role);');
      return { done: true };

    case 'MEDIA_ADD_FILE': {
      const { rows } = await client.query(`
        INSERT INTO mediamanager.media_files
          (file_name, file_type, category, user_id, location, folder, notes, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
        RETURNING *;
      `, [p.fileName, p.fileType, p.category, p.userId, p.location, p.folder, p.notes]);
      return { done: true, id: rows[0]?.id };
    }

    case 'MEDIA_LIST_FILES': {
      const built = postgresBuilder();
      const where = [];
      if (p.filterCategory) where.push(`category = ${built.add(p.filterCategory)}`);
      if (p.filterFileType) where.push(`file_type = ${built.add(p.filterFileType)}`);
      const { rows } = await client.query(`
        SELECT * FROM mediamanager.media_files
         WHERE ${where.length ? where.join(' AND ') : '1 = 1'}
         ORDER BY id DESC;
      `, built.values);
      return rows;
    }

    case 'MEDIA_DELETE_FILE':
      await client.query('DELETE FROM mediamanager.media_files WHERE id = $1', [p.fileId]);
      return { done: true };

    case 'MEDIA_UPDATE_FILE':
      await client.query(`
        UPDATE mediamanager.media_files
           SET category = COALESCE($2, category),
               notes = COALESCE($3, notes),
               folder = COALESCE($4, folder),
               updated_at = NOW()
         WHERE id = $1;
      `, [p.fileId, p.newCategory, p.newNotes, p.newFolder]);
      return { done: true };

    case 'UPSERT_MEDIA_ATTACHMENT': {
      if (p.id) {
        const { rows } = await client.query(`
          UPDATE mediamanager.media_attachments
             SET file_name=COALESCE($2, file_name),
                 file_type=COALESCE($3, file_type),
                 mime_type=COALESCE($4, mime_type),
                 url=COALESCE($5, url),
                 storage_path=COALESCE($6, storage_path),
                 folder=COALESCE($7, folder),
                 title=COALESCE($8, title),
                 alt_text=COALESCE($9, alt_text),
                 caption=COALESCE($10, caption),
                 description=COALESCE($11, description),
                 credit=COALESCE($12, credit),
                 category=COALESCE($13, category),
                 status=COALESCE($14, status),
                 visibility=COALESCE($15, visibility),
                 user_id=COALESCE($16, user_id),
                 size_bytes=COALESCE($17, size_bytes),
                 width=COALESCE($18, width),
                 height=COALESCE($19, height),
                 checksum=COALESCE($20, checksum),
                 source_module=COALESCE($21, source_module),
                 source_id=COALESCE($22, source_id),
                 meta=COALESCE($23::jsonb, meta),
                 updated_at=NOW()
           WHERE id = $1
           RETURNING *;
        `, [
          p.id, p.fileName ?? null, p.fileType ?? null, p.mimeType ?? null, p.url ?? null,
          p.storagePath ?? null, p.folder ?? null, p.title ?? null, p.altText ?? null,
          p.caption ?? null, p.description ?? null, p.credit ?? null, p.category ?? null,
          p.status ?? null, p.visibility ?? null, p.userId ?? null,
          p.sizeBytes ?? null, p.width ?? null, p.height ?? null, p.checksum ?? null,
          p.sourceModule ?? null, p.sourceId ?? null,
          typeof p.meta === 'undefined' ? null : jsonString(p.meta, {})
        ]);
        return normalizeAttachmentRows(rows)[0] || null;
      }

      if (p.sourceModule && p.sourceId) {
        const existing = await client.query(
          'SELECT id FROM mediamanager.media_attachments WHERE source_module = $1 AND source_id = $2 LIMIT 1',
          [p.sourceModule, p.sourceId]
        );
        if (existing.rows[0]) {
          return await handleMediaPostgres(client, 'UPSERT_MEDIA_ATTACHMENT', { ...p, id: existing.rows[0].id });
        }
      }

      const { rows } = await client.query(`
        INSERT INTO mediamanager.media_attachments
          (file_name, file_type, mime_type, url, storage_path, folder, title, alt_text,
           caption, description, credit, category, status, visibility, user_id,
           size_bytes, width, height, checksum, source_module, source_id, meta,
           created_at, updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,NOW(),NOW())
        RETURNING *;
      `, [
        p.fileName, p.fileType || '', p.mimeType || '', p.url || '', p.storagePath || '',
        p.folder || '', p.title || '', p.altText || '', p.caption || '', p.description || '',
        p.credit || '', p.category || '', p.status || 'active', p.visibility || 'public',
        p.userId || null, Number(p.sizeBytes) || 0, Number(p.width) || 0, Number(p.height) || 0,
        p.checksum || '', p.sourceModule || '', p.sourceId || '', jsonString(p.meta, {})
      ]);
      return normalizeAttachmentRows(rows)[0] || null;
    }

    case 'GET_MEDIA_ATTACHMENT': {
      if (p.id) {
        const { rows } = await client.query('SELECT * FROM mediamanager.media_attachments WHERE id = $1', [p.id]);
        return normalizeAttachmentRows(rows)[0] || null;
      }
      if (p.sourceModule && p.sourceId) {
        const { rows } = await client.query(
          'SELECT * FROM mediamanager.media_attachments WHERE source_module = $1 AND source_id = $2',
          [p.sourceModule, p.sourceId]
        );
        return normalizeAttachmentRows(rows)[0] || null;
      }
      return null;
    }

    case 'LIST_MEDIA_ATTACHMENTS': {
      const built = postgresBuilder();
      const where = [];
      if (p.category) where.push(`category = ${built.add(p.category)}`);
      if (p.fileType) where.push(`file_type = ${built.add(p.fileType)}`);
      if (p.mimeType) where.push(`mime_type = ${built.add(p.mimeType)}`);
      if (p.status) where.push(`status = ${built.add(p.status)}`);
      if (p.visibility) where.push(`visibility = ${built.add(p.visibility)}`);
      if (p.folder) where.push(`folder = ${built.add(p.folder)}`);
      if (p.query) {
        const ref = built.add(`%${String(p.query).toLowerCase()}%`);
        where.push(`(LOWER(file_name) LIKE ${ref} OR LOWER(title) LIKE ${ref} OR LOWER(alt_text) LIKE ${ref} OR LOWER(caption) LIKE ${ref})`);
      }
      const limitRef = built.add(Number(p.limit) || 50);
      const offsetRef = built.add(Number(p.offset) || 0);
      const { rows } = await client.query(`
        SELECT * FROM mediamanager.media_attachments
         WHERE ${where.length ? where.join(' AND ') : '1 = 1'}
         ORDER BY updated_at DESC, id DESC
         LIMIT ${limitRef} OFFSET ${offsetRef};
      `, built.values);
      return normalizeAttachmentRows(rows);
    }

    case 'DELETE_MEDIA_ATTACHMENT':
      await client.query('DELETE FROM mediamanager.media_variants WHERE attachment_id = $1', [String(p.id)]);
      await client.query('DELETE FROM mediamanager.media_relations WHERE attachment_id = $1', [String(p.id)]);
      await client.query('DELETE FROM mediamanager.media_attachments WHERE id = $1', [p.id]);
      return { done: true, id: p.id };

    case 'UPSERT_MEDIA_VARIANT': {
      const { rows } = await client.query(`
        INSERT INTO mediamanager.media_variants
          (attachment_id, variant_key, url, storage_path, mime_type, width, height, size_bytes, meta, created_at, updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,NOW(),NOW())
        ON CONFLICT(attachment_id, variant_key) DO UPDATE SET
          url=EXCLUDED.url,
          storage_path=EXCLUDED.storage_path,
          mime_type=EXCLUDED.mime_type,
          width=EXCLUDED.width,
          height=EXCLUDED.height,
          size_bytes=EXCLUDED.size_bytes,
          meta=EXCLUDED.meta,
          updated_at=NOW()
        RETURNING *;
      `, [
        String(p.attachmentId), p.variantKey, p.url || '', p.storagePath || '', p.mimeType || '',
        Number(p.width) || 0, Number(p.height) || 0, Number(p.sizeBytes) || 0, jsonString(p.meta, {})
      ]);
      return normalizeVariantRows(rows)[0] || null;
    }

    case 'LIST_MEDIA_VARIANTS': {
      const { rows } = await client.query(
        'SELECT * FROM mediamanager.media_variants WHERE attachment_id = $1 ORDER BY variant_key ASC',
        [String(p.attachmentId)]
      );
      return normalizeVariantRows(rows);
    }

    case 'DELETE_MEDIA_VARIANT':
      await client.query(
        'DELETE FROM mediamanager.media_variants WHERE attachment_id = $1 AND variant_key = $2',
        [String(p.attachmentId), p.variantKey]
      );
      return { done: true, attachmentId: String(p.attachmentId), variantKey: p.variantKey };

    case 'LINK_MEDIA_ATTACHMENT': {
      const { rows } = await client.query(`
        INSERT INTO mediamanager.media_relations
          (attachment_id, target_type, target_id, source_module, source_id, role, sort_order, meta, created_at, updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW(),NOW())
        ON CONFLICT(attachment_id, target_type, target_id, role) DO UPDATE SET
          source_module=EXCLUDED.source_module,
          source_id=EXCLUDED.source_id,
          sort_order=EXCLUDED.sort_order,
          meta=EXCLUDED.meta,
          updated_at=NOW()
        RETURNING *;
      `, [
        String(p.attachmentId), p.targetType, String(p.targetId), p.sourceModule || '',
        p.sourceId || '', p.role || 'inline', Number(p.sortOrder) || 0, jsonString(p.meta, {})
      ]);
      return normalizeRelationRows(rows)[0] || null;
    }

    case 'UNLINK_MEDIA_ATTACHMENT':
      await client.query(`
        DELETE FROM mediamanager.media_relations
         WHERE attachment_id = $1 AND target_type = $2 AND target_id = $3 AND role = $4;
      `, [String(p.attachmentId), p.targetType, String(p.targetId), p.role || 'inline']);
      return { done: true };

    case 'LIST_MEDIA_FOR_CONTENT': {
      const { rows } = await client.query(`
        SELECT a.*, r.role, r.sort_order, r.meta AS relation_meta
          FROM mediamanager.media_relations r
          JOIN mediamanager.media_attachments a ON a.id::text = r.attachment_id
         WHERE r.target_type = $1 AND r.target_id = $2
         ORDER BY r.sort_order ASC, a.id ASC;
      `, [p.targetType, String(p.targetId)]);
      return normalizeAttachmentRows(rows);
    }

    case 'LIST_CONTENT_FOR_MEDIA': {
      const { rows } = await client.query(
        'SELECT * FROM mediamanager.media_relations WHERE attachment_id = $1 ORDER BY target_type ASC, target_id ASC',
        [String(p.attachmentId)]
      );
      return normalizeRelationRows(rows);
    }

    default:
      return null;
  }
}

async function handleMediaMongo(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_MEDIA_SCHEMA':
      await db.createCollection('media_files').catch(() => {});
      await db.createCollection('media_attachments').catch(() => {});
      await db.createCollection('media_variants').catch(() => {});
      await db.createCollection('media_relations').catch(() => {});
      await db.collection('media_attachments').createIndex({ status: 1, visibility: 1, category: 1, file_type: 1, folder: 1 }).catch(() => {});
      await db.collection('media_attachments').createIndex({ source_module: 1, source_id: 1 }).catch(() => {});
      await db.collection('media_variants').createIndex({ attachment_id: 1, variant_key: 1 }, { unique: true }).catch(() => {});
      await db.collection('media_relations').createIndex({ attachment_id: 1, target_type: 1, target_id: 1, role: 1 }, { unique: true }).catch(() => {});
      await db.collection('media_relations').createIndex({ target_type: 1, target_id: 1, role: 1 }).catch(() => {});
      return { done: true };

    case 'MEDIA_ADD_FILE': {
      const id = new ObjectId();
      await db.collection('media_files').insertOne({
        _id: id,
        id: id.toHexString(),
        file_name: p.fileName,
        file_type: p.fileType,
        category: p.category || '',
        user_id: p.userId || null,
        location: p.location || '',
        folder: p.folder || '',
        notes: p.notes || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
      return { done: true, id: id.toHexString(), insertedId: id.toHexString() };
    }

    case 'MEDIA_LIST_FILES': {
      const query = {};
      if (p.filterCategory) query.category = p.filterCategory;
      if (p.filterFileType) query.file_type = p.filterFileType;
      return await db.collection('media_files').find(query).sort({ created_at: -1 }).toArray();
    }

    case 'MEDIA_DELETE_FILE':
      await db.collection('media_files').deleteOne({ $or: [{ id: String(p.fileId) }, mongoIdQuery(p.fileId)] });
      return { done: true };

    case 'MEDIA_UPDATE_FILE':
      await db.collection('media_files').updateOne(
        { $or: [{ id: String(p.fileId) }, mongoIdQuery(p.fileId)] },
        {
          $set: {
            category: p.newCategory,
            notes: p.newNotes,
            folder: p.newFolder,
            updated_at: new Date().toISOString()
          }
        }
      );
      return { done: true };

    case 'UPSERT_MEDIA_ATTACHMENT': {
      if (!p.id && p.sourceModule && p.sourceId) {
        const existing = await db.collection('media_attachments').findOne({
          source_module: p.sourceModule,
          source_id: p.sourceId
        });
        if (existing) {
          return await handleMediaMongo(db, 'UPSERT_MEDIA_ATTACHMENT', {
            ...p,
            id: existing.id || String(existing._id)
          });
        }
      }

      let query = null;
      if (p.id) query = mongoIdQuery(p.id);
      else if (p.sourceModule && p.sourceId) query = { source_module: p.sourceModule, source_id: p.sourceId };
      else query = { _id: new ObjectId() };
      const id = query._id || new ObjectId();
      const update = {
        $set: {
          file_name: p.fileName || '',
          file_type: p.fileType || '',
          mime_type: p.mimeType || '',
          url: p.url || '',
          storage_path: p.storagePath || '',
          folder: p.folder || '',
          title: p.title || '',
          alt_text: p.altText || '',
          caption: p.caption || '',
          description: p.description || '',
          credit: p.credit || '',
          category: p.category || '',
          status: p.status || 'active',
          visibility: p.visibility || 'public',
          user_id: p.userId || null,
          size_bytes: Number(p.sizeBytes) || 0,
          width: Number(p.width) || 0,
          height: Number(p.height) || 0,
          checksum: p.checksum || '',
          source_module: p.sourceModule || '',
          source_id: p.sourceId || '',
          meta: p.meta || {},
          updated_at: new Date().toISOString()
        },
        $setOnInsert: {
          _id: id,
          id: id.toHexString(),
          created_at: new Date().toISOString()
        }
      };
      if (p.id) {
        Object.keys(update.$set).forEach(key => {
          const inputKey = {
            file_name: 'fileName',
            file_type: 'fileType',
            mime_type: 'mimeType',
            storage_path: 'storagePath',
            alt_text: 'altText',
            size_bytes: 'sizeBytes',
            user_id: 'userId',
            source_module: 'sourceModule',
            source_id: 'sourceId'
          }[key] || key;
          if (typeof p[inputKey] === 'undefined') delete update.$set[key];
        });
      }
      await db.collection('media_attachments').updateOne(query, update, { upsert: true });
      return mongoDoc(await db.collection('media_attachments').findOne(query._id ? { _id: query._id } : query));
    }

    case 'GET_MEDIA_ATTACHMENT':
      if (p.id) return mongoDoc(await db.collection('media_attachments').findOne(mongoIdQuery(p.id)));
      if (p.sourceModule && p.sourceId) {
        return mongoDoc(await db.collection('media_attachments').findOne({ source_module: p.sourceModule, source_id: p.sourceId }));
      }
      return null;

    case 'LIST_MEDIA_ATTACHMENTS': {
      const query = {};
      if (p.category) query.category = p.category;
      if (p.fileType) query.file_type = p.fileType;
      if (p.mimeType) query.mime_type = p.mimeType;
      if (p.status) query.status = p.status;
      if (p.visibility) query.visibility = p.visibility;
      if (p.folder) query.folder = p.folder;
      if (p.query) {
        const regex = new RegExp(String(p.query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        query.$or = [{ file_name: regex }, { title: regex }, { alt_text: regex }, { caption: regex }];
      }
      return (await db.collection('media_attachments')
        .find(query)
        .sort({ updated_at: -1, _id: -1 })
        .skip(Number(p.offset) || 0)
        .limit(Number(p.limit) || 50)
        .toArray()).map(mongoDoc);
    }

    case 'DELETE_MEDIA_ATTACHMENT':
      await db.collection('media_variants').deleteMany({ attachment_id: String(p.id) });
      await db.collection('media_relations').deleteMany({ attachment_id: String(p.id) });
      await db.collection('media_attachments').deleteOne(mongoIdQuery(p.id));
      return { done: true, id: p.id };

    case 'UPSERT_MEDIA_VARIANT':
      await db.collection('media_variants').updateOne(
        { attachment_id: String(p.attachmentId), variant_key: p.variantKey },
        {
          $set: {
            attachment_id: String(p.attachmentId),
            variant_key: p.variantKey,
            url: p.url || '',
            storage_path: p.storagePath || '',
            mime_type: p.mimeType || '',
            width: Number(p.width) || 0,
            height: Number(p.height) || 0,
            size_bytes: Number(p.sizeBytes) || 0,
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
      return mongoVariantDoc(await db.collection('media_variants').findOne({ attachment_id: String(p.attachmentId), variant_key: p.variantKey }));

    case 'LIST_MEDIA_VARIANTS':
      return (await db.collection('media_variants')
        .find({ attachment_id: String(p.attachmentId) })
        .sort({ variant_key: 1 })
        .toArray()).map(mongoVariantDoc);

    case 'DELETE_MEDIA_VARIANT':
      await db.collection('media_variants').deleteOne({ attachment_id: String(p.attachmentId), variant_key: p.variantKey });
      return { done: true, attachmentId: String(p.attachmentId), variantKey: p.variantKey };

    case 'LINK_MEDIA_ATTACHMENT':
      await db.collection('media_relations').updateOne(
        {
          attachment_id: String(p.attachmentId),
          target_type: p.targetType,
          target_id: String(p.targetId),
          role: p.role || 'inline'
        },
        {
          $set: {
            attachment_id: String(p.attachmentId),
            target_type: p.targetType,
            target_id: String(p.targetId),
            source_module: p.sourceModule || '',
            source_id: p.sourceId || '',
            role: p.role || 'inline',
            sort_order: Number(p.sortOrder) || 0,
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
      return mongoRelationDoc(await db.collection('media_relations').findOne({
        attachment_id: String(p.attachmentId),
        target_type: p.targetType,
        target_id: String(p.targetId),
        role: p.role || 'inline'
      }));

    case 'UNLINK_MEDIA_ATTACHMENT':
      await db.collection('media_relations').deleteOne({
        attachment_id: String(p.attachmentId),
        target_type: p.targetType,
        target_id: String(p.targetId),
        role: p.role || 'inline'
      });
      return { done: true };

    case 'LIST_MEDIA_FOR_CONTENT': {
      const relations = await db.collection('media_relations')
        .find({ target_type: p.targetType, target_id: String(p.targetId) })
        .sort({ sort_order: 1 })
        .toArray();
      const out = [];
      for (const relation of relations) {
        const attachment = await db.collection('media_attachments').findOne(mongoIdQuery(relation.attachment_id));
        if (attachment) {
          out.push({ ...mongoDoc(attachment), role: relation.role, sort_order: relation.sort_order, relation_meta: relation.meta || {} });
        }
      }
      return out;
    }

    case 'LIST_CONTENT_FOR_MEDIA':
      return (await db.collection('media_relations')
        .find({ attachment_id: String(p.attachmentId) })
        .sort({ target_type: 1, target_id: 1 })
        .toArray()).map(mongoRelationDoc);

    default:
      return null;
  }
}

module.exports = {
  handleMediaMongo,
  handleMediaPostgres,
  handleMediaSqlite,
  isMediaPlaceholder
};
