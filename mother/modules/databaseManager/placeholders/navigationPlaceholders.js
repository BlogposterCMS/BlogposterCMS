'use strict';

const { ObjectId } = require('mongodb');

const NAVIGATION_PLACEHOLDERS = new Set([
  'INIT_NAVIGATION_SCHEMA',
  'INIT_NAVIGATION_TABLES',
  'UPSERT_NAVIGATION_LOCATION',
  'LIST_NAVIGATION_LOCATIONS',
  'UPSERT_NAVIGATION_MENU',
  'GET_NAVIGATION_MENU',
  'LIST_NAVIGATION_MENUS',
  'ADD_NAVIGATION_MENU_ITEM',
  'SET_NAVIGATION_MENU_ITEMS',
  'GET_NAVIGATION_MENU_ITEM',
  'LIST_NAVIGATION_MENU_ITEMS',
  'UPDATE_NAVIGATION_MENU_ITEM',
  'DELETE_NAVIGATION_MENU_ITEM'
]);

function isNavigationPlaceholder(operation) {
  return NAVIGATION_PLACEHOLDERS.has(operation);
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
    meta: parseJson(row.meta, {})
  }));
}

function sqliteMenuWhere(p) {
  if (p.menuId) return { where: 'id = ?', values: [p.menuId] };
  if (p.locationKey) return { where: 'location_key = ?', values: [p.locationKey] };
  return { where: 'key = ?', values: [p.key] };
}

function postgresMenuWhere(p) {
  if (p.menuId) return { where: 'id = $1', values: [p.menuId] };
  if (p.locationKey) return { where: 'location_key = $1', values: [p.locationKey] };
  return { where: 'key = $1', values: [p.key] };
}

