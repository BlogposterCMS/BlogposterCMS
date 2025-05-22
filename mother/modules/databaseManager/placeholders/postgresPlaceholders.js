/*mother/modules/databaseManager/placeholders/postgresPlaceholders.js
/*
/* This module handles built-in and custom placeholders for Postgres.
/* It is designed to be used with the databaseManager module.
/* It provides a function to handle placeholders based on the operation name.
/* It also provides a function to handle custom placeholders defined in other modules.
*/
const notificationEmitter = require('../../../emitters/notificationEmitter');
/* =================================================================================
    POSTGRES switch
    ================================================================================= */
async function handleBuiltInPlaceholderPostgres(client, operation, params) {
switch (operation) {
    // ─────────────────────────────────────────────────────────────────────────
    // USER MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────────
    case 'INIT_USER_MANAGEMENT': {
        // 1) usermanagement.users
        await client.query(`
          CREATE TABLE IF NOT EXISTS usermanagement.users(
            id SERIAL PRIMARY KEY,
            username       VARCHAR(255) NOT NULL UNIQUE,
            email          VARCHAR(255) UNIQUE,
            password       VARCHAR(255) NOT NULL,
            first_name     VARCHAR(255),
            last_name      VARCHAR(255),
            display_name   VARCHAR(255),
            phone          VARCHAR(50),
            company        VARCHAR(255),
            website        VARCHAR(255),
            avatar_url     VARCHAR(255),
            bio            TEXT,
            token_version  INT DEFAULT 0,
            created_at     TIMESTAMP DEFAULT NOW(),
            updated_at     TIMESTAMP DEFAULT NOW()
          );
        `);
      
        // 2) usermanagement.roles
        await client.query(`
          CREATE TABLE IF NOT EXISTS usermanagement.roles(
            id SERIAL PRIMARY KEY,
            role_name      VARCHAR(255) UNIQUE NOT NULL,
            is_system_role BOOLEAN DEFAULT false,
            description    VARCHAR(255),
            permissions    JSONB  DEFAULT '{}'::jsonb,
            created_at     TIMESTAMP DEFAULT NOW(),
            updated_at     TIMESTAMP DEFAULT NOW()
          );
        `);
      
        // 3) usermanagement.user_roles
        await client.query(`
          CREATE TABLE IF NOT EXISTS usermanagement.user_roles(
            id SERIAL PRIMARY KEY,
            user_id INT NOT NULL REFERENCES usermanagement.users(id) ON DELETE CASCADE,
            role_id INT NOT NULL REFERENCES usermanagement.roles(id) ON DELETE CASCADE,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
        `);
      
        return { done: true };
      }
      
      case 'INIT_B2B_FIELDS': {
        // Example => add columns like company_name, vat_number, etc.
        await client.query(`
          ALTER TABLE usermanagement.users 
          ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);
        `);
        await client.query(`
          ALTER TABLE usermanagement.users 
          ADD COLUMN IF NOT EXISTS vat_number VARCHAR(255);
        `);
        return { done: true };
      }
      
      case 'ADD_USER_FIELD': {
        // expects params.fieldName, params.fieldType
        const fieldName = params.fieldName || 'extra_field';
        const fieldType = params.fieldType || 'VARCHAR(255)';
      
        await client.query(`
          ALTER TABLE usermanagement.users
          ADD COLUMN IF NOT EXISTS "${fieldName}" ${fieldType};
        `);
      
        return { done: true };
      }

    // ─────────────────────────────────────────────────────────────────────────
    // SETTINGS MANAGER
    // ─────────────────────────────────────────────────────────────────────────
    case 'INIT_SETTINGS_SCHEMA': {
        await client.query(`
          CREATE SCHEMA IF NOT EXISTS settingsManager;
        `);
        return { done: true };
      }
      
      case 'INIT_SETTINGS_TABLES': {
        await client.query(`
          CREATE TABLE IF NOT EXISTS settingsManager.cms_settings (
            id SERIAL PRIMARY KEY,
            key VARCHAR(255) UNIQUE NOT NULL,
            value TEXT,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
      
          CREATE TABLE IF NOT EXISTS settingsManager.module_events (
            id SERIAL PRIMARY KEY,
            event_name VARCHAR(255),
            data JSONB,
            created_at TIMESTAMP DEFAULT NOW()
          );

          INSERT INTO settingsManager.cms_settings (key, value, created_at, updated_at)
          VALUES ('FIRST_INSTALL_DONE', 'false', NOW(), NOW())
          ON CONFLICT (key)
          DO NOTHING;

        `);
        return { done: true };
      }
      
      case 'CHECK_AND_ALTER_SETTINGS_TABLES': {
        await client.query(`
          ALTER TABLE settingsManager.cms_settings
          ADD COLUMN IF NOT EXISTS something_else TEXT;
        `);
        return { done: true };
      }
      
      case 'GET_SETTING': {
        const settingKey = params[0];
        const { rows } = await client.query(`
          SELECT value
          FROM settingsManager.cms_settings
          WHERE key = $1
          LIMIT 1;
        `, [settingKey]);
        return rows;
      }
      
      case 'UPSERT_SETTING': {
        const settingKey = params[0];
        const settingValue = params[1];
        await client.query(`
          INSERT INTO settingsManager.cms_settings (key, value, created_at, updated_at)
          VALUES ($1, $2, NOW(), NOW())
          ON CONFLICT (key)
          DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
        `, [settingKey, settingValue]);
        return { done: true };
      }
      
      case 'GET_ALL_SETTINGS': {
        const { rows } = await client.query(`
          SELECT key, value
          FROM settingsManager.cms_settings
          ORDER BY id ASC;
        `);
        return rows;
      }
      

    // ─────────────────────────────────────────────────────────────────────────
    // PAGES MANAGER
    // ─────────────────────────────────────────────────────────────────────────
    /* ---------- CREATE SCHEMA ---------- */
    case 'INIT_PAGES_SCHEMA': {
      // Spoiler: this creates the schema only if it doesn’t already exist.
      await client.query(`CREATE SCHEMA IF NOT EXISTS pagesManager;`);
      return { done: true };
    }

    /* ---------- INITIAL TABLE CREATION ---------- */
    case 'INIT_PAGES_TABLE': {
      await client.query(`
        /* Main pages table */
        CREATE TABLE IF NOT EXISTS pagesManager.pages (
          id          SERIAL PRIMARY KEY,
          parent_id   INT REFERENCES pagesManager.pages(id) ON DELETE SET NULL,
          is_content  BOOLEAN      DEFAULT false,
          is_start    BOOLEAN      DEFAULT false,
          slug        VARCHAR(255) NOT NULL,                -- yes, slug is mandatory
          lane        VARCHAR(20)  NOT NULL DEFAULT 'public',
          status      VARCHAR(50)  DEFAULT 'draft',
          seo_image   VARCHAR(255),
          language    VARCHAR(5)   DEFAULT 'en',
          created_at  TIMESTAMP    DEFAULT NOW(),
          updated_at  TIMESTAMP    DEFAULT NOW(),
          /* NEW COLUMNS: */
          title       TEXT,
          meta        JSONB,
          /* Composite unique constraint: slug+lane */
          UNIQUE (slug, lane)
        );

        /* Per‑language translations */
        CREATE TABLE IF NOT EXISTS pagesManager.page_translations (
          id          SERIAL PRIMARY KEY,
          page_id     INT REFERENCES pagesManager.pages(id) ON DELETE CASCADE,
          language    VARCHAR(5),
          title       TEXT,
          html        TEXT,
          css         TEXT,
          meta_desc   TEXT,
          seo_title   TEXT,
          seo_keywords TEXT,
          created_at  TIMESTAMP DEFAULT NOW(),
          updated_at  TIMESTAMP DEFAULT NOW(),
          UNIQUE (page_id, language)
        );
      `);
      return { done: true };
    }

    /* ---------- MIGRATION / SELF‑HEALING PATCH ---------- */
    case 'CHECK_AND_ALTER_PAGES_TABLE': {
      /* 0. In case someone “accidentally” removed slug earlier … */
      await client.query(`
        ALTER TABLE pagesManager.pages
          ADD COLUMN IF NOT EXISTS slug VARCHAR(255) NOT NULL;
      `);

      /* 1. Kill the zombie single‑column unique constraint & index */
      await client.query(`
        ALTER TABLE pagesManager.pages
          DROP CONSTRAINT IF EXISTS pages_slug_key;
      `);
      await client.query(`
        DROP INDEX IF EXISTS pagesManager.pages_slug_key;
      `);

      /* 2. Add any columns that might still be missing (one by one) */
      await client.query(`
        ALTER TABLE pagesManager.pages
          ADD COLUMN IF NOT EXISTS parent_id INT REFERENCES pagesManager.pages(id) ON DELETE SET NULL;
      `);
      await client.query(`
        ALTER TABLE pagesManager.pages
          ADD COLUMN IF NOT EXISTS language VARCHAR(5) DEFAULT 'en';
      `);
      await client.query(`
        ALTER TABLE pagesManager.pages
          ADD COLUMN IF NOT EXISTS is_content BOOLEAN DEFAULT false;
      `);
      await client.query(`
        ALTER TABLE pagesManager.pages
          ADD COLUMN IF NOT EXISTS lane VARCHAR(20) NOT NULL DEFAULT 'public';
      `);

      /* NEW: add missing "title" + "meta" columns if not existing */
      await client.query(`
        ALTER TABLE pagesManager.pages
          ADD COLUMN IF NOT EXISTS title TEXT;
      `);
      await client.query(`
        ALTER TABLE pagesManager.pages
          ADD COLUMN IF NOT EXISTS meta JSONB;
      `);

      /* 3. Create (or verify) the *proper* composite unique index */
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS pages_slug_lane_unique
          ON pagesManager.pages (slug, lane);
      `);

      /* 4. One start page per language – this index was already fine */
      await client.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS pages_start_unique
          ON pagesManager.pages (language)
          WHERE is_start = true;
      `);

      return { done: true };
    }

    /* ---------- CREATE_PAGE ---------- */
    case 'CREATE_PAGE': {
      const p = Array.isArray(params) ? (params[0] || {}) : (params || {});
      const {
        slug,
        status,
        seo_image,
        translations,
        parent_id,
        is_content,
        lane,
        language,
        /* NEW fields: */
        title,
        meta
      } = p;

      const result = await client.query(`
          INSERT INTO pagesManager.pages
            (title, meta, slug, status, seo_image, is_start, parent_id, is_content, language, lane,
            created_at, updated_at)
          VALUES
            ($1, $2, $3, $4, $5, false, $6, $7, $8, $9, NOW(), NOW())
          RETURNING id;
      `, [
        /* $1 */ title       || '',
        /* $2 */ meta        || null,
        /* $3 */ slug,
        /* $4 */ status      || 'draft',
        /* $5 */ seo_image   || '',
        /* $6 */ parent_id   || null,
        /* $7 */ is_content  || false,
        /* $8 */ language    || 'en',
        /* $9 */ lane        || 'public'
      ]);

      const pageId = result.rows[0].id;

      /* Insert translations if any exist */
      for (const t of translations) {
        await client.query(`
          INSERT INTO pagesManager.page_translations
            (page_id, language, title, html, css,
            meta_desc, seo_title, seo_keywords,
            created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW());
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

    /* ---------- GET_PAGES_BY_LANE ---------- */
    case 'GET_PAGES_BY_LANE': {
      let laneVal;
      if (Array.isArray(params)) {
        const first = params[0];
        laneVal = typeof first === 'object' && first !== null ? first.lane : first;
      } else if (params && typeof params === 'object') {
        laneVal = params.lane;
      } else {
        laneVal = params;
      }
      const { rows } = await client.query(`
        SELECT p.*, 
              t.language AS trans_lang,
              t.title AS trans_title,
              t.html  AS trans_html,
              t.css   AS trans_css,
              t.meta_desc, t.seo_title, t.seo_keywords
          FROM pagesManager.pages p
          LEFT JOIN pagesManager.page_translations t
                ON p.id = t.page_id
        WHERE p.lane = $1
        ORDER BY p.created_at DESC
      `, [laneVal]);

      return rows;
    }

    /* ---------- ADD_PARENT_CHILD_RELATION ---------- */
    case 'ADD_PARENT_CHILD_RELATION': {
      await client.query(`
        ALTER TABLE pagesManager.pages
        ADD COLUMN IF NOT EXISTS parent_id INT REFERENCES pagesManager.pages(id) ON DELETE SET NULL;
      `);
      return { done: true };
    }

    /* ---------- GET_CHILD_PAGES ---------- */
    case 'GET_CHILD_PAGES': {
      const parentId = params[0];

      const { rows } = await client.query(`
        SELECT *
          FROM pagesManager.pages
        WHERE parent_id = $1
        ORDER BY created_at DESC;
      `, [parentId]);

      return rows;
    }

    /* ---------- GET_ALL_PAGES ---------- */
    case 'GET_ALL_PAGES': {
      const { rows } = await client.query(`
        SELECT *
          FROM pagesManager.pages
        ORDER BY id DESC
      `);
      return rows;
    }

    /* ---------- GET_PAGE_BY_ID ---------- */
    case 'GET_PAGE_BY_ID': {
      const pageId = params[0];
      const lang   = params[1] || 'en';

      const { rows } = await client.query(`
        SELECT p.*,
              t.language AS trans_lang, t.title AS trans_title,
              t.html, t.css, t.meta_desc, t.seo_title, t.seo_keywords
          FROM pagesManager.pages p
          LEFT JOIN pagesManager.page_translations t
                ON p.id = t.page_id AND t.language = $2
        WHERE p.id = $1;
      `, [pageId, lang]);

      return rows;
    }

    /* ---------- GET_PAGE_BY_SLUG ---------- */
    case 'GET_PAGE_BY_SLUG': {
      const slug   = params[0];
      const lane   = params[1] || 'public';
      const lang   = params[2] || 'en';

      const { rows } = await client.query(`
        SELECT p.*,
              t.language AS trans_lang, t.title AS trans_title,
              t.html, t.css, t.meta_desc, t.seo_title, t.seo_keywords
          FROM pagesManager.pages p
          LEFT JOIN pagesManager.page_translations t
                ON (p.id = t.page_id AND t.language = $3)
        WHERE p.slug = $1
          AND p.lane = $2
      `, [slug, lane, lang]);

      return rows;
    }

    /* ---------- UPDATE_PAGE ---------- */
    case 'UPDATE_PAGE': {
      const {
        pageId,
        slug,
        status,
        seo_image,
        translations = [],
        parent_id,
        is_content,
        lane,
        language,
        /* NEW fields: */
        title,
        meta
      } = params;

      // Update main page
      await client.query(`
        UPDATE pagesManager.pages
          SET title     = $2,
              meta      = $3,
              slug      = $4,
              status    = $5,
              seo_image = $6,
              parent_id = $7,
              is_content= $8,
              lane      = $9,
              language  = $10,
              updated_at= NOW()
        WHERE id = $1;
      `, [
        /* $1 */ pageId,
        /* $2 */ title       || '',
        /* $3 */ meta        || null,
        /* $4 */ slug,
        /* $5 */ status,
        /* $6 */ seo_image,
        /* $7 */ parent_id,
        /* $8 */ is_content  || false,
        /* $9 */ lane        || 'public',
        /*$10*/ language     || 'en'
      ]);

      // Upsert translations
      for (const t of translations) {
        await client.query(`
          INSERT INTO pagesManager.page_translations
                (page_id, language, title, html, css, meta_desc, seo_title, seo_keywords, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
          ON CONFLICT (page_id, language)
          DO UPDATE SET
            title      = EXCLUDED.title,
            html       = EXCLUDED.html,
            css        = EXCLUDED.css,
            meta_desc  = EXCLUDED.meta_desc,
            seo_title  = EXCLUDED.seo_title,
            seo_keywords=EXCLUDED.seo_keywords,
            updated_at = NOW();
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

    /* ---------- SET_AS_START ---------- */
    case 'SET_AS_START': {
      const { pageId, language = 'en' } = params[0] || {};
      if (!pageId) throw new Error('pageId required');

      // Check page status
      const { rows: statusRows } = await client.query(
        `SELECT status FROM pagesManager.pages WHERE id = $1`,
        [pageId]
      );

      if (!statusRows[0]) {
        throw new Error('Page not found');
      }

      if (statusRows[0].status !== 'published') {
        throw new Error('Only published pages can be set as the start page');
      }

      const lang = language.toLowerCase();

      await client.query('BEGIN');

      try {
        // Clear existing start page
        await client.query(`
          UPDATE pagesManager.pages
            SET is_start = false
          WHERE is_start = true
            AND language = $1
        `, [lang]);

        // Set new start page
        await client.query(`
          UPDATE pagesManager.pages
            SET is_start  = true,
                language  = $2,
                updated_at= NOW()
          WHERE id = $1
        `, [pageId, lang]);

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }

      return { done: true };
    }

    /* ---------- GET_START_PAGE ---------- */
    case 'GET_START_PAGE': {
      /* params[0] = language (optional) */
      const lang = (Array.isArray(params) && typeof params[0] === 'string')
              ? params[0].toLowerCase()
              : 'en';
      const { rows } = await client.query(`
        SELECT p.*,
              t.language AS trans_lang, t.title AS trans_title,
              t.html, t.css, t.meta_desc, t.seo_title, t.seo_keywords
          FROM pagesManager.pages p
          LEFT JOIN pagesManager.page_translations t
                ON p.id = t.page_id AND t.language = $1
        WHERE p.is_start = true
          AND p.language = $1
        LIMIT 1
      `, [lang]);

      return rows;
    }

    /* ---------- GENERATE_XML_SITEMAP (returns page data) ---------- */
    case 'GENERATE_XML_SITEMAP': {
      const { rows } = await client.query(`
        SELECT slug, updated_at, is_start
          FROM pagesManager.pages
        WHERE status='published'
        ORDER BY id ASC
      `);

      return rows;
    }

    /* ---------- DELETE_PAGE ---------- */
    case 'DELETE_PAGE': {
      const pageId = params[0];

      await client.query(`
        DELETE FROM pagesManager.pages
        WHERE id = $1;
      `, [pageId]);

      return { done: true };
    }



    // ─────────────────────────────────────────────────────────────────────────
    // MODULE LOADER
    // ─────────────────────────────────────────────────────────────────────────
    case 'DROP_MODULE_DATABASE': {
      // Expects params[0] = the moduleName or schema name to drop
      const moduleName = params[0];
      // Drop the schema entirely, cascading all tables, etc.
      await client.query(`DROP SCHEMA IF EXISTS "${moduleName}" CASCADE;`);
      return { done: true };
    }
  
    case 'INIT_MODULE_REGISTRY_TABLE': {
      // Create schema for module loader if not exists
      await client.query(`CREATE SCHEMA IF NOT EXISTS moduleloader;`);
      
      // Create module_registry table
      await client.query(`
        CREATE TABLE IF NOT EXISTS "moduleloader"."module_registry" (
          id SERIAL PRIMARY KEY,
          module_name VARCHAR(255) UNIQUE NOT NULL,
          is_active   BOOLEAN DEFAULT TRUE,
          last_error  TEXT,
          module_info JSONB DEFAULT '{}'::jsonb,
          created_at  TIMESTAMP DEFAULT NOW(),
          updated_at  TIMESTAMP DEFAULT NOW()
        );
      `);
      return { done: true };
    }
  
    case 'CHECK_MODULE_REGISTRY_COLUMNS': {
      // Return the list of columns from moduleloader.module_registry
      const { rows } = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'moduleloader'
          AND table_name   = 'module_registry';
      `);
      return rows;
    }
  
    case 'ALTER_MODULE_REGISTRY_COLUMNS': {
      // Add a "description" column if not exists, for demonstration
      await client.query(`
        ALTER TABLE "moduleloader"."module_registry"
        ADD COLUMN IF NOT EXISTS description TEXT;
      `);
      return { done: true };
    }
  
    case 'SELECT_MODULE_REGISTRY': {
      // Returns all rows from module_registry
      const { rows } = await client.query(`
        SELECT *
        FROM "moduleloader"."module_registry"
        ORDER BY id ASC;
      `);
      return rows;
    }
  
    case 'LIST_ACTIVE_GRAPES_MODULES': {
      // Lists modules where is_active = true
      // and module_info->>'grapesComponent' is 'true'
      const { rows } = await client.query(`
        SELECT *
        FROM "moduleloader"."module_registry"
        WHERE is_active = true
          AND (module_info->>'grapesComponent')::boolean = true
        ORDER BY id ASC;
      `);
      return rows;
    }

    case 'SELECT_MODULE_BY_NAME': {
      const { moduleName } = data;
      const { rows } = await client.query(`
        SELECT module_name, module_info
        FROM "moduleloader"."module_registry"
        WHERE module_name = $1
      `, [moduleName]);
      return rows;
    }
    

    // ─────────────────────────────────────────────────────────────────────────
    // DEPENDENCY LOADER
    // ─────────────────────────────────────────────────────────────────────────
    case 'CHECK_DB_EXISTS_DEPENDENCYLOADER': {
      const { rows } = await client.query(`
          SELECT datname
          FROM pg_database
          WHERE datname = 'dependencyloader_db';
      `);
      return rows;
    }
  
    case 'INIT_DEPENDENCYLOADER_SCHEMA': {
        await client.query(`CREATE SCHEMA IF NOT EXISTS "dependencyloader";`);
        return { done: true };
    }
    
    case 'INIT_DEPENDENCYLOADER_TABLE': {
        await client.query(`
            CREATE TABLE IF NOT EXISTS "dependencyloader"."module_dependencies" (
                id SERIAL PRIMARY KEY,
                module_name     VARCHAR(255) NOT NULL,
                dependency_name VARCHAR(255) NOT NULL,
                allowed_version VARCHAR(50) DEFAULT '*',
                created_at      TIMESTAMP DEFAULT NOW()
            );
        `);
        return { done: true };
    }
    
    case 'LIST_DEPENDENCYLOADER_DEPENDENCIES': {
        const { rows } = await client.query(`
            SELECT module_name, dependency_name, allowed_version
            FROM dependencyloader.module_dependencies
            ORDER BY module_name ASC;
        `);
        return rows;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UNIFIED SETTINGS
    // ─────────────────────────────────────────────────────────────────────────
    case 'LIST_MODULE_SETTINGS': {
        const targetModule = params[0];
        
        const { rows } = await client.query(`
          SELECT key, value
          FROM settingsManager.cms_settings
          WHERE key LIKE $1
          ORDER BY id ASC;
        `, [`${targetModule}.%`]);
      
        return rows;
      }
      
    // ─────────────────────────────────────────────────────────────────────────
    // SERVER MANAGER
    // ─────────────────────────────────────────────────────────────────────────
    
    case 'INIT_SERVERMANAGER_SCHEMA': {
        await client.query(`CREATE SCHEMA IF NOT EXISTS servermanager;`);
        await client.query(`
        CREATE TABLE IF NOT EXISTS servermanager.server_locations (
            id SERIAL PRIMARY KEY,
            server_name VARCHAR(255) NOT NULL,
            ip_address  VARCHAR(255) NOT NULL,
            notes       TEXT,
            created_at  TIMESTAMP DEFAULT NOW(),
            updated_at  TIMESTAMP DEFAULT NOW()
        );
        `);
        return { done: true };
    }

    case 'SERVERMANAGER_ADD_LOCATION': {
        // In Postgres-Fassung gehen wir davon aus, dass der meltdown-Bridging-Code
        // param[0] ein Objekt { serverName, ipAddress, notes } enthält.
        const data = params[0] || {};
        const { serverName, ipAddress, notes } = data;
        await client.query(`
        INSERT INTO servermanager.server_locations
        (server_name, ip_address, notes, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        `, [serverName, ipAddress, notes || '']);
        return { done: true };
    }

    case 'SERVERMANAGER_GET_LOCATION': {
        const data = params[0] || {};
        const { locationId } = data;
        const { rows } = await client.query(`
        SELECT *
        FROM servermanager.server_locations
        WHERE id = $1
        LIMIT 1
        `, [locationId]);
        return rows;
    }

    case 'SERVERMANAGER_LIST_LOCATIONS': {
        const { rows } = await client.query(`
        SELECT *
        FROM servermanager.server_locations
        ORDER BY id ASC
        `);
        return rows;
    }

    case 'SERVERMANAGER_DELETE_LOCATION': {
        const data = params[0] || {};
        const { locationId } = data;
        await client.query(`
        DELETE FROM servermanager.server_locations
        WHERE id = $1
        `, [locationId]);
        return { done: true };
    }

    case 'SERVERMANAGER_UPDATE_LOCATION': {
        const data = params[0] || {};
        const { locationId, newName, newIp, newNotes } = data;
        await client.query(`
        UPDATE servermanager.server_locations
        SET
            server_name = $2,
            ip_address  = $3,
            notes       = $4,
            updated_at  = NOW()
        WHERE id = $1
        `, [locationId, newName, newIp, newNotes]);
        return { done: true };
        }

    // ─────────────────────────────────────────────────────────────────────────
    // MEDIA MANAGER
    // ─────────────────────────────────────────────────────────────────────────
    case 'INIT_MEDIA_SCHEMA': {
        await client.query(`
        CREATE SCHEMA IF NOT EXISTS mediamanager;
        `);
        await client.query(`
        CREATE TABLE IF NOT EXISTS mediamanager.media_files (
            id SERIAL PRIMARY KEY,
            file_name   VARCHAR(255) NOT NULL,
            file_type   VARCHAR(100) NOT NULL,
            category    VARCHAR(100),
            user_id     INT,
            location    VARCHAR(500),
            folder      VARCHAR(500),
            notes       TEXT,
            created_at  TIMESTAMP DEFAULT NOW(),
            updated_at  TIMESTAMP DEFAULT NOW()
        );
        `);
        return { done: true };
    }
    
    case 'MEDIA_ADD_FILE': {
        // We assume meltdown bridging passes data as an object in params[0].
        const data = params[0] || {};
        const { fileName, fileType, category, userId, location, folder, notes } = data;
    
        await client.query(`
        INSERT INTO mediamanager.media_files
        (file_name, file_type, category, user_id, location, folder, notes, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        `, [fileName, fileType, category, userId, location, folder, notes]);
        return { done: true };
    }
    
    case 'MEDIA_LIST_FILES': {
        // Possibly filter by category or fileType
        const data = params[0] || {};
        const { filterCategory, filterFileType } = data;
    
        let whereClauses = [];
        let values = [];
        let idx = 1;
    
        if (filterCategory) {
        whereClauses.push(`category = $${idx++}`);
        values.push(filterCategory);
        }
        if (filterFileType) {
        whereClauses.push(`file_type = $${idx++}`);
        values.push(filterFileType);
        }
        let whereString = whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : '';
    
        const query = `
        SELECT *
        FROM mediamanager.media_files
        ${whereString}
        ORDER BY id DESC
        `;
        const { rows } = await client.query(query, values);
        return rows;
    }
    
    case 'MEDIA_DELETE_FILE': {
        // meltdown => dbDelete => where: { rawSQL: 'MEDIA_DELETE_FILE', fileId }
        const data = params[0] || {};
        const { fileId } = data;
        await client.query(`
        DELETE FROM mediamanager.media_files
        WHERE id = $1
        `, [fileId]);
        return { done: true };
    }
    
    case 'MEDIA_UPDATE_FILE': {
        // meltdown => dbUpdate => data = { rawSQL: 'MEDIA_UPDATE_FILE', fileId, newCategory, newNotes, newFolder }
        const data = params[0] || {};
        const { fileId, newCategory, newNotes, newFolder } = data;
    
        await client.query(`
        UPDATE mediamanager.media_files
        SET
            category = COALESCE($2, category),
            notes    = COALESCE($3, notes),
            folder   = COALESCE($4, folder),
            updated_at = NOW()
        WHERE id = $1
        `, [fileId, newCategory, newNotes, newFolder]);
        return { done: true };
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // SHARE MANAGER
    // ─────────────────────────────────────────────────────────────────────────

    case 'INIT_SHARED_LINKS_TABLE': {
    await client.query(`
        CREATE SCHEMA IF NOT EXISTS sharemanager;
        CREATE TABLE IF NOT EXISTS sharemanager.shared_links (
        id SERIAL PRIMARY KEY,
        short_token VARCHAR(32) UNIQUE NOT NULL,
        file_path   TEXT NOT NULL,
        created_by  INT NOT NULL,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        is_public   BOOLEAN NOT NULL DEFAULT TRUE
        -- Possibly expires_at TIMESTAMP or other columns
        );
    `);
    return { done: true };
    }
    
    case 'CREATE_SHARE_LINK': {
    // meltdown bridging passes dataObj in params[0], e.g. { shortToken, filePath, userId, isPublic }
    const dataObj = params[0] || {};
    const { shortToken, filePath, userId, isPublic } = dataObj;
    
    const insertRes = await client.query(`
        INSERT INTO sharemanager.shared_links
        (short_token, file_path, created_by, is_public, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        RETURNING *;
    `, [shortToken, filePath, userId, isPublic]);
    return insertRes.rows[0];
    }
    
    case 'REVOKE_SHARE_LINK': {
    const dataObj = params[0] || {};
    const { shortToken, userId } = dataObj;
    // For a real "delete," you'd do:
    // DELETE FROM sharemanager.shared_links WHERE short_token=$1 AND created_by=$2;
    // Or just set is_public = false
    await client.query(`
        UPDATE sharemanager.shared_links
        SET is_public = false
        WHERE short_token=$1
        AND created_by=$2
    `, [shortToken, userId]);
    return { done: true };
    }
    
    case 'GET_SHARE_LINK': {
    const dataObj = params[0] || {};
    const { shortToken } = dataObj;
    const { rows } = await client.query(`
        SELECT *
        FROM sharemanager.shared_links
        WHERE short_token=$1
        LIMIT 1
    `, [shortToken]);
    return rows; // or rows[0]
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TRANSLATION MANAGER
    // ─────────────────────────────────────────────────────────────────────────
    case 'INIT_TRANSLATION_TABLES': {
    await client.query(`
        CREATE SCHEMA IF NOT EXISTS translationmanager;
    
        CREATE TABLE IF NOT EXISTS translationmanager.translation_usage (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL,
        provider VARCHAR(50),
        chars INT DEFAULT 0,
        from_lang VARCHAR(5),
        to_lang VARCHAR(5),
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    
        CREATE TABLE IF NOT EXISTS translationmanager.translation_cache (
        id SERIAL PRIMARY KEY,
        provider VARCHAR(50),
        from_lang VARCHAR(5),
        to_lang VARCHAR(5),
        source_text TEXT,
        translated_text TEXT,
        user_id INT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
    `);
    return { done: true };
    }
    
        // ─────────────────────────────────────────────────────────────────────────
    // WIDGET MANAGER
    // ─────────────────────────────────────────────────────────────────────────
 
    case 'INIT_WIDGETS_TABLE_PUBLIC': {
    // Ensure schema widgetmanager exists
    await client.query(`CREATE SCHEMA IF NOT EXISTS widgetmanager;`);

    await client.query(`
        CREATE TABLE IF NOT EXISTS widgetmanager.widgets_public (
          id          SERIAL PRIMARY KEY,
          widget_id   VARCHAR(255) NOT NULL,
          label       VARCHAR(255),
          content     TEXT NOT NULL,
          category    VARCHAR(255),
          "order"     INT DEFAULT 0,
          created_at  TIMESTAMP DEFAULT NOW(),
          updated_at  TIMESTAMP DEFAULT NOW(),
          UNIQUE(widget_id)
        );
    `);
    return { done: true };
    }

    case 'INIT_WIDGETS_TABLE_ADMIN': {
    await client.query(`CREATE SCHEMA IF NOT EXISTS widgetmanager;`);

    await client.query(`
        CREATE TABLE IF NOT EXISTS widgetmanager.widgets_admin (
          id          SERIAL PRIMARY KEY,
          widget_id   VARCHAR(255) NOT NULL,
          label       VARCHAR(255),
          content     TEXT NOT NULL,
          category    VARCHAR(255),
          "order"     INT DEFAULT 0,
          created_at  TIMESTAMP DEFAULT NOW(),
          updated_at  TIMESTAMP DEFAULT NOW(),
          UNIQUE(widget_id)
        );
    `);
    return { done: true };
    }

    /* ---------- CRUD helpers (used by updateWidget & deleteWidget) ---------- */

    case 'UPDATE_WIDGET_PUBLIC': {
    // params[0] carries { widgetId, newLabel, newContent, newCategory, newOrder }
    const d = params[0] || {};
    await client.query(`
        UPDATE widgetmanager.widgets_public
            SET label      = COALESCE($2,label),
                content    = COALESCE($3,content),
                category   = COALESCE($4,category),
                "order"    = COALESCE($5,"order"),
                updated_at = NOW()
          WHERE widget_id  = $1
    `, [d.widgetId, d.newLabel, d.newContent, d.newCategory, d.newOrder]);
    return { done:true };
    }

    case 'UPDATE_WIDGET_ADMIN': {
    const d = params[0] || {};
    await client.query(`
        UPDATE widgetmanager.widgets_admin
            SET label      = COALESCE($2,label),
                content    = COALESCE($3,content),
                category   = COALESCE($4,category),
                "order"    = COALESCE($5,"order"),
                updated_at = NOW()
          WHERE widget_id  = $1
    `, [d.widgetId, d.newLabel, d.newContent, d.newCategory, d.newOrder]);
    return { done:true };
    }

    case 'DELETE_WIDGET_PUBLIC': {
    const { widgetId } = params[0] || {};
    await client.query(`DELETE FROM widgetmanager.widgets_public WHERE widget_id = $1`, [widgetId]);
    return { done:true };
    }

    case 'DELETE_WIDGET_ADMIN': {
    const { widgetId } = params[0] || {};
    await client.query(`DELETE FROM widgetmanager.widgets_admin WHERE widget_id = $1`, [widgetId]);
    return { done:true };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PlainSpace
    // ─────────────────────────────────────────────────────────────────────────
    case 'INIT_PLAINSPACE_LAYOUTS': {
      // We create a "plainspace" schema if not exists
      await client.query('CREATE SCHEMA IF NOT EXISTS plainspace;');
      // Then a table "plainspace.layouts" to store the layout JSON for each page + lane + viewport
      // If you want advanced usage, you could store each widget row individually,
      // but let's store the entire layout array as JSON in one column for each (pageId, lane, viewport).
      await client.query(`
        CREATE TABLE IF NOT EXISTS plainspace.layouts (
          id           SERIAL PRIMARY KEY,
          page_id      INT NOT NULL,       -- or page_slug VARCHAR(255), up to you
          lane         VARCHAR(50) NOT NULL,  -- "public" or "admin"
          viewport     VARCHAR(100) NOT NULL, -- e.g. "desktop", "mobile", "768px" etc
          layout_json  JSONB NOT NULL,
          updated_at   TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE (page_id, lane, viewport)
        );
      `);
      return { done:true };
    }

    case 'INIT_PLAINSPACE_LAYOUT_TEMPLATES': {
      await client.query('CREATE SCHEMA IF NOT EXISTS plainspace;');
      await client.query(`
        CREATE TABLE IF NOT EXISTS plainspace.layout_templates (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          lane VARCHAR(50) NOT NULL,
          viewport VARCHAR(100) NOT NULL,
          layout_json JSONB NOT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );
      `);
      return { done: true };
    }
    
    case 'UPSERT_PLAINSPACE_LAYOUT': {
      // "params" => { pageId, lane, viewport, layoutArr }
      const d = params[0] || {};
      // We'll store d.layoutArr as JSON in layout_json.
      // Because we want upsert, we can do an INSERT ... ON CONFLICT (...) DO UPDATE ...
      // in Postgres.
      await client.query(`
        INSERT INTO plainspace.layouts (page_id, lane, viewport, layout_json, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (page_id, lane, viewport)
        DO UPDATE SET layout_json = EXCLUDED.layout_json,
                      updated_at  = NOW()
      `, [
        d.pageId,
        d.lane,
        d.viewport,
        JSON.stringify(d.layoutArr || [])
      ]);
      return { success:true };
    }

    case 'UPSERT_PLAINSPACE_LAYOUT_TEMPLATE': {
      const d = params[0] || {};
      await client.query(`
        INSERT INTO plainspace.layout_templates (name, lane, viewport, layout_json, updated_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (name)
        DO UPDATE SET lane = EXCLUDED.lane,
                      viewport = EXCLUDED.viewport,
                      layout_json = EXCLUDED.layout_json,
                      updated_at = NOW()
      `, [
        d.name,
        d.lane,
        d.viewport,
        JSON.stringify(d.layoutArr || [])
      ]);
      return { success:true };
    }

    case 'GET_PLAINSPACE_LAYOUT_TEMPLATE': {
      const d = params[0] || {};
      const result = await client.query(`
        SELECT layout_json
          FROM plainspace.layout_templates
         WHERE name = $1
      `, [d.name]);
      return result.rows;
    }
    
    case 'GET_PLAINSPACE_LAYOUT': {
      // "params" => { pageId, lane, viewport }
      const d = params[0] || {};
      const result = await client.query(`
        SELECT layout_json
          FROM plainspace.layouts
         WHERE page_id = $1
           AND lane    = $2
           AND viewport = $3
      `, [d.pageId, d.lane, d.viewport]);
    
      return result.rows;  // meltdown returns as array
    }
    
    case 'GET_ALL_PLAINSPACE_LAYOUTS': {
      // "params" => { pageId, lane }
      const d = params[0] || {};
      const result = await client.query(`
        SELECT viewport, layout_json
          FROM plainspace.layouts
         WHERE page_id = $1
           AND lane = $2
         ORDER BY viewport ASC
      `, [d.pageId, d.lane]);
      return result.rows;
    }
    
}
    notificationEmitter.notify({
      moduleName: 'databaseManager',
      notificationType: 'debug',
      priority: 'debug',
      message: `[PLACEHOLDER][PG] Unhandled built-in placeholder "${operation}". Doing nothing...`
    });

    return { done: false };
  }
  
  module.exports = { handleBuiltInPlaceholderPostgres };