/**
 * mother/modules/pagesManager/index.js
 *
 * Responsibilities:
 * 1) Ensure a dedicated database/schema (via meltdown => createDatabase).
 * 2) Ensure the "pages" table (via meltdown => dbUpdate => 'INIT_PAGES_TABLE').
 * 3) Register meltdown events for CRUD and advanced features:
 *    - createPage
 *    - getAllPages
 *    - getPagesByLane
 *    - getPageById
 *    - getPageBySlug
 *    - getChildPages
 *    - updatePage
 *    - setAsDeleted
 *    - deletePage
 *    - setAsStart
 *    - generateXmlSitemap
 */

require('dotenv').config();

const {
  ensurePagesManagerDatabase,
  ensurePageSchemaAndTable,
  getPageBySlugLocal
} = require('./pagesService');
const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');

const TIMEOUT_DURATION = 5000;

module.exports = {
  async initialize({ motherEmitter, isCore, jwt, nonce }) {
    if (!isCore) {
      console.error('[PAGE MANAGER] Must be loaded as a core module.');
      return;
    }
    if (!jwt) {
      console.error('[PAGE MANAGER] No JWT provided.');
      return;
    }

    console.log('[PAGE MANAGER] Initializing Page Manager...');

    try {
      // 1) Ensure DB/schema
      await ensurePagesManagerDatabase(motherEmitter, jwt, nonce);

      // 2) Ensure table
      await ensurePageSchemaAndTable(motherEmitter, jwt, nonce);

      // 3) Register meltdown events
      setupPagesManagerEvents(motherEmitter);

      // 4) Check if this module was already seeded using meltdown to call getSetting
      const seededVal = await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'getSetting',
          {
            jwt,
            moduleName: 'settingsManager',
            moduleType: 'core',
            key: 'PAGESMANAGER_SEEDED'
          },
          (err, val) => (err ? reject(err) : resolve(val))
        );
      });

      if (seededVal !== 'true') {
        console.log('[PAGE MANAGER] First-time seeding of widgets and pages...');


        // Check if any pages exist. If none => seed "Coming Soon"
        const pages = await new Promise((resolve, reject) => {
          motherEmitter.emit(
            'getAllPages',
            { jwt, moduleName: 'pagesManager', moduleType: 'core' },
            onceCallback((err, list = []) => (err ? reject(err) : resolve(list)))
          );
        });

        if (pages.length === 0) {
          console.log('[PAGE MANAGER] No pages found → seeding "Coming Soon"...');

          // create "Coming Soon" page
          const { pageId } = await new Promise((resolve, reject) => {
            motherEmitter.emit(
              'createPage',
              {
                jwt,
                moduleName: 'pagesManager',
                moduleType: 'core',
                title: 'Coming Soon',
                slug: 'coming-soon',
                lane: 'public',
                status: 'published',
                translations: [{
                  language: 'en',
                  title: 'Coming Soon',
                  html: '<div style="text-align:center;margin-top:20%;"><h1>🚧 Site Under Maintenance 🚧</h1><p>We\'ll be back shortly.</p></div>',
                  metaDesc: 'Site under maintenance.',
                  seoTitle: 'Coming Soon',
                  seoKeywords: 'maintenance, coming soon'
                }],
                is_content: false
              },
              onceCallback((err, result) => (err ? reject(err) : resolve(result)))
            );
          });

          // setAsStart => meltdown
          await new Promise((resolve, reject) => {
            motherEmitter.emit(
              'setAsStart',
              {
                jwt,
                moduleName: 'pagesManager',
                moduleType: 'core',
                pageId,
                language: 'en'
              },
              onceCallback(err => (err ? reject(err) : resolve()))
            );
          });

          // setSetting => meltdown => enable Maintenance Mode
          await new Promise((resolve, reject) => {
            motherEmitter.emit(
              'setSetting',
              {
                jwt,
                moduleName: 'settingsManager',
                moduleType: 'core',
                key: 'MAINTENANCE_MODE',
                value: 'true'
              },
              onceCallback(err => (err ? reject(err) : resolve()))
            );
          });

          console.log('[PAGE MANAGER] Maintenance mode enabled ✔');
        }

        // Mark PAGESMANAGER_SEEDED => meltdown => setSetting
        await new Promise((resolve, reject) => {
          motherEmitter.emit(
            'setSetting',
            {
              jwt,
              moduleName: 'settingsManager',
              moduleType: 'core',
              key: 'PAGESMANAGER_SEEDED',
              value: 'true'
            },
            onceCallback(err => (err ? reject(err) : resolve()))
          );
        });
        console.log('[PAGE MANAGER] Seeding completed successfully.');
      }

      // 5) Always issue a public token
      global.pagesPublicToken = await new Promise((resolve, reject) => {
        motherEmitter.emit(
          'issuePublicToken',
          { purpose: 'public', moduleName: 'pagesManager' },
          (err, publicToken) => (err ? reject(err) : resolve(publicToken))
        );
      });
      // Avoid leaking the actual token in logs. Show only a short prefix
      const truncated = (global.pagesPublicToken || '').slice(0, 8);
      console.log('[DEBUG] pagesManager init => public token issued (%s...)', truncated);

      console.log('[PAGE MANAGER] Public token ready.');
      console.log('[PAGE MANAGER] Initialized successfully.');

    } catch (err) {
      console.error('[PAGE MANAGER] Initialization error:', err.message);
    }
  }
};


