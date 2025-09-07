const sqlite3 = require('sqlite3').verbose();

function promisifyDbMethods(db) {
  return {
    run: (...args) => new Promise((resolve, reject) => {
      db.run(...args, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    }),
    get: (...args) => new Promise((resolve, reject) => {
      db.get(...args, (err, row) => (err ? reject(err) : resolve(row)));
    }),
    all: (...args) => new Promise((resolve, reject) => {
      db.all(...args, (err, rows) => (err ? reject(err) : resolve(rows)));
    }),
    exec: (sql) => new Promise((resolve, reject) => {
      db.exec(sql, err => (err ? reject(err) : resolve()));
    }),
    close: () => new Promise((resolve, reject) => db.close(err => (err ? reject(err) : resolve())))
  };
}

test('handleSaveDesignPlaceholder updates existing design by ID', async () => {
  process.env.CONTENT_DB_TYPE = 'sqlite';
  const rawDb = new sqlite3.Database(':memory:');
  const db = promisifyDbMethods(rawDb);

  await db.exec(`CREATE TABLE designer_designs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    thumbnail TEXT,
    bg_color TEXT,
      bg_media_id TEXT,
      bg_media_url TEXT,
      created_at TEXT,
      updated_at TEXT,
      published_at TEXT,
      owner_id TEXT,
      version INTEGER,
      is_draft INTEGER,
      layout_id INTEGER,
      is_layout INTEGER,
      is_global INTEGER
    );`);
  await db.exec(`CREATE TABLE designer_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    design_id INTEGER,
    layout_json TEXT,
    created_at TEXT
  );`);
  await db.exec(`CREATE TABLE designer_design_widgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    design_id INTEGER,
    instance_id TEXT,
    widget_id TEXT,
    x_percent REAL,
    y_percent REAL,
    w_percent REAL,
    h_percent REAL,
    z_index INTEGER,
    rotation_deg REAL,
    opacity REAL
  );`);
  await db.exec(`CREATE TABLE designer_widget_meta (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    design_id INTEGER,
    instance_id TEXT,
    html TEXT,
    css TEXT,
    js TEXT,
    metadata TEXT
  );`);
  await db.exec(`CREATE TABLE designer_layouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    layout_json TEXT,
    is_global INTEGER,
    created_at TEXT,
    updated_at TEXT
  );`);

  const { handleSaveDesignPlaceholder } = require('../modules/designer/dbPlaceholders');

  const first = await handleSaveDesignPlaceholder({
    dbClient: db,
    params: [{ design: { title: 'First', owner_id: 'u1', version: 0 }, widgets: [], layout: {} }]
  });
  expect(first.id).toBeDefined();
  expect(first.version).toBe(1);

  const second = await handleSaveDesignPlaceholder({
    dbClient: db,
    params: [{ design: { id: first.id, title: 'Updated', owner_id: 'u1', version: first.version }, widgets: [], layout: {} }]
  });
  expect(second.id).toBe(first.id);
  expect(second.version).toBe(2);

  const rows = await db.all('SELECT id, title, version FROM designer_designs;');
  expect(rows).toHaveLength(1);
  expect(rows[0].title).toBe('Updated');
  expect(rows[0].version).toBe(2);

  const layouts = await db.all('SELECT id, layout_json FROM designer_layouts;');
  expect(layouts.length).toBeGreaterThan(0);

  await db.close();
});