function itemValues(p) {
  return [
    p.menuId,
    p.parentId || null,
    p.type || 'custom',
    p.title || '',
    p.url || '',
    p.entryId || null,
    p.sourceModule || null,
    p.sourceId || null,
    p.target || '',
    p.rel || '',
    p.cssClass || '',
    Number(p.position) || 0,
    p.status || 'active',
    jsonString(p.meta, {})
  ];
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

function mongoIdQuery(id) {
  const oid = toObjectId(id);
  return oid ? { _id: oid } : { id: String(id) };
}

function mongoMenuQuery(p) {
  if (p.menuId) return mongoIdQuery(p.menuId);
  if (p.locationKey) return { location_key: p.locationKey };
  return { key: p.key };
}

function mongoItemDoc(p, id = new ObjectId()) {
  const now = new Date();
  return {
    _id: id,
    id: id.toHexString(),
    menu_id: String(p.menuId),
    parent_id: p.parentId ? String(p.parentId) : null,
    type: p.type || 'custom',
    title: p.title || '',
    url: p.url || '',
    entry_id: p.entryId || null,
    source_module: p.sourceModule || null,
    source_id: p.sourceId || null,
    target: p.target || '',
    rel: p.rel || '',
    css_class: p.cssClass || '',
    position: Number(p.position) || 0,
    status: p.status || 'active',
    meta: p.meta || {},
    deleted_at: null,
    created_at: now,
    updated_at: now
  };
}

async function insertSqliteItem(db, p) {
  const insert = await db.run(`
    INSERT INTO navigationManager_navigation_items
      (menu_id, parent_id, type, title, url, entry_id, source_module, source_id,
       target, rel, css_class, position, status, meta, created_at, updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  `, itemValues(p));
  return normalizeRows(await db.get('SELECT * FROM navigationManager_navigation_items WHERE id = ?', [insert.lastID]))[0];
}

async function insertPostgresItem(client, p) {
  const { rows } = await client.query(`
    INSERT INTO navigationManager.navigation_items
      (menu_id, parent_id, type, title, url, entry_id, source_module, source_id,
       target, rel, css_class, position, status, meta, created_at, updated_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,NOW(),NOW())
    RETURNING *;
  `, itemValues(p));
  return normalizeRows(rows)[0] || null;
}

async function handleNavigationSqlite(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_NAVIGATION_SCHEMA':
      return { done: true };

    case 'INIT_NAVIGATION_TABLES':
      await db.exec(`
        CREATE TABLE IF NOT EXISTS navigationManager_navigation_locations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          label TEXT NOT NULL,
          description TEXT DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS navigationManager_navigation_menus (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          label TEXT NOT NULL,
          description TEXT DEFAULT '',
          location_key TEXT DEFAULT '',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS navigationManager_navigation_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          menu_id TEXT NOT NULL,
          parent_id TEXT,
          type TEXT DEFAULT 'custom',
          title TEXT NOT NULL,
          url TEXT DEFAULT '',
          entry_id TEXT,
          source_module TEXT,
          source_id TEXT,
          target TEXT DEFAULT '',
          rel TEXT DEFAULT '',
          css_class TEXT DEFAULT '',
          position INTEGER DEFAULT 0,
          status TEXT DEFAULT 'active',
          meta TEXT DEFAULT '{}',
          deleted_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await db.run('CREATE INDEX IF NOT EXISTS navigation_menus_location ON navigationManager_navigation_menus(location_key);');
      await db.run('CREATE INDEX IF NOT EXISTS navigation_items_menu_status_position ON navigationManager_navigation_items(menu_id, status, position, id);');
      await db.run('CREATE INDEX IF NOT EXISTS navigation_items_parent_position ON navigationManager_navigation_items(parent_id, position, id);');
      return { done: true };

    case 'UPSERT_NAVIGATION_LOCATION':
      await db.run(`
        INSERT INTO navigationManager_navigation_locations(key, label, description, created_at, updated_at)
        VALUES(?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          label=excluded.label,
          description=excluded.description,
          updated_at=CURRENT_TIMESTAMP;
      `, [p.key, p.label, p.description || '']);
      return normalizeRows(await db.get('SELECT * FROM navigationManager_navigation_locations WHERE key = ?', [p.key]))[0];

    case 'LIST_NAVIGATION_LOCATIONS':
      return normalizeRows(await db.all('SELECT * FROM navigationManager_navigation_locations ORDER BY key ASC'));

    case 'UPSERT_NAVIGATION_MENU':
      await db.run(`
        INSERT INTO navigationManager_navigation_menus(key, label, description, location_key, created_at, updated_at)
        VALUES(?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          label=excluded.label,
          description=excluded.description,
          location_key=excluded.location_key,
          updated_at=CURRENT_TIMESTAMP;
      `, [p.key, p.label, p.description || '', p.locationKey || '']);
      return normalizeRows(await db.get('SELECT * FROM navigationManager_navigation_menus WHERE key = ?', [p.key]))[0];

    case 'GET_NAVIGATION_MENU': {
      const { where, values } = sqliteMenuWhere(p);
      return normalizeRows(await db.get(`SELECT * FROM navigationManager_navigation_menus WHERE ${where} ORDER BY id ASC LIMIT 1`, values))[0] || null;
    }

    case 'LIST_NAVIGATION_MENUS': {
      if (p.locationKey) {
        return normalizeRows(await db.all('SELECT * FROM navigationManager_navigation_menus WHERE location_key = ? ORDER BY key ASC', [p.locationKey]));
      }
      return normalizeRows(await db.all('SELECT * FROM navigationManager_navigation_menus ORDER BY key ASC'));
    }

    case 'ADD_NAVIGATION_MENU_ITEM':
      return insertSqliteItem(db, p);

    case 'SET_NAVIGATION_MENU_ITEMS': {
      await db.run('UPDATE navigationManager_navigation_items SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE menu_id = ? AND deleted_at IS NULL', [p.menuId]);
      const inserted = [];
      for (const item of (Array.isArray(p.items) ? p.items : [])) {
        inserted.push(await insertSqliteItem(db, { ...item, menuId: p.menuId }));
      }
      return { done: true, count: inserted.length, items: inserted };
    }

    case 'GET_NAVIGATION_MENU_ITEM':
      return normalizeRows(await db.get('SELECT * FROM navigationManager_navigation_items WHERE id = ? AND deleted_at IS NULL', [p.itemId]))[0] || null;

    case 'LIST_NAVIGATION_MENU_ITEMS': {
      const values = [p.menuId];
      let statusClause = '';
      if (p.status) {
        statusClause = ' AND status = ?';
        values.push(p.status);
      }
      return normalizeRows(await db.all(
        `SELECT * FROM navigationManager_navigation_items WHERE menu_id = ? AND deleted_at IS NULL${statusClause} ORDER BY position ASC, id ASC`,
        values
      ));
    }

    case 'UPDATE_NAVIGATION_MENU_ITEM':
      await db.run(`
        UPDATE navigationManager_navigation_items
           SET parent_id=?, type=?, title=?, url=?, entry_id=?, source_module=?, source_id=?,
               target=?, rel=?, css_class=?, position=?, status=?, meta=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=? AND deleted_at IS NULL;
      `, [
        p.parentId || null,
        p.type || 'custom',
        p.title || '',
        p.url || '',
        p.entryId || null,
        p.sourceModule || null,
        p.sourceId || null,
        p.target || '',
        p.rel || '',
        p.cssClass || '',
        Number(p.position) || 0,
        p.status || 'active',
        jsonString(p.meta, {}),
        p.itemId
      ]);
      return normalizeRows(await db.get('SELECT * FROM navigationManager_navigation_items WHERE id = ?', [p.itemId]))[0] || null;

    case 'DELETE_NAVIGATION_MENU_ITEM':
      await db.run(
        'UPDATE navigationManager_navigation_items SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL',
        [p.itemId]
      );
      return { done: true, itemId: p.itemId };

    default:
      return null;
  }
}

async function handleNavigationPostgres(client, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_NAVIGATION_SCHEMA':
      await client.query('CREATE SCHEMA IF NOT EXISTS navigationManager;');
      return { done: true };

    case 'INIT_NAVIGATION_TABLES':
      await client.query(`
        CREATE TABLE IF NOT EXISTS navigationManager.navigation_locations (
          id SERIAL PRIMARY KEY,
          key TEXT NOT NULL UNIQUE,
          label TEXT NOT NULL,
          description TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS navigationManager.navigation_menus (
          id SERIAL PRIMARY KEY,
          key TEXT NOT NULL UNIQUE,
          label TEXT NOT NULL,
          description TEXT DEFAULT '',
          location_key TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS navigationManager.navigation_items (
          id SERIAL PRIMARY KEY,
          menu_id TEXT NOT NULL,
          parent_id TEXT,
          type TEXT DEFAULT 'custom',
          title TEXT NOT NULL,
          url TEXT DEFAULT '',
          entry_id TEXT,
          source_module TEXT,
          source_id TEXT,
          target TEXT DEFAULT '',
          rel TEXT DEFAULT '',
          css_class TEXT DEFAULT '',
          position INT DEFAULT 0,
          status TEXT DEFAULT 'active',
          meta JSONB DEFAULT '{}'::jsonb,
          deleted_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
      await client.query('CREATE INDEX IF NOT EXISTS navigation_menus_location ON navigationManager.navigation_menus(location_key);');
      await client.query('CREATE INDEX IF NOT EXISTS navigation_items_menu_status_position ON navigationManager.navigation_items(menu_id, status, position, id);');
      await client.query('CREATE INDEX IF NOT EXISTS navigation_items_parent_position ON navigationManager.navigation_items(parent_id, position, id);');
      return { done: true };

    case 'UPSERT_NAVIGATION_LOCATION': {
      const { rows } = await client.query(`
        INSERT INTO navigationManager.navigation_locations(key, label, description, created_at, updated_at)
        VALUES($1,$2,$3,NOW(),NOW())
        ON CONFLICT(key) DO UPDATE SET
          label=EXCLUDED.label,
          description=EXCLUDED.description,
          updated_at=NOW()
        RETURNING *;
      `, [p.key, p.label, p.description || '']);
      return normalizeRows(rows)[0] || null;
    }

    case 'LIST_NAVIGATION_LOCATIONS': {
      const { rows } = await client.query('SELECT * FROM navigationManager.navigation_locations ORDER BY key ASC');
      return normalizeRows(rows);
    }

    case 'UPSERT_NAVIGATION_MENU': {
      const { rows } = await client.query(`
        INSERT INTO navigationManager.navigation_menus(key, label, description, location_key, created_at, updated_at)
        VALUES($1,$2,$3,$4,NOW(),NOW())
        ON CONFLICT(key) DO UPDATE SET
          label=EXCLUDED.label,
          description=EXCLUDED.description,
          location_key=EXCLUDED.location_key,
          updated_at=NOW()
        RETURNING *;
      `, [p.key, p.label, p.description || '', p.locationKey || '']);
      return normalizeRows(rows)[0] || null;
    }

    case 'GET_NAVIGATION_MENU': {
      const { where, values } = postgresMenuWhere(p);
      const { rows } = await client.query(`SELECT * FROM navigationManager.navigation_menus WHERE ${where} ORDER BY id ASC LIMIT 1`, values);
      return normalizeRows(rows)[0] || null;
    }

    case 'LIST_NAVIGATION_MENUS': {
      const sql = p.locationKey
        ? 'SELECT * FROM navigationManager.navigation_menus WHERE location_key = $1 ORDER BY key ASC'
        : 'SELECT * FROM navigationManager.navigation_menus ORDER BY key ASC';
      const { rows } = await client.query(sql, p.locationKey ? [p.locationKey] : []);
      return normalizeRows(rows);
    }

    case 'ADD_NAVIGATION_MENU_ITEM':
      return insertPostgresItem(client, p);

    case 'SET_NAVIGATION_MENU_ITEMS': {
      await client.query('UPDATE navigationManager.navigation_items SET deleted_at = NOW(), updated_at = NOW() WHERE menu_id = $1 AND deleted_at IS NULL', [p.menuId]);
      const inserted = [];
      for (const item of (Array.isArray(p.items) ? p.items : [])) {
        inserted.push(await insertPostgresItem(client, { ...item, menuId: p.menuId }));
      }
      return { done: true, count: inserted.length, items: inserted };
    }

    case 'GET_NAVIGATION_MENU_ITEM': {
      const { rows } = await client.query('SELECT * FROM navigationManager.navigation_items WHERE id = $1 AND deleted_at IS NULL', [p.itemId]);
      return normalizeRows(rows)[0] || null;
    }

    case 'LIST_NAVIGATION_MENU_ITEMS': {
      const values = [p.menuId];
      let statusClause = '';
      if (p.status) {
        values.push(p.status);
        statusClause = ` AND status = $${values.length}`;
      }
      const { rows } = await client.query(
        `SELECT * FROM navigationManager.navigation_items WHERE menu_id = $1 AND deleted_at IS NULL${statusClause} ORDER BY position ASC, id ASC`,
        values
      );
      return normalizeRows(rows);
    }

    case 'UPDATE_NAVIGATION_MENU_ITEM': {
      const { rows } = await client.query(`
        UPDATE navigationManager.navigation_items
           SET parent_id=$1, type=$2, title=$3, url=$4, entry_id=$5, source_module=$6,
               source_id=$7, target=$8, rel=$9, css_class=$10, position=$11,
               status=$12, meta=$13::jsonb, updated_at=NOW()
         WHERE id=$14 AND deleted_at IS NULL
         RETURNING *;
      `, [
        p.parentId || null,
        p.type || 'custom',
        p.title || '',
        p.url || '',
        p.entryId || null,
        p.sourceModule || null,
        p.sourceId || null,
        p.target || '',
        p.rel || '',
        p.cssClass || '',
        Number(p.position) || 0,
        p.status || 'active',
        jsonString(p.meta, {}),
        p.itemId
      ]);
      return normalizeRows(rows)[0] || null;
    }

    case 'DELETE_NAVIGATION_MENU_ITEM':
      await client.query(
        'UPDATE navigationManager.navigation_items SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1 AND deleted_at IS NULL',
        [p.itemId]
      );
      return { done: true, itemId: p.itemId };

    default:
      return null;
  }
}

async function handleNavigationMongo(db, operation, params = {}) {
  const p = paramsObject(params);
  switch (operation) {
    case 'INIT_NAVIGATION_SCHEMA':
      return { done: true };

    case 'INIT_NAVIGATION_TABLES':
      await db.createCollection('navigation_locations').catch(() => {});
      await db.createCollection('navigation_menus').catch(() => {});
      await db.createCollection('navigation_items').catch(() => {});
      await db.collection('navigation_locations').createIndex({ key: 1 }, { unique: true }).catch(() => {});
      await db.collection('navigation_menus').createIndex({ key: 1 }, { unique: true }).catch(() => {});
      await db.collection('navigation_menus').createIndex({ location_key: 1 }).catch(() => {});
      await db.collection('navigation_items').createIndex({ menu_id: 1, status: 1, position: 1 }).catch(() => {});
      await db.collection('navigation_items').createIndex({ parent_id: 1, position: 1 }).catch(() => {});
      return { done: true };

    case 'UPSERT_NAVIGATION_LOCATION':
      await db.collection('navigation_locations').updateOne(
        { key: p.key },
        {
          $set: { key: p.key, label: p.label, description: p.description || '', updated_at: new Date() },
          $setOnInsert: { created_at: new Date() }
        },
        { upsert: true }
      );
      return mongoDoc(await db.collection('navigation_locations').findOne({ key: p.key }));

    case 'LIST_NAVIGATION_LOCATIONS':
      return (await db.collection('navigation_locations').find({}).sort({ key: 1 }).toArray()).map(mongoDoc);

    case 'UPSERT_NAVIGATION_MENU':
      await db.collection('navigation_menus').updateOne(
        { key: p.key },
        {
          $set: {
            key: p.key,
            label: p.label,
            description: p.description || '',
            location_key: p.locationKey || '',
            updated_at: new Date()
          },
          $setOnInsert: { created_at: new Date() }
        },
        { upsert: true }
      );
      return mongoDoc(await db.collection('navigation_menus').findOne({ key: p.key }));

    case 'GET_NAVIGATION_MENU':
      return mongoDoc(await db.collection('navigation_menus').findOne(mongoMenuQuery(p), { sort: { _id: 1 } }));

    case 'LIST_NAVIGATION_MENUS': {
      const query = p.locationKey ? { location_key: p.locationKey } : {};
      return (await db.collection('navigation_menus').find(query).sort({ key: 1 }).toArray()).map(mongoDoc);
    }

    case 'ADD_NAVIGATION_MENU_ITEM': {
      const doc = mongoItemDoc(p);
      await db.collection('navigation_items').insertOne(doc);
      return mongoDoc(doc);
    }

    case 'SET_NAVIGATION_MENU_ITEMS': {
      await db.collection('navigation_items').updateMany(
        { menu_id: String(p.menuId), deleted_at: null },
        { $set: { deleted_at: new Date(), updated_at: new Date() } }
      );
      const docs = (Array.isArray(p.items) ? p.items : []).map(item => mongoItemDoc({ ...item, menuId: p.menuId }));
      if (docs.length) await db.collection('navigation_items').insertMany(docs);
      return { done: true, count: docs.length, items: docs.map(mongoDoc) };
    }

    case 'GET_NAVIGATION_MENU_ITEM':
      return mongoDoc(await db.collection('navigation_items').findOne({ ...mongoIdQuery(p.itemId), deleted_at: null }));

    case 'LIST_NAVIGATION_MENU_ITEMS': {
      const query = { menu_id: String(p.menuId), deleted_at: null };
      if (p.status) query.status = p.status;
      return (await db.collection('navigation_items')
        .find(query)
        .sort({ position: 1, _id: 1 })
        .toArray()).map(mongoDoc);
    }

    case 'UPDATE_NAVIGATION_MENU_ITEM': {
      await db.collection('navigation_items').updateOne(mongoIdQuery(p.itemId), {
        $set: {
          parent_id: p.parentId ? String(p.parentId) : null,
          type: p.type || 'custom',
          title: p.title || '',
          url: p.url || '',
          entry_id: p.entryId || null,
          source_module: p.sourceModule || null,
          source_id: p.sourceId || null,
          target: p.target || '',
          rel: p.rel || '',
          css_class: p.cssClass || '',
          position: Number(p.position) || 0,
          status: p.status || 'active',
          meta: p.meta || {},
          updated_at: new Date()
        }
      });
      return mongoDoc(await db.collection('navigation_items').findOne(mongoIdQuery(p.itemId)));
    }

    case 'DELETE_NAVIGATION_MENU_ITEM':
      await db.collection('navigation_items').updateOne(mongoIdQuery(p.itemId), {
        $set: { deleted_at: new Date(), updated_at: new Date() }
      });
      return { done: true, itemId: p.itemId };

    default:
      return null;
  }
}

module.exports = {
  handleNavigationMongo,
  handleNavigationPostgres,
  handleNavigationSqlite,
  isNavigationPlaceholder
};