/**
 * setupPagesManagerEvents:
 * Registers meltdown event handlers for page CRUD + more.
 */
function setupPagesManagerEvents(motherEmitter) {

  // ─────────────────────────────────────────────────────────────────
  // CREATE PAGE (with auto-deduped slug logic)
  // ─────────────────────────────────────────────────────────────────
  motherEmitter.on('createPage', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
  
    const {
      jwt,
      moduleName,
      moduleType,
      title: rawTitle = '',
      slug: rawSlug = '',
      status = 'draft',
      seo_image = '',
      translations = [],
      parent_id = null,
      is_content = false,
      lane = 'public',
      language = 'en',
      meta = null
    } = payload || {};
  
    if (!jwt || moduleName !== 'pagesManager' || moduleType !== 'core') {
      return callback(new Error('[pagesManager] createPage => invalid meltdown payload.'));
    }
    if (!['public', 'admin'].includes(lane)) {
      return callback(new Error(`[pagesManager] createPage => invalid lane "${lane}". Must be "public" or "admin".`));
    }

    const { decodedJWT } = payload;
    if (decodedJWT && !hasPermission(decodedJWT, 'pages.create')) {
      return callback(new Error('Forbidden – missing permission: pages.create'));
    }
  
    const mainTitle = rawTitle.trim() || (translations[0]?.title ?? '').trim();
    if (!mainTitle) {
      return callback(new Error('A non-empty "title" is required.'));
    }
  
    const makeSlug = (str) =>
      String(str)
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .split('/')
        .map(seg => seg.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
        .filter(Boolean)
        .join('/')
        .substring(0, 96);
  
    const baseSlug = rawSlug.trim() ? makeSlug(rawSlug) : makeSlug(mainTitle);
    if (!baseSlug) {
      return callback(new Error('Could not generate a valid slug.'));
    }

    let finalSlug = baseSlug;
    const RESERVED = ['admin', 'app', 'api'];
    const firstSeg = finalSlug.split('/')[0];
    if (RESERVED.includes(firstSeg)) {
      return callback(new Error('Slug is reserved.'));
    }
    let tries = 0;
  
    // Check if slug already exists:
    const checkSlug = async () => {
      try {
        const existingPage = await getPageBySlugLocal(motherEmitter, jwt, finalSlug, lane);
        if (existingPage) {
          tries++;
          if (tries > 20) {
            return callback(new Error('Could not find free slug after 20 attempts.'));
          }
          finalSlug = `${baseSlug}-${tries}`;
          return checkSlug();
        }
        doInsert();
      } catch (err) {
        callback(err);
      }
    };
  
    const doInsert = () => {
      motherEmitter.emit(
        'dbUpdate',
        {
          jwt,
          moduleName: 'pagesManager',
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'CREATE_PAGE',
            params: {
              slug: finalSlug,
              status,
              seo_image,
              translations,
              lane,
              parent_id: parent_id || null,
              is_content,
              language,
              title: mainTitle,
              meta
            }
         }
       },
        (err, createRes) => {
          if (err && err.code === '23505') {
            tries++;
            if (tries > 20) {
              return callback(new Error('Could not generate a unique slug after 20 attempts.'));
            }
            finalSlug = `${baseSlug}-${tries}`;
            return doInsert();
          }
          if (err) return callback(err);
  
          const pageId = createRes?.insertedId ?? null;
          if (!pageId) {
            return callback(new Error('Could not retrieve newly created page ID.'));
          }
          callback(null, { pageId });
        }
      );
    };
  
    checkSlug();
  });
  
  

  // ─────────────────────────────────────────────────────────────────
  // GET ALL PAGES
  // ─────────────────────────────────────────────────────────────────
  motherEmitter.on('getAllPages', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, moduleName, moduleType } = payload || {};
      if (!jwt || moduleName !== 'pagesManager' || moduleType !== 'core') {
        return callback(new Error('[pagesManager] getAllPages => invalid meltdown payload.'));
      }

      const to = setTimeout(() => {
        callback(new Error('Timeout while fetching all pages.'));
      }, TIMEOUT_DURATION);

      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName : 'pagesManager',
          moduleType : 'core',
          table      : '__rawSQL__',
          data       : { rawSQL: 'GET_ALL_PAGES' }
        },
        (err, result) => {
          clearTimeout(to);
          if (err) return callback(err);
          callback(null, result || []);
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // GET PAGES BY LANE (e.g. 'public' or 'admin')
  // ─────────────────────────────────────────────────────────────────
  motherEmitter.on('getPagesByLane', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, moduleName, moduleType, lane } = payload || {};
      if (!jwt || moduleName !== 'pagesManager' || moduleType !== 'core') {
        return callback(new Error('[pagesManager] getPagesByLane => invalid meltdown payload.'));
      }
      if (!lane || !['public','admin'].includes(lane)) {
        return callback(new Error('A valid "lane" argument ("public"|"admin") is required.'));
      }

      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName: 'pagesManager',
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'GET_PAGES_BY_LANE',
            params: { lane }
          }
        },
        (err, rows = []) => {
          if (err) return callback(err);
          callback(null, rows);
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // GET PAGE BY ID
  // ─────────────────────────────────────────────────────────────────
  motherEmitter.on('getPageById', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, moduleName, moduleType, pageId } = payload || {};
      if (!jwt || moduleName !== 'pagesManager' || moduleType !== 'core') {
        return callback(new Error('[pagesManager] getPageById => invalid meltdown payload.'));
      }
      if (!pageId) {
        return callback(new Error('A valid pageId is required.'));
      }

      const to = setTimeout(() => {
        callback(new Error('Timeout while fetching page by ID.'));
      }, TIMEOUT_DURATION);

      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName : 'pagesManager',
          moduleType : 'core',
          table      : '__rawSQL__',
          data       : {
            rawSQL: 'GET_PAGE_BY_ID',
            // pass the pageId and optional language param
            0: pageId,
            1: 'en'
          }
        },
        (err, result) => {
          clearTimeout(to);
          if (err) return callback(err);
          callback(null, result || null);
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // GET PAGE BY SLUG
  // ─────────────────────────────────────────────────────────────────
  motherEmitter.on('getPageBySlug', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
  
    try {
      const {
        jwt,
        moduleName,
        moduleType,
        slug        = '',
        lane        = 'public',
        language    = 'en'
      } = payload || {};
  
      if (!jwt || moduleName !== 'pagesManager' || moduleType !== 'core') {
        return callback(new Error('[pagesManager] getPageBySlug => invalid payload.'));
      }
  
      const safeSlug = String(slug).trim();
      if (!safeSlug) {
        return callback(new Error('A non-empty slug is required.'));
      }
  
      const to = setTimeout(() => {
        callback(new Error('Timeout while fetching page by slug.'));
      }, TIMEOUT_DURATION);
  
      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName : 'pagesManager',
          moduleType : 'core',
          table      : '__rawSQL__',
          data       : {
            rawSQL : 'GET_PAGE_BY_SLUG',
            0      : safeSlug,
            1      : lane,
            2      : language
          }
        },
        (err, result = null) => {
          clearTimeout(to);          
  
          if (err) return callback(err);
  
          // ② Datensatz(e) normalisieren
          const rows = Array.isArray(result)          ? result
                     : Array.isArray(result?.rows)    ? result.rows
                     : (result ? [result] : []);
  
          callback(null, rows[0] ?? null);           
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // GET START PAGE BY LANGUAGE
  // ─────────────────────────────────────────────────────────────────
  motherEmitter.on('getStartPage', (payload, originalCb) => {
    const callback = onceCallback(originalCb);

    try {
      const {
        jwt,
        moduleName,
        moduleType,
        language = 'en'
      } = payload || {};

      if (!jwt || moduleName !== 'pagesManager' || moduleType !== 'core') {
        return callback(new Error('[pagesManager] getStartPage => invalid payload.'));
      }

      const safeLang = String(language).trim().toLowerCase() || 'en';

      const to = setTimeout(() => {
        callback(new Error('Timeout while fetching start page.'));
      }, TIMEOUT_DURATION);

      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName: 'pagesManager',
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'GET_START_PAGE',
            0: safeLang
          }
        },
        (err, result = null) => {
          clearTimeout(to);

          if (err) return callback(err);

          const rows = Array.isArray(result)
            ? result
            : Array.isArray(result?.rows)
              ? result.rows
              : (result ? [result] : []);

          callback(null, rows[0] ?? null);
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // GET CHILD PAGES BY PARENT ID
  // ─────────────────────────────────────────────────────────────────
  motherEmitter.on('getChildPages', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, moduleName, moduleType, parentId } = payload || {};
      if (!jwt || moduleName !== 'pagesManager' || moduleType !== 'core') {
        return callback(new Error('[pagesManager] getChildPages => invalid payload.'));
      }
      if (!parentId) {
        return callback(new Error('parentId is required.'));
      }

      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName: 'pagesManager',
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'GET_CHILD_PAGES',
            params: [parentId]
          }
        },
        callback
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // UPDATE PAGE
  // ─────────────────────────────────────────────────────────────────
  motherEmitter.on('updatePage', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const {
        jwt,
        moduleName,
        moduleType,
        pageId,
        slug,
        status,
        seoImage,
        seo_image,
        translations,
        parent_id,
        is_content,
        lane = 'public',
        language = 'en',
        title = '',
        meta = null
      } = payload || {};

      if (!jwt || moduleName !== 'pagesManager' || moduleType !== 'core') {
        return callback(new Error('[pagesManager] updatePage => invalid meltdown payload.'));
      }
      if (!pageId) {
        return callback(new Error('pageId is required to update a page.'));
      }

      const { decodedJWT } = payload;
      if (decodedJWT && !hasPermission(decodedJWT, 'pages.update')) {
        return callback(new Error('Forbidden – missing permission: pages.update'));
      }

      const to = setTimeout(() => {
        callback(new Error('Timeout while updating page.'));
      }, TIMEOUT_DURATION);

      motherEmitter.emit(
        'dbUpdate',
        {
          jwt,
          moduleName : 'pagesManager',
          moduleType : 'core',
          table      : '__rawSQL__',
          data       : {
            rawSQL   : 'UPDATE_PAGE',
            params   : {
              pageId,
              slug,
              status,
              seo_image    : (typeof seoImage !== 'undefined' ? seoImage : seo_image),
              translations : translations,
              parent_id    : parent_id || null,
              is_content   : is_content || false,
              lane,
              language,
              title,
              meta
            }
          }
        },
        (err, result) => {
          clearTimeout(to);
          if (err) return callback(err);
          callback(null, result || null);
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // SET PAGE AS DELETED (status+slug update)
  // ─────────────────────────────────────────────────────────────────
  motherEmitter.on('setAsDeleted', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, moduleName, moduleType, pageId } = payload || {};
      if (!jwt || moduleName !== 'pagesManager' || moduleType !== 'core') {
        return callback(new Error('[pagesManager] setAsDeleted => invalid meltdown payload.'));
      }
      if (!pageId) {
        return callback(new Error('A valid pageId is required to mark as deleted.'));
      }

      const { decodedJWT } = payload;
      if (decodedJWT && !hasPermission(decodedJWT, 'pages.delete')) {
        return callback(new Error('Forbidden – missing permission: pages.delete'));
      }

      motherEmitter.emit(
        'getPageById',
        { jwt, moduleName: 'pagesManager', moduleType: 'core', pageId },
        (err, page) => {
          if (err || !page) return callback(err || new Error('Page not found'));

          motherEmitter.emit(
            'updatePage',
            {
              jwt,
              moduleName: 'pagesManager',
              moduleType: 'core',
              pageId,
              slug: `deleted-${Date.now()}`,
              status: 'deleted',
              seoImage: page.seo_image,
              parent_id: page.parent_id,
              is_content: page.is_content,
              lane: page.lane,
              language: page.language,
              title: page.title,
              meta: page.meta,
              translations: []
            },
            callback
          );
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // SEARCH PAGES BY TITLE OR SLUG
  // ─────────────────────────────────────────────────────────────────
  motherEmitter.on('searchPages', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const {
        jwt,
        moduleName,
        moduleType,
        query = '',
        lane = 'all',
        limit = 20
      } = payload || {};

      if (!jwt || moduleName !== 'pagesManager' || moduleType !== 'core') {
        return callback(new Error('[pagesManager] searchPages => invalid meltdown payload.'));
      }

      const { decodedJWT } = payload;
      if (decodedJWT && !hasPermission(decodedJWT, 'pages.read')) {
        return callback(new Error('Forbidden – missing permission: pages.read'));
      }

      const safeQuery = String(query).trim();
      if (!safeQuery) {
        return callback(null, []);
      }

      const laneVal = ['all', 'public', 'admin'].includes(lane) ? lane : 'all';
      const limVal = Math.min(parseInt(limit, 10) || 20, 50);

      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName: 'pagesManager',
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'SEARCH_PAGES',
            params: { query: safeQuery, lane: laneVal, limit: limVal }
          }
        },
        callback
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // DELETE PAGE
  // ─────────────────────────────────────────────────────────────────
  motherEmitter.on('deletePage', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, moduleName, moduleType, pageId } = payload || {};
      if (!jwt || moduleName !== 'pagesManager' || moduleType !== 'core') {
        return callback(new Error('[pagesManager] deletePage => invalid meltdown payload.'));
      }
      if (!pageId) {
        return callback(new Error('A valid pageId is required to delete a page.'));
      }

      const { decodedJWT } = payload;
      if (decodedJWT && !hasPermission(decodedJWT, 'pages.delete')) {
        return callback(new Error('Forbidden – missing permission: pages.delete'));
      }

      motherEmitter.emit(
        'setAsDeleted',
        { jwt, moduleName: 'pagesManager', moduleType: 'core', pageId },
        (err) => {
          if (err) return callback(err);

          const to = setTimeout(() => {
            callback(new Error('Timeout while deleting a page.'));
          }, TIMEOUT_DURATION);

          motherEmitter.emit(
            'dbDelete',
            {
              jwt,
              moduleName : 'pagesManager',
              moduleType : 'core',
              table      : '__rawSQL__',
              where      : {
                rawSQL: 'DELETE_PAGE',
                0     : pageId
              }
            },
            (err2, result) => {
              clearTimeout(to);
              if (err2) return callback(err2);
              callback(null, result || null);
            }
          );
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // SET PAGE AS START (e.g. the homepage)
  // ─────────────────────────────────────────────────────────────────
  motherEmitter.on('setAsStart', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, moduleName, moduleType, pageId } = payload || {};
      if (!jwt || moduleName !== 'pagesManager' || moduleType !== 'core') {
        return callback(new Error('[pagesManager] setAsStart => invalid meltdown payload.'));
      }
      if (!pageId) {
        return callback(new Error('A pageId is required to set as start.'));
      }

      const { decodedJWT } = payload;
      if (decodedJWT && !hasPermission(decodedJWT, 'pages.manage')) {
        return callback(new Error('Forbidden – missing permission: pages.manage'));
      }

      motherEmitter.emit(
        'getPageById',
        { jwt, moduleName, moduleType, pageId },
        (err, page) => {
          if (err || !page) return callback(new Error('Page not found or error retrieving page.'));
          if (page.status !== 'published') {
            return callback(new Error('Only a published page can be set as the start page.'));
          }

          const finalLanguage = payload.language || page.language || 'en';

          motherEmitter.emit(
            'dbUpdate',
            {
              jwt,
              moduleName,
              moduleType,
              table: '__rawSQL__',
              data: {
                rawSQL: 'SET_AS_START',
                params: [ { pageId, language: finalLanguage } ]
              }
            },
            callback
          );
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // ─────────────────────────────────────────────────────────────────
  // GENERATE XML SITEMAP
  // ─────────────────────────────────────────────────────────────────
  motherEmitter.on('generateXmlSitemap', (payload, originalCb) => {
    const callback = onceCallback(originalCb);
    try {
      const { jwt, moduleName, moduleType, languages } = payload || {};
      if (!jwt || moduleName !== 'pagesManager' || moduleType !== 'core') {
        return callback(new Error('[pagesManager] generateXmlSitemap => invalid meltdown payload.'));
      }

      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName: 'pagesManager',
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'GENERATE_XML_SITEMAP',
            languages: languages || []
          }
        },
        (err, pages) => {
          if (err) return callback(err);
          const xml = buildSitemap(pages);
          callback(null, xml);
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });
}

function buildSitemap(pages, baseUrl = process.env.APP_BASE_URL || 'https://example.com') {
  if (!Array.isArray(pages)) return '';

  const cleanBase = String(baseUrl).replace(/\/+$/, '');
  const header = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">';
  const footer = '</urlset>';

  const urlEntries = pages.map(page => {
    const slug = (page.slug || '').replace(/^\/+/, '');
    const loc = `${cleanBase}/${slug}`;
    const lastmod = page.updated_at ? new Date(page.updated_at).toISOString() : new Date().toISOString();
    const priority = page.is_start ? '1.0' : '0.5';

    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <priority>${priority}</priority>\n  </url>`;
  }).join('\n');

  return `${header}\n${urlEntries}\n${footer}`;
}
