/* mother/modules/databaseManager/placeholders/sqlitePlaceholders.js
 *
 * SQLite‐flavoured placeholder handler.
 * Keeps the same public contract as the Postgres version:
 *   await handleBuiltInPlaceholderSqlite(db, operation, params)
 *
 * Assumptions
 * ──────────────────────────────────────────────────────────────
 * • `db` is a SQLite instance exposing `run / all / get / exec`,
 *   i.e. similar to better-sqlite3 or the `sqlite3` promise API.
 * • Foreign keys are desired → we turn them on for every connection.
 * • Schemas don’t exist in SQLite; we encode the “schema” as a prefix
 *   in the table name (e.g.  pagesManager.pages  →  pagesManager_pages).
 * • JSON gets stored as TEXT. Booleans are INTEGER (0/1).
 */

const notificationEmitter = require('../../../emitters/notificationEmitter');

async function handleBuiltInPlaceholderSqlite(db, operation, params) {
  // Ensure FK support – harmless if run repeatedly
  await db.run('PRAGMA foreign_keys = ON;');

  switch (operation) {
    // ────────────────────────────────────────────────────────────────
    // USER MANAGEMENT
    // ────────────────────────────────────────────────────────────────
    case 'INIT_USER_MANAGEMENT': {
      await db.exec(`
        /* === usermanagement_users ================================ */
        CREATE TABLE IF NOT EXISTS usermanagement_users (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          username      TEXT    NOT NULL UNIQUE,
          email         TEXT    UNIQUE,
          password      TEXT    NOT NULL,
          first_name    TEXT,
          last_name     TEXT,
          display_name  TEXT,
          ui_color     TEXT,
          phone         TEXT,
          company       TEXT,
          website       TEXT,
          avatar_url    TEXT,
          bio           TEXT,
          token_version INTEGER DEFAULT 0,
          created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        /* === usermanagement_roles ================================ */
        CREATE TABLE IF NOT EXISTS usermanagement_roles (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          role_name     TEXT    NOT NULL UNIQUE,
          is_system_role INTEGER DEFAULT 0,       -- BOOLEAN (0/1)
          description   TEXT,
          permissions   TEXT    DEFAULT '{}',     -- JSON as TEXT
          created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        /* === usermanagement_user_roles =========================== */
        CREATE TABLE IF NOT EXISTS usermanagement_user_roles (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id    INTEGER NOT NULL,
          role_id    INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES usermanagement_users(id) ON DELETE CASCADE,
          FOREIGN KEY (role_id) REFERENCES usermanagement_roles(id) ON DELETE CASCADE
        );

        /* === usermanagement_permissions =========================== */
        CREATE TABLE IF NOT EXISTS usermanagement_permissions (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          permission_key TEXT    NOT NULL UNIQUE,
          description    TEXT,
          created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      return { done: true };
    }

    case 'INIT_B2B_FIELDS': {
      const tableInfo = await db.all(`PRAGMA table_info(usermanagement_users);`);
      const hasCompany = tableInfo.some(col => col.name === 'company_name');
      const hasVat = tableInfo.some(col => col.name === 'vat_number');
      if (!hasCompany) {
        await db.run(`ALTER TABLE usermanagement_users ADD COLUMN company_name TEXT;`);
      }
      if (!hasVat) {
        await db.run(`ALTER TABLE usermanagement_users ADD COLUMN vat_number TEXT;`);
      }
      return { done: true };
    }

    case 'ADD_USER_FIELD': {
      const fieldName = (params?.fieldName ?? 'extra_field').replace(/[^a-zA-Z0-9_]/g, '');
      const fieldType = params?.fieldType ?? 'TEXT';
      const info = await db.all(`PRAGMA table_info(usermanagement_users);`);
      const exists = info.some(col => col.name === fieldName);
      if (!exists) {
        await db.run(`ALTER TABLE usermanagement_users ADD COLUMN "${fieldName}" ${fieldType};`);
      }
      return { done: true };
    }

    // ────────────────────────────────────────────────────────────────
    // SETTINGS MANAGER
    // ────────────────────────────────────────────────────────────────
    case 'INIT_SETTINGS_SCHEMA': {
      /* noop – schemas don’t exist in SQLite */
      return { done: true };
    }

    case 'INIT_SETTINGS_TABLES': {
      await db.exec(`
        /* === settingsManager_cms_settings ========================= */
        CREATE TABLE IF NOT EXISTS settingsManager_cms_settings (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          key        TEXT NOT NULL UNIQUE,
          value      TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        /* === settingsManager_module_events ======================== */
        CREATE TABLE IF NOT EXISTS settingsManager_module_events (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          event_name TEXT,
          data       TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        INSERT INTO settingsManager_cms_settings (key, value, created_at, updated_at)
          VALUES ('FIRST_INSTALL_DONE', 'false', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO NOTHING;
      `);
      return { done: true };
    }

    case 'CHECK_AND_ALTER_SETTINGS_TABLES': {
      const cols = await db.all(`PRAGMA table_info(settingsManager_cms_settings);`);
      const hasCol = Array.isArray(cols) && cols.some(c => c.name === 'something_else');
      if (!hasCol) {
        try {
          await db.run(`ALTER TABLE settingsManager_cms_settings ADD COLUMN something_else TEXT;`);
        } catch (e) {
          /* older SQLite versions may not support IF NOT EXISTS; ignore duplicate column errors */
          if (!/duplicate column/i.test(String(e.message))) throw e;
        }
      }
      return { done: true };
    }

    case 'GET_SETTING': {
      const settingKey = params?.[0];
      await db.exec(`
        CREATE TABLE IF NOT EXISTS settingsManager_cms_settings (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          key        TEXT NOT NULL UNIQUE,
          value      TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      const row = await db.get(
        `SELECT value FROM settingsManager_cms_settings WHERE key = ? LIMIT 1;`,
        [settingKey]
      );
      return row ? [row] : [];
    }

    case 'UPSERT_SETTING': {
      const [settingKey, settingValue] = params;
      await db.exec(`
        CREATE TABLE IF NOT EXISTS settingsManager_cms_settings (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          key        TEXT NOT NULL UNIQUE,
          value      TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      await db.run(
        `INSERT INTO settingsManager_cms_settings (key, value, created_at, updated_at)
           VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           ON CONFLICT(key)
           DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;`,
        [settingKey, settingValue]
      );
      return { done: true };
    }

    case 'GET_ALL_SETTINGS': {
      await db.exec(`
        CREATE TABLE IF NOT EXISTS settingsManager_cms_settings (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          key        TEXT NOT NULL UNIQUE,
          value      TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      const rows = await db.all(`SELECT key, value FROM settingsManager_cms_settings ORDER BY id ASC;`);
      return rows;
    }

    // ────────────────────────────────────────────────────────────────
    // PAGES MANAGER
    // ────────────────────────────────────────────────────────────────
    case 'INIT_PAGES_SCHEMA': {
      /* noop – schemas don’t exist */
      return { done: true };
    }

    case 'INIT_PAGES_TABLE': {
      await db.exec(`
        /* === pagesManager_pages =================================== */
        CREATE TABLE IF NOT EXISTS pagesManager_pages (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          parent_id   INTEGER REFERENCES pagesManager_pages(id) ON DELETE SET NULL,
          is_content  INTEGER DEFAULT 0,
          is_start    INTEGER DEFAULT 0,
          slug        TEXT NOT NULL,
          lane        TEXT NOT NULL DEFAULT 'public',
          status      TEXT DEFAULT 'draft',
          seo_image   TEXT,
          language    TEXT DEFAULT 'en',
          created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
          title       TEXT,
          meta        TEXT,      -- JSON as TEXT
          weight      INTEGER DEFAULT 0,
          UNIQUE (slug, lane)
        );

        /* === pagesManager_page_translations ====================== */
        CREATE TABLE IF NOT EXISTS pagesManager_page_translations (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          page_id       INTEGER REFERENCES pagesManager_pages(id) ON DELETE CASCADE,
          language      TEXT,
          title         TEXT,
          html          TEXT,
          css           TEXT,
          meta_desc     TEXT,
          seo_title     TEXT,
          seo_keywords  TEXT,
          created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (page_id, language)
        );

        /* one start page per language */
        CREATE UNIQUE INDEX IF NOT EXISTS pages_start_unique
          ON pagesManager_pages(language)
          WHERE is_start = 1;
      `);
      await db.run(`CREATE INDEX IF NOT EXISTS pages_lane_weight_created_at ON pagesManager_pages (lane, weight, created_at DESC);`);
      await db.run(`CREATE INDEX IF NOT EXISTS pages_parent_weight_created_at ON pagesManager_pages (parent_id, weight, created_at DESC);`);
      return { done: true };
    }

    case 'CHECK_AND_ALTER_PAGES_TABLE': {
      const cols = await db.all(`PRAGMA table_info(pagesManager_pages);`);
      const names = Array.isArray(cols) ? cols.map(c => c.name) : [];
      const addCol = async (name, def) => {
        if (!names.includes(name)) {
          try {
            await db.run(`ALTER TABLE pagesManager_pages ADD COLUMN ${def};`);
          } catch (e) {
            if (!/duplicate column/i.test(String(e.message))) throw e;
          }
        }
      };
      await addCol('slug', 'slug TEXT NOT NULL');
      await addCol('parent_id', 'parent_id INTEGER');
      await addCol('language', "language TEXT DEFAULT 'en'");
      await addCol('is_content', 'is_content INTEGER DEFAULT 0');
      await addCol('lane', "lane TEXT NOT NULL DEFAULT 'public'");
      await addCol('title', 'title TEXT');
      await addCol('meta', 'meta TEXT');
      await addCol('weight', 'weight INTEGER DEFAULT 0');
      await db.run(`UPDATE pagesManager_pages SET weight = 0 WHERE weight IS NULL;`);
      await db.run(`DROP INDEX IF EXISTS pages_slug_unique;`);
      await db.run(`CREATE UNIQUE INDEX IF NOT EXISTS pages_slug_lane_unique ON pagesManager_pages (slug, lane);`);
      await db.run(`CREATE INDEX IF NOT EXISTS pages_lane_weight_created_at ON pagesManager_pages (lane, weight, created_at DESC);`);
      await db.run(`CREATE INDEX IF NOT EXISTS pages_parent_weight_created_at ON pagesManager_pages (parent_id, weight, created_at DESC);`);
      return { done: true };
    }

    case 'CREATE_PAGE': {
      const p = Array.isArray(params) ? (params[0] || {}) : (params || {});
      const {
        slug,
        status = 'draft',
        seo_image = '',
        translations = [],
        parent_id = null,
        is_content = 0,
        lane = 'public',
        language = 'en',
        title = '',
        meta = null,
        weight = 0
      } = p;

      const metaVal = (meta && typeof meta === 'object') ? JSON.stringify(meta) : meta;
      const weightVal = Number(weight) || 0;

      const { lastID: pageId } = await db.run(`
        INSERT INTO pagesManager_pages
          (title, meta, weight, slug, status, seo_image, is_start, parent_id, is_content, language, lane,
           created_at, updated_at)
        VALUES (?,?,?,?,?,?,0,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
      `, [title, metaVal, weightVal, slug, status, seo_image, parent_id, is_content, language, lane]);

      for (const t of translations) {
        await db.run(`
          INSERT INTO pagesManager_page_translations
            (page_id, language, title, html, css, meta_desc, seo_title, seo_keywords,
             created_at, updated_at)
          VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
        `, [
          pageId,
          t.language,
          t.title,
          t.html,
          t.css,
          t.metaDesc,
          t.seoTitle,
          t.seoKeywords
        ]);
      }

      return { done: true, insertedId: pageId };
    }

    case 'GET_PAGES_BY_LANE': {
      let laneVal;
      let lang = 'en';
      if (Array.isArray(params)) {
        const first = params[0];
        laneVal = typeof first === 'object' ? first.lane : first;
        if (first && typeof first === 'object' && first.language) lang = first.language;
      } else if (params && typeof params === 'object') {
        laneVal = params.lane ?? params;
        if (params.language) lang = params.language;
      } else {
        laneVal = params;
      }
      lang = String(lang).toLowerCase();

      const rows = await db.all(`
        SELECT p.*, parent.slug AS parentSlug,
               t.language   AS trans_lang,
               t.title      AS trans_title,
               t.html       AS trans_html,
               t.css        AS trans_css,
               t.meta_desc,
               t.seo_title,
               t.seo_keywords
          FROM pagesManager_pages           p
          LEFT JOIN pagesManager_pages parent
                ON p.parent_id = parent.id
          LEFT JOIN pagesManager_page_translations t
                ON p.id = t.page_id AND t.language = ?
         WHERE p.lane = ?
         ORDER BY p.weight ASC, p.created_at DESC;
      `, [lang, laneVal]);

      for (const r of rows) {
        if (typeof r.meta === 'string') {
          try { r.meta = JSON.parse(r.meta); } catch { r.meta = null; }
        }
      }

      return rows;
    }

    case 'ADD_PARENT_CHILD_RELATION': {
      await db.run(`
        ALTER TABLE pagesManager_pages
          ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES pagesManager_pages(id) ON DELETE SET NULL;
      `);
      return { done: true };
    }

    case 'GET_CHILD_PAGES': {
      const parentId = params?.[0];
      const rows = await db.all(`
        SELECT * FROM pagesManager_pages
         WHERE parent_id = ?
         ORDER BY weight ASC, created_at DESC;
      `, [parentId]);

      for (const r of rows) {
        if (typeof r.meta === 'string') {
          try { r.meta = JSON.parse(r.meta); } catch { r.meta = null; }
        }
      }

      return rows;
    }

    case 'GET_ALL_PAGES': {
      const rows = await db.all(`SELECT * FROM pagesManager_pages ORDER BY weight ASC, id DESC;`);

      for (const r of rows) {
        if (typeof r.meta === 'string') {
          try { r.meta = JSON.parse(r.meta); } catch { r.meta = null; }
        }
      }

      return rows;
    }

    case 'GET_PAGE_BY_ID': {
      const pageId = params?.[0];
      const lang   = params?.[1] ?? 'en';

      const row = await db.get(`
        SELECT p.*, parent.slug AS parentSlug,
               t.language AS trans_lang,
               t.title    AS trans_title,
               t.html,
               t.css,
               t.meta_desc,
               t.seo_title,
               t.seo_keywords
          FROM pagesManager_pages p
          LEFT JOIN pagesManager_pages parent
                ON p.parent_id = parent.id
          LEFT JOIN pagesManager_page_translations t
                ON p.id = t.page_id AND t.language = ?
         WHERE p.id = ?;
      `, [lang, pageId]);

      if (row && typeof row.meta === 'string') {
        try { row.meta = JSON.parse(row.meta); } catch { row.meta = null; }
      }

      return row || null;
    }

    case 'GET_PAGE_BY_SLUG': {
      const [slug, lane = 'public', lang = 'en'] = params;
      const rows = await db.all(`
        SELECT p.*, parent.slug AS parentSlug,
               t.language AS trans_lang,
               t.title    AS trans_title,
               t.html,
               t.css,
               t.meta_desc,
               t.seo_title,
               t.seo_keywords
          FROM pagesManager_pages p
          LEFT JOIN pagesManager_pages parent
                ON p.parent_id = parent.id
          LEFT JOIN pagesManager_page_translations t
                ON p.id = t.page_id AND t.language = ?
         WHERE p.slug = ?
           AND p.lane = ?;
      `, [lang, slug, lane]);

      const row = rows[0];
      if (row && typeof row.meta === 'string') {
        try { row.meta = JSON.parse(row.meta); } catch { row.meta = null; }
      }

      return row || null;
    }

    case 'UPDATE_PAGE': {
      const p = Array.isArray(params) ? (params[0] || {}) : (params || {});
      const {
        pageId,
        slug,
        status,
        seo_image,
        translations = [],
        parent_id,
        is_content = 0,
        lane = 'public',
        language = 'en',
        title = '',
        meta = null,
        weight
      } = p;

      const metaVal = (meta && typeof meta === 'object') ? JSON.stringify(meta) : meta;
      const hasWeight = Object.prototype.hasOwnProperty.call(p, 'weight');
      const weightVal = hasWeight ? Number(weight) || 0 : null;

      await db.run(`
        UPDATE pagesManager_pages
           SET title      = ?,
               meta       = ?,
               weight     = COALESCE(?, weight),
               slug       = ?,
               status     = ?,
               seo_image  = ?,
               parent_id  = ?,
               is_content = ?,
               lane       = ?,
               language   = ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?;
      `, [title, metaVal, weightVal, slug, status, seo_image, parent_id, is_content, lane, language, pageId]);

      for (const t of translations) {
        await db.run(`
          INSERT INTO pagesManager_page_translations
                (page_id, language, title, html, css, meta_desc,
                 seo_title, seo_keywords, updated_at)
          VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
          ON CONFLICT(page_id, language) DO UPDATE SET
            title       = excluded.title,
            html        = excluded.html,
            css         = excluded.css,
            meta_desc   = excluded.meta_desc,
            seo_title   = excluded.seo_title,
            seo_keywords= excluded.seo_keywords,
            updated_at  = CURRENT_TIMESTAMP;
        `, [
          pageId,
          t.language,
          t.title,
          t.html,
          t.css,
          t.metaDesc,
          t.seoTitle,
          t.seoKeywords
        ]);
      }
      return { done: true };
    }

    case 'SET_AS_START': {
      const { pageId, language = 'en' } = params?.[0] || {};
      if (!pageId) throw new Error('pageId required');

      const statusRow = await db.get(`SELECT status FROM pagesManager_pages WHERE id = ?`, [pageId]);
      if (!statusRow) throw new Error('Page not found');
      if (statusRow.status !== 'published') throw new Error('Only published pages can be set as start');

      await db.run(`UPDATE pagesManager_pages SET is_start = 0 WHERE language = ?;`, [language.toLowerCase()]);
      await db.run(`
        UPDATE pagesManager_pages
           SET is_start   = 1,
               language   = ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?;
      `, [language.toLowerCase(), pageId]);
      return { done: true };
    }

    case 'GET_START_PAGE': {
      const lang = (Array.isArray(params) && typeof params[0] === 'string') ? params[0].toLowerCase() : 'en';
      const rows = await db.all(`
        SELECT p.*,
               t.language AS trans_lang,
               t.title    AS trans_title,
               t.html,
               t.css,
               t.meta_desc,
               t.seo_title,
               t.seo_keywords
          FROM pagesManager_pages p
          LEFT JOIN pagesManager_page_translations t
                ON p.id = t.page_id AND t.language = ?
         WHERE p.is_start = 1
           AND p.language = ?
         LIMIT 1;
      `, [lang, lang]);

      for (const r of rows) {
        if (typeof r.meta === 'string') {
          try { r.meta = JSON.parse(r.meta); } catch { r.meta = null; }
        }
      }

      return rows;
    }

    case 'GENERATE_XML_SITEMAP': {
      const rows = await db.all(`
        SELECT slug, updated_at, is_start
          FROM pagesManager_pages
         WHERE status = 'published'
         ORDER BY updated_at DESC;
      `);
      return rows;
    }

    case 'SEARCH_PAGES': {
      const p = Array.isArray(params) ? (params[0] || {}) : (params || {});
      const q      = `%${p.query || ''}%`;
      const lane   = p.lane  || 'all';
      const limit  = Number.parseInt(p.limit, 10) || 20;

      const rows = await db.all(`
        SELECT DISTINCT p.id,
               COALESCE(p.title, t.title, '') AS title,
               p.slug,
               p.lane
          FROM pagesManager_pages p
          LEFT JOIN pagesManager_page_translations t ON p.id = t.page_id
         WHERE (? = 'all' OR p.lane = ?)
           AND (p.title LIKE ? OR p.slug LIKE ? OR t.title LIKE ?)
         ORDER BY p.weight ASC, p.created_at DESC
         LIMIT ?;
      `, [lane, lane, q, q, q, limit]);
      return rows;
    }

    case 'DELETE_PAGE': {
      const pageId = params?.[0];
      await db.run(`DELETE FROM pagesManager_pages WHERE id = ?;`, [pageId]);
      return { done: true };
    }

/*  …continued from the end of the Pages-Manager section  */

/* ────────────────────────────────────────────────────────────────
   MODULE LOADER
   ─────────────────────────────────────────────────────────────── */
case 'DROP_MODULE_DATABASE': {
  const moduleName = params?.[0];
  if (!moduleName) return { done: false };

  const tables = await db.all(
    `SELECT name FROM sqlite_master 
       WHERE type = 'table' 
         AND name LIKE ?;`,
    [`${moduleName}_%`]
  );
  for (const { name } of tables) {
    await db.run(`DROP TABLE IF EXISTS "${name}";`);
  }
  return { done: true };
}

case 'INIT_MODULE_REGISTRY_TABLE': {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS moduleloader_module_registry (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      module_name  TEXT UNIQUE NOT NULL,
      is_active    INTEGER DEFAULT 1,
      last_error   TEXT,
      module_info  TEXT  DEFAULT '{}',  -- JSON as TEXT
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      description  TEXT
    );
  `);
  return { done: true };
}

case 'CHECK_MODULE_REGISTRY_COLUMNS': {
  const rows = await db.all(`PRAGMA table_info(moduleloader_module_registry);`);
  /* normalise to { column_name } for parity with Postgres response */
  return rows.map(r => ({ column_name: r.name }));
}

case 'ALTER_MODULE_REGISTRY_COLUMNS': {
  await db.run(`
    ALTER TABLE moduleloader_module_registry
      ADD COLUMN IF NOT EXISTS description TEXT;
  `);
  return { done: true };
}

case 'SELECT_MODULE_REGISTRY': {
  const rows = await db.all(`
    SELECT * FROM moduleloader_module_registry
    ORDER BY id ASC;
  `);
  return rows;
}

case 'LIST_ACTIVE_GRAPES_MODULES': {
  /* uses JSON1 extension if available; otherwise filters in JS */
  try {
    const rows = await db.all(`
      SELECT * FROM moduleloader_module_registry
       WHERE is_active = 1
         AND json_extract(module_info,'$.grapesComponent') = 1
       ORDER BY id ASC;
    `);
    return rows;
  } catch {
    const rows = await db.all(`
      SELECT * FROM moduleloader_module_registry WHERE is_active = 1;
    `);
    return rows.filter(r => {
      try {
        return JSON.parse(r.module_info).grapesComponent === true;
      } catch { return false; }
    });
  }
}

case 'SELECT_MODULE_BY_NAME': {
  const p = Array.isArray(params) ? (params[0] || {}) : (params || {});
  const { moduleName } = p;
  const rows = await db.all(
    `SELECT module_name, module_info
      FROM moduleloader_module_registry
     WHERE module_name = ?;`,
    [moduleName]
  );
  return rows;
}

case 'INIT_APP_REGISTRY_TABLE': {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS appLoader_app_registry (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      app_name    TEXT UNIQUE NOT NULL,
      is_active   INTEGER DEFAULT 0,
      last_error  TEXT,
      app_info    TEXT DEFAULT '{}',
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return { done: true };
}

case 'INSERT_APP_REGISTRY_ENTRY': {
  const p = Array.isArray(params) ? (params[0] || {}) : (params || {});
  const {
    appName,
    isActive = 0,
    lastError = null,
    appInfo = '{}'
  } = p;
  await db.run(
    `INSERT INTO appLoader_app_registry (app_name, is_active, last_error, app_info, updated_at)
     VALUES (?,?,?,?,CURRENT_TIMESTAMP);`,
    [appName, isActive ? 1 : 0, lastError, appInfo]
  );
  return { done: true };
}

case 'UPDATE_APP_REGISTRY_ENTRY': {
  const p = Array.isArray(params) ? (params[0] || {}) : (params || {});
  const {
    appName,
    isActive = 0,
    lastError = null,
    appInfo = '{}'
  } = p;
  await db.run(
    `UPDATE appLoader_app_registry
        SET is_active = ?, last_error = ?, app_info = ?, updated_at = CURRENT_TIMESTAMP
      WHERE app_name = ?;`,
    [isActive ? 1 : 0, lastError, appInfo, appName]
  );
  return { done: true };
}

case 'SELECT_APP_BY_NAME': {
  const p = Array.isArray(params) ? (params[0] || {}) : (params || {});
  const { appName } = p;
  const rows = await db.all(
    `SELECT * FROM appLoader_app_registry WHERE app_name = ?;`,
    [appName]
  );
  return rows;
}

/* ────────────────────────────────────────────────────────────────
   DEPENDENCY LOADER
   ─────────────────────────────────────────────────────────────── */
case 'CHECK_DB_EXISTS_DEPENDENCYLOADER': {
  /* In SQLite everything is one file → always “exists” once table created */
  const rows = await db.all(`
    SELECT name FROM sqlite_master
     WHERE type = 'table'
       AND name = 'dependencyloader_module_dependencies';
  `);
  return rows;
}

case 'INIT_DEPENDENCYLOADER_SCHEMA': {
  /* noop – no schemas */
  return { done: true };
}

case 'INIT_DEPENDENCYLOADER_TABLE': {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS dependencyloader_module_dependencies (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      module_name      TEXT NOT NULL,
      dependency_name  TEXT NOT NULL,
      allowed_version  TEXT DEFAULT '*',
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return { done: true };
}

case 'LIST_DEPENDENCYLOADER_DEPENDENCIES': {
  const rows = await db.all(`
    SELECT module_name, dependency_name, allowed_version
      FROM dependencyloader_module_dependencies
     ORDER BY module_name ASC;
  `);
  return rows;
}

/* ────────────────────────────────────────────────────────────────
   UNIFIED SETTINGS
   ─────────────────────────────────────────────────────────────── */
case 'LIST_MODULE_SETTINGS': {
  const targetModule = params?.[0] ?? '';
  const rows = await db.all(`
    SELECT key, value
      FROM settingsManager_cms_settings
     WHERE key LIKE ?
     ORDER BY id ASC;
  `, [`${targetModule}.%`]);
  return rows;
}

/* ────────────────────────────────────────────────────────────────
   SERVER MANAGER
   ─────────────────────────────────────────────────────────────── */
case 'INIT_SERVERMANAGER_SCHEMA': {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS servermanager_server_locations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      server_name TEXT NOT NULL,
      ip_address  TEXT NOT NULL,
      notes       TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return { done: true };
}

case 'SERVERMANAGER_ADD_LOCATION': {
  const { serverName, ipAddress, notes = '' } = params?.[0] ?? {};
  await db.run(`
    INSERT INTO servermanager_server_locations
      (server_name, ip_address, notes, created_at, updated_at)
    VALUES (?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  `, [serverName, ipAddress, notes]);
  return { done: true };
}

case 'SERVERMANAGER_GET_LOCATION': {
  const { locationId } = params?.[0] ?? {};
  const rows = await db.all(`
    SELECT * FROM servermanager_server_locations
     WHERE id = ?
     LIMIT 1;
  `, [locationId]);
  return rows;
}

case 'SERVERMANAGER_LIST_LOCATIONS': {
  const rows = await db.all(`
    SELECT * FROM servermanager_server_locations
     ORDER BY id ASC;
  `);
  return rows;
}

case 'SERVERMANAGER_DELETE_LOCATION': {
  const { locationId } = params?.[0] ?? {};
  await db.run(`
    DELETE FROM servermanager_server_locations
     WHERE id = ?;
  `, [locationId]);
  return { done: true };
}

case 'SERVERMANAGER_UPDATE_LOCATION': {
  const { locationId, newName, newIp, newNotes } = params?.[0] ?? {};
  await db.run(`
    UPDATE servermanager_server_locations
       SET server_name = COALESCE(?,server_name),
           ip_address  = COALESCE(?,ip_address),
           notes       = COALESCE(?,notes),
           updated_at  = CURRENT_TIMESTAMP
     WHERE id = ?;
  `, [newName, newIp, newNotes, locationId]);
  return { done: true };
}

/* ────────────────────────────────────────────────────────────────
   MEDIA MANAGER
   ─────────────────────────────────────────────────────────────── */
case 'INIT_MEDIA_SCHEMA': {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS mediamanager_media_files (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name   TEXT NOT NULL,
      file_type   TEXT NOT NULL,
      category    TEXT,
      user_id     INTEGER,
      location    TEXT,
      folder      TEXT,
      notes       TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return { done: true };
}

case 'MEDIA_ADD_FILE': {
  const d = params?.[0] ?? {};
  const { fileName, fileType, category, userId, location, folder, notes } = d;
  await db.run(`
    INSERT INTO mediamanager_media_files
      (file_name, file_type, category, user_id, location, folder, notes,
       created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  `, [fileName, fileType, category, userId, location, folder, notes]);
  return { done: true };
}

case 'MEDIA_LIST_FILES': {
  const { filterCategory, filterFileType } = params?.[0] ?? {};
  let where = [];
  let values = [];
  if (filterCategory) { where.push('category = ?');  values.push(filterCategory); }
  if (filterFileType) { where.push('file_type = ?'); values.push(filterFileType); }
  const rows = await db.all(`
    SELECT * FROM mediamanager_media_files
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY id DESC;
  `, values);
  return rows;
}

case 'MEDIA_DELETE_FILE': {
  const { fileId } = params?.[0] ?? {};
  await db.run(`
    DELETE FROM mediamanager_media_files
     WHERE id = ?;
  `, [fileId]);
  return { done: true };
}

case 'MEDIA_UPDATE_FILE': {
  const { fileId, newCategory, newNotes, newFolder } = params?.[0] ?? {};
  await db.run(`
    UPDATE mediamanager_media_files
       SET category   = COALESCE(?,category),
           notes      = COALESCE(?,notes),
           folder     = COALESCE(?,folder),
           updated_at = CURRENT_TIMESTAMP
     WHERE id = ?;
  `, [newCategory, newNotes, newFolder, fileId]);
  return { done: true };
}

/* ────────────────────────────────────────────────────────────────
   SHARE MANAGER
   ─────────────────────────────────────────────────────────────── */
case 'INIT_SHARED_LINKS_TABLE': {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sharemanager_shared_links (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      short_token TEXT UNIQUE NOT NULL,
      file_path   TEXT NOT NULL,
      created_by  INTEGER NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_public   INTEGER DEFAULT 1
    );
  `);
  return { done: true };
}

case 'CREATE_SHARE_LINK': {
  const { shortToken, filePath, userId, isPublic = 1 } = params?.[0] ?? {};
  const { lastID } = await db.run(`
    INSERT INTO sharemanager_shared_links
      (short_token, file_path, created_by, is_public, created_at)
    VALUES (?,?,?,?,CURRENT_TIMESTAMP);
  `, [shortToken, filePath, userId, isPublic]);
  const row = await db.get(`SELECT * FROM sharemanager_shared_links WHERE id = ?;`, [lastID]);
  return row;
}

case 'REVOKE_SHARE_LINK': {
  const { shortToken, userId } = params?.[0] ?? {};
  await db.run(`
    UPDATE sharemanager_shared_links
       SET is_public = 0
     WHERE short_token = ?
       AND created_by  = ?;
  `, [shortToken, userId]);
  return { done: true };
}

case 'GET_SHARE_LINK': {
  const { shortToken } = params?.[0] ?? {};
  const rows = await db.all(`
    SELECT * FROM sharemanager_shared_links
     WHERE short_token = ?
     LIMIT 1;
  `, [shortToken]);
  return rows;
}

/* ────────────────────────────────────────────────────────────────
   TRANSLATION MANAGER
   ─────────────────────────────────────────────────────────────── */
case 'INIT_TRANSLATION_TABLES': {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS translationmanager_translation_usage (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
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
  `);
  return { done: true };
}

/* ────────────────────────────────────────────────────────────────
   WIDGET MANAGER
   ─────────────────────────────────────────────────────────────── */
case 'INIT_WIDGETS_TABLE_PUBLIC': {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS widgetmanager_widgets_public (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      widget_id   TEXT UNIQUE NOT NULL,
      label       TEXT,
      content     TEXT NOT NULL,
      category    TEXT,
      "order"     INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return { done: true };
}

case 'INIT_WIDGETS_TABLE_ADMIN': {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS widgetmanager_widgets_admin (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      widget_id   TEXT UNIQUE NOT NULL,
      label       TEXT,
      content     TEXT NOT NULL,
      category    TEXT,
      "order"     INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return { done: true };
}

/* ---- CRUD helpers ------------------------------------------------ */
case 'UPDATE_WIDGET_PUBLIC': {
  const d = params?.[0] ?? {};
  await db.run(`
    UPDATE widgetmanager_widgets_public
       SET label      = COALESCE(?,label),
           content    = COALESCE(?,content),
           category   = COALESCE(?,category),
           "order"    = COALESCE(?, "order"),
           updated_at = CURRENT_TIMESTAMP
     WHERE widget_id  = ?;
  `, [d.newLabel, d.newContent, d.newCategory, d.newOrder, d.widgetId]);
  return { done: true };
}

case 'UPDATE_WIDGET_ADMIN': {
  const d = params?.[0] ?? {};
  await db.run(`
    UPDATE widgetmanager_widgets_admin
       SET label      = COALESCE(?,label),
           content    = COALESCE(?,content),
           category   = COALESCE(?,category),
           "order"    = COALESCE(?, "order"),
           updated_at = CURRENT_TIMESTAMP
     WHERE widget_id  = ?;
  `, [d.newLabel, d.newContent, d.newCategory, d.newOrder, d.widgetId]);
  return { done: true };
}

case 'DELETE_WIDGET_PUBLIC': {
  const { widgetId } = params?.[0] ?? {};
  await db.run(`DELETE FROM widgetmanager_widgets_public WHERE widget_id = ?;`, [widgetId]);
  return { done: true };
}

case 'DELETE_WIDGET_ADMIN': {
  const { widgetId } = params?.[0] ?? {};
  await db.run(`DELETE FROM widgetmanager_widgets_admin WHERE widget_id = ?;`, [widgetId]);
  return { done: true };
}

/* ────────────────────────────────────────────────────────────────
   PLAINSPACE
   ─────────────────────────────────────────────────────────────── */
case 'INIT_PLAINSPACE_LAYOUTS': {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS plainspace_layouts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id     INTEGER NOT NULL,
      lane        TEXT NOT NULL,
      viewport    TEXT NOT NULL,
      layout_json TEXT NOT NULL,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (page_id, lane, viewport)
    );
  `);
  return { done: true };
}

case 'INIT_PLAINSPACE_LAYOUT_TEMPLATES': {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS plainspace_layout_templates (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      lane        TEXT NOT NULL,
      viewport    TEXT NOT NULL,
      layout_json TEXT NOT NULL,
      preview_path TEXT,
      is_global   INTEGER DEFAULT 0,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const cols = await db.all(`PRAGMA table_info(plainspace_layout_templates);`);
  const hasCol = Array.isArray(cols) && cols.some(c => c.name === 'preview_path');
  if (!hasCol) {
    try {
      await db.run(`ALTER TABLE plainspace_layout_templates ADD COLUMN preview_path TEXT;`);
    } catch (e) {
      if (!/duplicate column/i.test(String(e.message))) throw e;
    }
  }
  const hasGlobal = Array.isArray(cols) && cols.some(c => c.name === 'is_global');
  if (!hasGlobal) {
    try {
      await db.run(`ALTER TABLE plainspace_layout_templates ADD COLUMN is_global INTEGER DEFAULT 0;`);
    } catch (e) {
      if (!/duplicate column/i.test(String(e.message))) throw e;
    }
  }
  return { done: true };
}

case 'UPSERT_PLAINSPACE_LAYOUT': {
  const d = params?.[0] ?? {};
  await db.run(`
    INSERT INTO plainspace_layouts
      (page_id, lane, viewport, layout_json, updated_at)
    VALUES (?,?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(page_id, lane, viewport) DO UPDATE SET
      layout_json = excluded.layout_json,
      updated_at  = CURRENT_TIMESTAMP;
  `, [d.pageId, d.lane, d.viewport, JSON.stringify(d.layoutArr ?? [])]);
  return { success: true };
}

case 'INIT_PLAINSPACE_PUBLISHED_DESIGNS': {
  await db.run(`
    CREATE TABLE IF NOT EXISTS plainspace_published_designs (
      name TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      files TEXT NOT NULL,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return { done: true };
}

case 'UPSERT_PLAINSPACE_LAYOUT_TEMPLATE': {
  const d = params?.[0] ?? {};
  await db.run(`
    INSERT INTO plainspace_layout_templates
      (name, lane, viewport, layout_json, preview_path, is_global, updated_at)
    VALUES (?,?,?,?,?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(name) DO UPDATE SET
      lane        = excluded.lane,
      viewport    = excluded.viewport,
      layout_json = excluded.layout_json,
      preview_path= excluded.preview_path,
      is_global   = excluded.is_global,
      updated_at  = CURRENT_TIMESTAMP;
  `, [d.name, d.lane, d.viewport, JSON.stringify(d.layoutArr ?? []), d.previewPath ?? null, d.isGlobal ? 1 : 0]);
  return { success: true };
}

case 'UPSERT_PLAINSPACE_PUBLISHED_DESIGN': {
  const d = params?.[0] ?? {};
  await db.run(`
    INSERT INTO plainspace_published_designs (name, path, files, updated_at)
      VALUES (?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(name) DO UPDATE SET
      path = excluded.path,
      files = excluded.files,
      updated_at = CURRENT_TIMESTAMP;
  `, [d.name, d.path, JSON.stringify(d.files ?? [])]);
  return { success: true };
}

case 'GET_PLAINSPACE_LAYOUT_TEMPLATE': {
  const { name } = params?.[0] ?? {};
  const rows = await db.all(`
    SELECT layout_json, is_global FROM plainspace_layout_templates
     WHERE name = ?;
  `, [name]);
  return rows;
}

case 'GET_PLAINSPACE_PUBLISHED_DESIGN': {
  const { name } = params?.[0] ?? {};
  return await db.all(`
    SELECT path, files FROM plainspace_published_designs WHERE name = ?;
  `, [name]);
}

case 'GET_PLAINSPACE_LAYOUT_TEMPLATE_NAMES': {
  const { lane } = params?.[0] ?? {};
  const rows = await db.all(`
    SELECT name, preview_path, is_global, updated_at FROM plainspace_layout_templates
     WHERE lane = ?
     ORDER BY updated_at DESC;
  `, [lane]);
  return rows;
}

case 'GET_GLOBAL_LAYOUT_TEMPLATE': {
  const rows = await db.all(`
    SELECT name, layout_json FROM plainspace_layout_templates
     WHERE is_global = 1
     LIMIT 1;
  `);
  return rows;
}

case 'SET_GLOBAL_LAYOUT_TEMPLATE': {
  const { name } = params?.[0] ?? {};
  await db.run(`UPDATE plainspace_layout_templates SET is_global = (name = ?);`, [name]);
  return { success: true };
}

case 'DELETE_LAYOUT_TEMPLATE': {
  const { name } = params?.[0] ?? {};
  await db.run(`DELETE FROM plainspace_layout_templates WHERE name = ?;`, [name]);
  return { success: true };
}

case 'GET_PLAINSPACE_LAYOUT': {
  const d = params?.[0] ?? {};
  const rows = await db.all(`
    SELECT layout_json FROM plainspace_layouts
     WHERE page_id = ? AND lane = ? AND viewport = ?;
  `, [d.pageId, d.lane, d.viewport]);
  return rows;
}

case 'GET_ALL_PLAINSPACE_LAYOUTS': {
  const d = params?.[0] ?? {};
  const rows = await db.all(`
    SELECT viewport, layout_json FROM plainspace_layouts
     WHERE page_id = ? AND lane = ?
     ORDER BY viewport ASC;
  `, [d.pageId, d.lane]);
  return rows;
}

case 'INIT_PLAINSPACE_WIDGET_INSTANCES': {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS plainspace_widget_instances (
      instance_id TEXT PRIMARY KEY,
      content     TEXT NOT NULL,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  return { done: true };
}

case 'UPSERT_WIDGET_INSTANCE': {
  const d = params?.[0] ?? {};
  await db.run(`
    INSERT INTO plainspace_widget_instances
      (instance_id, content, updated_at)
    VALUES (?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(instance_id) DO UPDATE SET
      content = excluded.content,
      updated_at = CURRENT_TIMESTAMP;
  `, [d.instanceId, d.content]);
  return { success: true };
}

case 'GET_WIDGET_INSTANCE': {
  const { instanceId } = params?.[0] ?? {};
  const rows = await db.all(`
    SELECT content FROM plainspace_widget_instances
     WHERE instance_id = ?;
  `, [instanceId]);
  return rows;
}

/* ────────────────────────────────────────────────────────────────
   FALL-THROUGH
   ───────────────────────────────────────────────────────────────  */
    default:
      notificationEmitter.notify({
        moduleName: 'databaseManager',
        notificationType: 'debug',
        priority: 'debug',
        message: `[PLACEHOLDER][SQLite] Unhandled built-in placeholder "${operation}".`
      });
      return { done: false };
  }
}

module.exports = { handleBuiltInPlaceholderSqlite };
