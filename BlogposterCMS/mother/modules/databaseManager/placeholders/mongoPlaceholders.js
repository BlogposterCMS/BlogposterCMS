/* mother/admin/modules/databaseManager/placeholders/mongoPlaceholders.js
// Handles MongoDB-specific placeholders for the database manager module.
*/

const { ObjectId } = require('mongodb');
const notificationEmitter = require('../../../emitters/notificationEmitter');

function parseObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

async function createIndexWithRetry(collection, spec, options = {}, retries = 1) {
  const opts = Object.assign({}, options, { background: false });
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await collection.createIndex(spec, opts);
    } catch (err) {
      if (err.code === 11000 && attempt < retries) {
        await new Promise(r => setTimeout(r, 250));
      } else {
        throw err;
      }
    }
  }
}



async function handleBuiltInPlaceholderMongo(db, operation, params) {
  switch (operation) {
    
    // ─────────────────────────────────────────────────────────────────────────
    // USER MANAGEMENT
    // ─────────────────────────────────────────────────────────────────────────
    case 'INIT_USER_MANAGEMENT': {
        // Create collections if they do not exist
        await db.createCollection('users').catch(() => {});
        await db.createCollection('roles').catch(() => {});
        await db.createCollection('user_roles').catch(() => {});
        await db.createCollection('permissions').catch(() => {});
      
        // unique indexes for "users"
        await createIndexWithRetry(db.collection('users'), { username: 1 }, { unique: true }).catch(() => {});
        await createIndexWithRetry(db.collection('users'), { email: 1 }, { unique: true, sparse: true }).catch(() => {});
        // user_roles => unique index on (user_id, role_id)
        await createIndexWithRetry(db.collection('user_roles'), { user_id: 1, role_id: 1 }, { unique: true }).catch(() => {});
        await createIndexWithRetry(db.collection('permissions'), { permission_key: 1 }, { unique: true }).catch(() => {});
      
        // Add some default fields if they're missing without overriding
        // existing values. Avoid setting `email` to the same value on all
        // documents as it conflicts with the unique index.
        const usersCol = db.collection('users');
        await usersCol.updateMany(
          { first_name: { $exists: false } },
          { $set: { first_name: '' } }
        );
        await usersCol.updateMany(
          { last_name: { $exists: false } },
          { $set: { last_name: '' } }
        );
        await usersCol.updateMany(
          { display_name: { $exists: false } },
          { $set: { display_name: '' } }
        );
        await usersCol.updateMany(
          { ui_color: { $exists: false } },
          { $set: { ui_color: '' } }
        );
        await usersCol.updateMany(
          { phone: { $exists: false } },
          { $set: { phone: '' } }
        );
        await usersCol.updateMany(
          { company: { $exists: false } },
          { $set: { company: '' } }
        );
        await usersCol.updateMany(
          { website: { $exists: false } },
          { $set: { website: '' } }
        );
        await usersCol.updateMany(
          { avatar_url: { $exists: false } },
          { $set: { avatar_url: '' } }
        );
        await usersCol.updateMany(
          { bio: { $exists: false } },
          { $set: { bio: '' } }
        );
        await usersCol.updateMany(
          { token_version: { $exists: false } },
          { $set: { token_version: 0 } }
        );
        await usersCol.updateMany(
          { created_at: { $exists: false } },
          { $set: { created_at: new Date().toISOString() } }
        );
        await usersCol.updateMany(
          { updated_at: { $exists: false } },
          { $set: { updated_at: new Date().toISOString() } }
        );
      
        // Create index for "roles" and update to default fields
        await createIndexWithRetry(db.collection('roles'), { role_name: 1 }, { unique: true }).catch(() => {});
        await db.collection('roles').updateMany({}, {
          $set: {
            is_system_role: false,
            description: '',
            permissions: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        });
      
        // same for user_roles => just ensure created_at, updated_at
        await db.collection('user_roles').updateMany({}, {
          $set: {
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        });

        await db.collection('permissions').updateMany({}, {
          $set: {
            description: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        });
      
        return { done: true };
      }
      
      case 'INIT_B2B_FIELDS': {
        // For example, add 'company_name' & 'vat_number' as needed
        await db.collection('users').updateMany({}, {
          $set: {
            company_name: '',
            vat_number: ''
          }
        });
        return { done: true };
      }
      
      case 'ADD_USER_FIELD': {
        // expects fieldName, fieldType
        // In Mongo, we don't need a schema-based approach — just set it to null
        const fieldName = (params && params.fieldName) || 'extra_field';
      
        await db.collection('users').updateMany({}, {
          $set: {
            [fieldName]: null
          }
        });
        return { done: true };
      }

    // ─────────────────────────────────────────────────────────────────────────
    // SETTINGS MANAGER
    // ─────────────────────────────────────────────────────────────────────────
    case 'INIT_SETTINGS_SCHEMA': {
    return { done: true };
    }

    case 'INIT_SETTINGS_TABLES': {
    await db.createCollection('cms_settings').catch(() => {});
    await db.createCollection('module_events').catch(() => {});
    
    // Eindeutige Indizes erstellen:
    await db.collection('cms_settings').createIndex({ key: 1 }, { unique: true }).catch(() => {});
    
    return { done: true };
    }

    case 'CHECK_AND_ALTER_SETTINGS_TABLES': {
    await db.collection('cms_settings').updateMany(
        { something_else: { $exists: false } },
        { $set: { something_else: null } }
        );
        
        return { done: true };
        }

    case 'GET_SETTING': {
    const theKey = params && params[0];
    if (!theKey) return [];
    const doc = await db.collection('cms_settings').findOne({ key: theKey });
    return doc ? [doc] : [];
    }

    case 'UPSERT_SETTING': {
    const settingKey = params && params[0];
    const settingVal = params && params[1];
    await db.collection('cms_settings').updateOne(
        { key: settingKey },
        {
        $set: {
            value: settingVal,
            updated_at: new Date().toISOString()
        },
        $setOnInsert: {
            created_at: new Date().toISOString()
        }
        },
        { upsert: true }
    );
    return { done: true };
    }

    case 'GET_ALL_SETTINGS': {
    const docs = await db.collection('cms_settings').find({}).toArray();
    return docs;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PAGES MODULE
    // ─────────────────────────────────────────────────────────────────────────
    case 'INIT_PAGES_SCHEMA': {
      // Because in Mongo we don't have schemas like Postgres, we just create collections if needed.
      await db.createCollection('pages').catch(() => {});
      await db.createCollection('page_translations').catch(() => {});
      return { done: true };
    }
  
  
    /**
     *  2) Create or ensure indexes, approximating the logic in 'INIT_PAGES_TABLE'.
     *     Add your "unique slug" constraint, "unique page_id & language" for translations, etc.
     */
    case 'INIT_PAGES_TABLE': {
      await createIndexWithRetry(db.collection('pages'), { slug: 1, lane: 1 }, { unique: true }).catch(() => {});
      await createIndexWithRetry(db.collection('pages'), { slug: 1 }, { unique: true }).catch(() => {});
      // For "page_translations", we want (page_id, language) unique
      await createIndexWithRetry(
        db.collection('page_translations'),
        { page_id: 1, language: 1 },
        { unique: true }
      ).catch(() => {});

      // If you like, you might also want an index on `parent_id` for quick child lookups:
      await createIndexWithRetry(db.collection('pages'), { parent_id: 1 }).catch(() => {});
  
      return { done: true };
    }
  
  
    /**
     *  3) Since we can’t literally 'ALTER TABLE', we approximate the Postgres approach:
     *     - Add 'language' field if missing (default 'en')
     *     - Add 'is_content' field if missing (default false)
     *     - Add 'parent_id' field if missing
     *     - Create unique partial index for (language) where is_start = true
     */
    case 'CHECK_AND_ALTER_PAGES_TABLE': {
      // Add language if it doesn’t exist
      await db.collection('pages').updateMany(
        { language: { $exists: false } },
        { $set: { language: 'en' } }
      );
  
      // Add is_content if it doesn’t exist
      await db.collection('pages').updateMany(
        { is_content: { $exists: false } },
        { $set: { is_content: false } }
      );
  
      // Add parent_id if it doesn’t exist (we’ll just ensure the field is at least there)
      await db.collection('pages').updateMany(
        { parent_id: { $exists: false } },
        { $set: { parent_id: null } }
      );

      // Add lane if it doesn\'t exist
      await db.collection('pages').updateMany(
        { lane: { $exists: false } },
        { $set: { lane: 'public' } }
      );

      // Add title if it doesn\'t exist
      await db.collection('pages').updateMany(
        { title: { $exists: false } },
        { $set: { title: '' } }
      );

      // Add meta if it doesn\'t exist
      await db.collection('pages').updateMany(
        { meta: { $exists: false } },
        { $set: { meta: null } }
      );

      // Add id string if missing
      await db.collection('pages').updateMany(
        { id: { $exists: false } },
        [ { $set: { id: { $toString: '$_id' } } } ]
      );

      // Unique Index (is_start + language)
      await createIndexWithRetry(
        db.collection('pages'),
        { language: 1, is_start: 1 },
        { unique: true, partialFilterExpression: { is_start: true } }
      ).catch(() => {});

      // Ensure composite unique index on slug + lane
      await createIndexWithRetry(
        db.collection('pages'),
        { slug: 1, lane: 1 },
        { unique: true }
      ).catch(() => {});
  
      return { done: true };
    }
  
  
    /**
     *  4) A separate 'ADD_PARENT_CHILD_RELATION' in Postgres does an ALTER. 
     *     In Mongo, you can "simulate" it by making sure the field is present.
     */
    case 'ADD_PARENT_CHILD_RELATION': {
      // No real "ALTER TABLE" is needed in Mongo,
      // but let's ensure that we have a parent_id field for all docs.
      await db.collection('pages').updateMany(
        { parent_id: { $exists: false } },
        { $set: { parent_id: null } }
      );
      return { done: true };
    }
  
  
    /**
     *  5) Create a new page doc plus its translations:
     *     Now includes parent_id and is_content, matching the Postgres logic.
     */
    case 'CREATE_PAGE': {
      const p = Array.isArray(params) ? (params[0] || {}) : (params || {});
      const {
        slug,
        status,
        seo_image,
        translations = [],
        parent_id,
        is_content,
        lane,
        language,
        title,
        meta
      } = p;
  
      // 1) Insert main doc
      const newId = new ObjectId();
      const page = await db.collection('pages').insertOne({
        _id        : newId,
        id         : newId.toHexString(),
        slug,
        status     : status || 'draft',
        seo_image  : seo_image || '',
        is_start   : false,
        parent_id  : parseObjectId(parent_id),
        is_content : !!is_content,
        lane       : lane || 'public',
        language   : (language || 'en').toLowerCase(),
        title      : title || '',
        meta       : meta || null,
        created_at : new Date().toISOString(),
        updated_at : new Date().toISOString()
      });
  
      // 2) Insert translations
      const translationDocs = translations.map(t => ({
        page_id     : page.insertedId,
        language    : t.language,
        title       : t.title,
        html        : t.html,
        css         : t.css,
        meta_desc   : t.metaDesc,
        seo_title   : t.seoTitle,
        seo_keywords: t.seoKeywords,
        created_at  : new Date().toISOString(),
        updated_at  : new Date().toISOString()
      }));
      await db.collection('page_translations').insertMany(translationDocs);
  
      return { done: true, insertedId: newId.toHexString() };
    }
  
  
    /**
     *  6) Get child pages, matching the 'GET_CHILD_PAGES' in Postgres.
     *     We just query for pages with the given parent_id.
     */
    case 'GET_CHILD_PAGES': {
      const parentId = parseObjectId(params[0]);
      if (!parentId) return [];
      const childPages = await db.collection('pages')
                                .find({ parent_id: parentId })
                                .sort({ created_at: -1 })
                                .toArray();
      return childPages.map(p => ({
        ...p,
        id: p.id || (p._id ? p._id.toHexString() : undefined)
      }));
    }
  
  
    /**
     *  7) Return all pages, just like the Postgres version’s 'GET_ALL_PAGES'.
     */
    case 'GET_ALL_PAGES': {
      const allPages = await db.collection('pages')
                              .find({})
                              .sort({ _id: -1 })
                              .toArray();
      return allPages.map(p => ({
        ...p,
        id: p.id || (p._id ? p._id.toHexString() : undefined)
      }));
    }

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

      const pages = await db.collection('pages').aggregate([
        { $match: { lane: laneVal } },
        {
          $lookup: {
            from: 'page_translations',
            localField: '_id',
            foreignField: 'page_id',
            as: 'translation'
          }
        },
        { $unwind: { path: '$translation', preserveNullAndEmptyArrays: true } },
        { $sort: { created_at: -1 } },
        {
          $project: {
            _id: 1,
            slug: 1,
            status: 1,
            seo_image: 1,
            parent_id: 1,
            is_content: 1,
            lane: 1,
            language: 1,
            title: 1,
            meta: 1,
            created_at: 1,
            updated_at: 1,
            trans_lang: '$translation.language',
            trans_title: '$translation.title',
            trans_html: '$translation.html',
            trans_css: '$translation.css',
            meta_desc: '$translation.meta_desc',
            seo_title: '$translation.seo_title',
            seo_keywords: '$translation.seo_keywords'
          }
        }
      ]).toArray();
      return pages.map(p => ({
        ...p,
        id: p.id || (p._id ? p._id.toHexString() : undefined)
      }));
    }
  
  
    /**
     *  8) Get a page by ID + optional language. We also retrieve the matching translation.
     */
    case 'GET_PAGE_BY_ID': {
      const idObj = parseObjectId(params[0]);
      const lang = params[1] || 'en';

      if (!idObj) return null;
      const page = await db.collection('pages')
                           .findOne({ _id: idObj });
      if (!page) return null;
  
      const translation = await db.collection('page_translations')
                                  .findOne({
                                    page_id : page._id,
                                    language: lang
                                  });
  
      return { ...page, id: page.id || page._id.toHexString(), translation };
    }
  
  
    /**
     *  9) Get a page by slug + optional language, with translation included. 
     */
    case 'GET_PAGE_BY_SLUG': {
      const slug = params[0];
      const lane = params[1] || 'public';
      const lang = params[2] || 'en';

      const page = await db.collection('pages')
                           .findOne({ slug, lane });
      if (!page) return null;
  
      const translation = await db.collection('page_translations')
                                  .findOne({
                                    page_id : page._id,
                                    language: lang
                                  });
  
      return { ...page, id: page.id || page._id.toHexString(), translation };
    }
  
  
    /**
     * 10) Update page fields, including new fields parent_id, is_content, plus translations.
     *     We "upsert" translations if not present, just like in Postgres.
     */
    case 'UPDATE_PAGE': {
      const p = Array.isArray(params) ? (params[0] || {}) : (params || {});
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
        title,
        meta
      } = p;
  
      // 1) Update the main page
      const idObj = parseObjectId(pageId);
      if (!idObj) return { done: false };
      await db.collection('pages').updateOne(
        { _id: idObj },
        {
          $set: {
            slug,
            status,
            seo_image,
            parent_id : parseObjectId(parent_id),
            is_content: !!is_content,
            lane      : lane || 'public',
            language  : (language || 'en').toLowerCase(),
            title     : title || '',
            meta      : meta || null,
            updated_at: new Date().toISOString()
          }
        }
      );
  
      // 2) Upsert translations
      for (const t of translations) {
        await db.collection('page_translations').updateOne(
          {
            page_id : idObj,
            language: t.language
          },
          {
            $set: {
              title       : t.title,
              html        : t.html,
              css         : t.css,
              meta_desc   : t.metaDesc,
              seo_title   : t.seoTitle,
              seo_keywords: t.seoKeywords,
              updated_at  : new Date().toISOString()
            }
          },
          { upsert: true }
        );
      }
  
      return { done: true };
    }
  
  
    //
    // Removed legacy placeholders 'SET_AS_SUBPAGE' and
    // 'ASSIGN_PAGE_TO_POSTTYPE' which were unused and not present in the
    // Postgres implementation.

  
    /**
     * 13) Check if the page is published before setting as start page, 
     *     just like the fancy Postgres version. We’ll also do a transaction 
     *     if you have Mongo replica sets. If not, you can just do them in sequence.
     */
    case 'SET_AS_START': {
      const data = params[0] || {};
      const pageId = data.pageId;
      const idObj = parseObjectId(pageId);
      const language = (data.language || 'de').toLowerCase();

      if (!pageId) throw new Error('pageId required for SET_AS_START');

      // 1) Check page existence + status
      if (!idObj) throw new Error('Invalid pageId');
      const page = await db.collection('pages').findOne({ _id: idObj });
      if (!page) throw new Error('Page not found');
      if (page.status !== 'published') {
        throw new Error('Only published pages can be set as the start page');
      }
  
      // 2) Update the start page using a transaction when possible
      const client = db.client;
      if (client && typeof client.startSession === 'function') {
        const session = client.startSession();
        try {
          await session.withTransaction(async () => {
            await db.collection('pages').updateMany(
              { is_start: true, language },
              { $set: { is_start: false } },
              { session }
            );

            await db.collection('pages').updateOne(
              { _id: idObj },
              {
                $set: {
                  is_start  : true,
                  language,
                  updated_at: new Date().toISOString()
                }
              },
              { session }
            );
          });
        } finally {
          await session.endSession();
        }
      } else {
        // Fallback if client doesn't support transactions
        await db.collection('pages').updateMany(
          { is_start: true, language },
          { $set: { is_start: false } }
        );

        await db.collection('pages').updateOne(
          { _id: idObj },
          {
            $set: {
              is_start  : true,
              language,
              updated_at: new Date().toISOString()
            }
          }
        );
      }
  
      // 3) Re-create the partial unique index if needed
      await createIndexWithRetry(
        db.collection('pages'),
        { language: 1, is_start: 1 },
        {
          unique: true,
          partialFilterExpression: { is_start: true }
        }
      ).catch(() => {});
  
      return { done: true };
    }
  
  
    /**
     * 14) Get the start page for a given language, similar to 'GET_START_PAGE' in Postgres.
     */
    case 'GET_START_PAGE': {
      const lang = (Array.isArray(params) && typeof params[0] === 'string')
        ? params[0].toLowerCase()
        : 'de';
  
      const page = await db.collection('pages')
                           .findOne({ is_start: true, language: lang });
      if (!page) return null;
  
      const translation = await db.collection('page_translations')
                                  .findOne({
                                    page_id : page._id,
                                    language: lang
                                  });
  
      return { ...page, translation };
    }
  
  
    /**
     * 15) Retrieve data for building an XML sitemap.
     *     PagesManager will turn this result into XML.
     */
    case 'GENERATE_XML_SITEMAP': {
      const pages = await db.collection('pages')
                            .find({ status: 'published' })
                            .project({ slug: 1, updated_at: 1, is_start: 1 })
                            .sort({ _id: 1 })
                            .toArray();

      return pages;
    }

    case 'SEARCH_PAGES': {
      const p = Array.isArray(params) ? (params[0] || {}) : (params || {});
      const q = p.query || '';
      const lane = p.lane || 'all';
      const limit = parseInt(p.limit, 10) || 20;

      const regex = new RegExp(q, 'i');
      const filter = lane === 'all' ?
            { $or: [{ title: regex }, { slug: regex }] } :
            { lane, $or: [{ title: regex }, { slug: regex }] };

      const pages = await db.collection('pages')
                            .find(filter)
                            .sort({ created_at: -1 })
                            .limit(limit)
                            .toArray();

      return pages;
    }
  
  
    /**
     * 16) Delete page and its translations. 
     */
   case 'DELETE_PAGE': {
      const idObj = parseObjectId(params[0]);
      if (!idObj) return { done: false };

      await db.collection('pages').deleteOne({ _id: idObj });
      await db.collection('page_translations').deleteMany({ page_id: idObj });
      return { done: true };
    }
    // ─────────────────────────────────────────────────────────────────────────
    // MODULE LOADER
    // ─────────────────────────────────────────────────────────────────────────
    case 'DROP_MODULE_DATABASE': {
      // Expects params[0] = moduleName or collection name
      // For Mongo, you might drop the collection or do something else:
      const moduleName = params[0];
      await db.collection(moduleName).drop().catch(() => {});
      return { done: true };
    }
  
    case 'INIT_MODULE_REGISTRY_TABLE': {
      // Create module_registry collection if it doesn't exist
      await db.createCollection('module_registry').catch(() => {});
      return { done: true };
    }
  
    case 'CHECK_MODULE_REGISTRY_COLUMNS': {
      const sample = await db.collection('module_registry').findOne({}) || {};
      const indexes = await db.collection('module_registry').indexes();

      const colSet = new Set(Object.keys(sample));
      for (const idx of indexes) {
        for (const key of Object.keys(idx.key || {})) {
          colSet.add(key);
        }
      }

      return Array.from(colSet).map(name => ({ column_name: name }));
    }
  
    case 'ALTER_MODULE_REGISTRY_COLUMNS': {
      // Example: Add a field "description" to all documents if not present
      await db.collection('module_registry').updateMany(
        {},
        { $set: { description: '' } }
      );
      return { done: true };
    }
  
    case 'SELECT_MODULE_REGISTRY': {
      // Return all docs from module_registry
      const docs = await db.collection('module_registry').find({}).toArray();
      return docs;
    }
  
    case 'LIST_ACTIVE_GRAPES_MODULES': {
      // Return active modules with "grapesComponent" = true
      const docs = await db.collection('module_registry').find({
        is_active: true,
        'module_info.grapesComponent': true
      }).toArray();
      return docs;
    }

    case 'SELECT_MODULE_BY_NAME': {
      const p = Array.isArray(params) ? (params[0] || {}) : (params || {});
      const { moduleName } = p;
      const doc = await db.collection('module_registry').findOne({
        module_name: moduleName
      });
      return doc ? [doc] : [];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DEPENDENCY LOADER
    // ─────────────────────────────────────────────────────────────────────────
    case 'CHECK_DB_EXISTS_DEPENDENCYLOADER': {
      const admin = db.client?.db().admin() || db.admin();
      const { databases } = await admin.listDatabases();
      const found = databases.some((dbinfo) => dbinfo.name === 'dependencyloader_db');
      return found ? [{ name: 'dependencyloader_db' }] : [];
    }
  
    case 'INIT_DEPENDENCYLOADER_SCHEMA': {
        await db.createCollection('module_dependencies').catch(() => {});
        return { done: true };
    }
    
    case 'INIT_DEPENDENCYLOADER_TABLE': {
        await db.collection('module_dependencies').createIndex({ module_name: 1 }).catch(() => {});
        return { done: true };
    }
    
    case 'LIST_DEPENDENCYLOADER_DEPENDENCIES': {
        const docs = await db.collection('module_dependencies').find({}).toArray();
        return docs;
    }
  

    // ─────────────────────────────────────────────────────────────────────────
    // UNIFIED SETTINGS
    // ─────────────────────────────────────────────────────────────────────────
    case 'LIST_MODULE_SETTINGS': {
        const targetModule = params[0];
      
        const docs = await db.collection('cms_settings')
          .find({ key: { $regex: `^${targetModule}\\.` } })
          .toArray();
      
        return docs;
      }
      


    // ─────────────────────────────────────────────────────────────────────────
    // SERVER MANAGER
    // ─────────────────────────────────────────────────────────────────────────
    case 'INIT_SERVERMANAGER_SCHEMA': {
        await db.createCollection('server_locations').catch(() => {});
        return { done: true };
    }

    case 'SERVERMANAGER_ADD_LOCATION': {
        const data = params[0] || {};
        const { serverName, ipAddress, notes } = data;
        const newId = new ObjectId();
        await db.collection('server_locations').insertOne({
        _id        : newId,
        id         : newId.toHexString(),
        server_name: serverName,
        ip_address: ipAddress,
        notes: notes || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()

        });
        return { insertedId: newId.toHexString() };
    }

    case 'SERVERMANAGER_GET_LOCATION': {
        const data = params[0] || {};
        const { locationId } = data;

        const doc = await db.collection('server_locations').findOne({ id: locationId });
        return doc ? [doc] : [];
    }

    case 'SERVERMANAGER_LIST_LOCATIONS': {
        const docs = await db.collection('server_locations').find({}).sort({ id: 1 }).toArray();
        return docs;
    }

    case 'SERVERMANAGER_DELETE_LOCATION': {
        const data = params[0] || {};
        const { locationId } = data;
        await db.collection('server_locations').deleteOne({ id: locationId });
        return { done: true };
    }

    case 'SERVERMANAGER_UPDATE_LOCATION': {
        const data = params[0] || {};
        const { locationId, newName, newIp, newNotes } = data;
        await db.collection('server_locations').updateOne(
        { id: locationId },
        {
            $set: {
            server_name: newName,
            ip_address: newIp,
            notes: newNotes,
            updated_at: new Date().toISOString()
            }
        }
        );
        return { done: true };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MEDIA MANAGER
    // ─────────────────────────────────────────────────────────────────────────

    case 'INIT_MEDIA_SCHEMA': {
        await db.createCollection('media_files').catch(() => {});
        return { done: true };
    }
    
    case 'MEDIA_ADD_FILE': {
        const data = params[0] || {};
        const { fileName, fileType, category, userId, location, folder, notes } = data;
        const newId = new ObjectId();
        await db.collection('media_files').insertOne({
        file_name : fileName,
        file_type : fileType,
        category  : category || '',
        user_id   : userId || null,
        location  : location || '',
        folder    : folder || '',
        notes     : notes || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()

        });
        return { insertedId: newId.toHexString() };
    }
    
    case 'MEDIA_LIST_FILES': {
        const data = params[0] || {};
        const { filterCategory, filterFileType } = data;
        let query = {};
        if (filterCategory) query.category  = filterCategory;
        if (filterFileType) query.file_type = filterFileType;
        const allFiles = await db.collection('media_files')
        .find(query)
        .sort({ id: -1 })
        .toArray();
        return allFiles;
    }
    
    case 'MEDIA_DELETE_FILE': {
        const data = params[0] || {};
        const { fileId } = data;
        // IDs are stored as plain strings matching the hex ObjectId
        await db.collection('media_files').deleteOne({ id: fileId });
        return { done: true };
    }
    
    case 'MEDIA_UPDATE_FILE': {
        const data = params[0] || {};
        const { fileId, newCategory, newNotes, newFolder } = data;
        await db.collection('media_files').updateOne(
        { id: fileId },
        {
            $set: {
            category  : newCategory,
            notes     : newNotes,
            folder    : newFolder,
            updated_at: new Date().toISOString()
            }
        }
        );
        return { done: true };
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // SHARE MANAGER
    // ─────────────────────────────────────────────────────────────────────────

    case 'INIT_SHARED_LINKS_TABLE': {
    await db.createCollection('shared_links').catch(() => {});
    // Possibly create an index on short_token
    await db.collection('shared_links').createIndex({ short_token: 1 }, { unique: true }).catch(() => {});
    return { done: true };
    }
    
    case 'CREATE_SHARE_LINK': {
    // meltdown bridging => params[0] = { shortToken, filePath, userId, isPublic }
    const dataObj = params[0] || {};
    const { shortToken, filePath, userId, isPublic } = dataObj;
    
    const newId = new ObjectId();
    const doc = {
        _id        : newId,
        id         : newId.toHexString(),
        short_token: shortToken,
        file_path  : filePath,
        created_by : userId,
        is_public  : (isPublic !== false),
        created_at : new Date().toISOString()
    };

    await db.collection('shared_links').insertOne(doc);
    return doc;
    }
    
    case 'REVOKE_SHARE_LINK': {
    const dataObj = params[0] || {};
    const { shortToken, userId } = dataObj;
    // Either delete or set is_public=false
    await db.collection('shared_links').updateOne(
        { short_token: shortToken, created_by: userId },
        { $set: { is_public: false } }
    );
    return { done: true };
    }
    
    case 'GET_SHARE_LINK': {
    const dataObj = params[0] || {};
    const { shortToken } = dataObj;
    const doc = await db.collection('shared_links').findOne({ short_token: shortToken });
    return doc ? [doc] : [];
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // TRANSLATION MANAGER
    // ─────────────────────────────────────────────────────────────────────────
    case 'INIT_TRANSLATION_TABLES': {
    await db.createCollection('translation_usage').catch(() => {});
    await db.createCollection('translation_cache').catch(() => {});
    
    // Indexes for translation_usage
    await db.collection('translation_usage').createIndex({ user_id: 1 }).catch(() => {});
    await db.collection('translation_usage').createIndex({ created_at: -1 }).catch(() => {});
    
    // Indexes for translation_cache
    await db.collection('translation_cache').createIndex({ user_id: 1 }).catch(() => {});
    await db.collection('translation_cache').createIndex({ from_lang: 1, to_lang: 1 }).catch(() => {});
    await db.collection('translation_cache').createIndex({ source_text: 1 }).catch(() => {});
    
    console.log('[TRANSLATION] Created translation_usage & translation_cache collections and indexes in Mongo.');
    return { done: true };
    }

        // ─────────────────────────────────────────────────────────────────────────
    // WIDGET MANAGER
    // ─────────────────────────────────────────────────────────────────────────

    // Removed legacy placeholder 'INIT_WIDGETS_TABLE' which created an unused
    // collection. Widget tables are now handled via INIT_WIDGETS_TABLE_PUBLIC
    // and INIT_WIDGETS_TABLE_ADMIN for parity with Postgres.

    // New widget manager placeholders aligned with Postgres version
    case 'INIT_WIDGETS_TABLE_PUBLIC': {
    const collectionName = 'widgets_public';
    await db.createCollection(collectionName).catch(() => {});
    await createIndexWithRetry(db.collection(collectionName), { widget_id: 1 }, { unique: true }).catch(() => {});
    return { done: true };
    }

    case 'INIT_WIDGETS_TABLE_ADMIN': {
    const collectionName = 'widgets_admin';
    await db.createCollection(collectionName).catch(() => {});
    await createIndexWithRetry(db.collection(collectionName), { widget_id: 1 }, { unique: true }).catch(() => {});
    return { done: true };
    }

    case 'CREATE_WIDGET': {
    // params[0] = { widgetId, widgetType, label, content, category }
    const data = params[0] || {};
    const {
        widgetId,
        widgetType,
        label,
        content,
        category
    } = data;

    await db.collection('widgetmanager_widgets').insertOne({
        widget_id: widgetId,
        widget_type: widgetType,
        label: label || '',
        content: content || '',
        category: category || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    });
    return { done: true };
    }

    case 'GET_WIDGETS': {
    // Optional: params[0] = { widgetType }
    const data = params[0] || {};
    const { widgetType } = data;

    const query = {};
    if (widgetType) {
        query.widget_type = widgetType;
    }

    const docs = await db.collection('widgetmanager_widgets')
        .find(query)
        .sort({ _id: 1 })
        .toArray();
    return docs;
    }

    case 'UPDATE_WIDGET': {
    // params[0] = { widgetId, widgetType, newLabel, newContent, newCategory }
    const data = params[0] || {};
    const {
        widgetId,
        widgetType,
        newLabel,
        newContent,
        newCategory
    } = data;

    await db.collection('widgetmanager_widgets').updateOne(
        { widget_id: widgetId, widget_type: widgetType },
        {
        $set: {
            label: newLabel ?? undefined,
            content: newContent ?? undefined,
            category: newCategory ?? undefined,
            updated_at: new Date().toISOString()
        }
        }
    );
    return { done: true };
    }

    case 'DELETE_WIDGET': {
    // params[0] = { widgetId, widgetType }
    const data = params[0] || {};
    const { widgetId, widgetType } = data;

    await db.collection('widgetmanager_widgets').deleteOne({
        widget_id: widgetId,
        widget_type: widgetType
    });
    return { done: true };
    }

    // New widget placeholders matching Postgres implementation
    case 'UPDATE_WIDGET_PUBLIC': {
    const data = params[0] || {};
    const { widgetId, newLabel, newContent, newCategory, newOrder } = data;
    await db.collection('widgets_public').updateOne(
        { widget_id: widgetId },
        {
          $set: {
            label: newLabel ?? undefined,
            content: newContent ?? undefined,
            category: newCategory ?? undefined,
            order: newOrder ?? undefined,
            updated_at: new Date().toISOString()
          }
        }
    );
    return { done: true };
    }

    case 'UPDATE_WIDGET_ADMIN': {
    const data = params[0] || {};
    const { widgetId, newLabel, newContent, newCategory, newOrder } = data;
    await db.collection('widgets_admin').updateOne(
        { widget_id: widgetId },
        {
          $set: {
            label: newLabel ?? undefined,
            content: newContent ?? undefined,
            category: newCategory ?? undefined,
            order: newOrder ?? undefined,
            updated_at: new Date().toISOString()
          }
        }
    );
    return { done: true };
    }

    case 'DELETE_WIDGET_PUBLIC': {
    const { widgetId } = params[0] || {};
    await db.collection('widgets_public').deleteOne({ widget_id: widgetId });
    return { done: true };
    }

    case 'DELETE_WIDGET_ADMIN': {
    const { widgetId } = params[0] || {};
    await db.collection('widgets_admin').deleteOne({ widget_id: widgetId });
    return { done: true };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PlainSpace
    // ─────────────────────────────────────────────────────────────────────────
    case 'INIT_PLAINSPACE_LAYOUTS': {
    const collectionName = 'plainspace_layouts';
    await db.createCollection(collectionName).catch(() => {});
    await db.collection(collectionName).createIndex(
        { page_id: 1, lane: 1, viewport: 1 },
        { unique: true }
    ).catch(() => {});
    return { done: true };
    }

    case 'INIT_PLAINSPACE_LAYOUT_TEMPLATES': {
    const collectionName = 'plainspace_layout_templates';
    await db.createCollection(collectionName).catch(() => {});
    await db.collection(collectionName).createIndex({ name: 1 }, { unique: true }).catch(() => {});
    await db.collection(collectionName).updateMany(
      { preview_path: { $exists: false } },
      { $set: { preview_path: null } }
    );
    await db.collection(collectionName).updateMany(
      { is_global: { $exists: false } },
      { $set: { is_global: false } }
    );
    return { done: true };
    }

    case 'UPSERT_PLAINSPACE_LAYOUT': {
    const d = params[0] || {};
    await db.collection('plainspace_layouts').updateOne(
        { page_id: d.pageId, lane: d.lane, viewport: d.viewport },
        {
          $set: {
            layout_json: d.layoutArr || [],
            updated_at: new Date().toISOString()
          }
        },
        { upsert: true }
    );
    return { success: true };
    }

    case 'UPSERT_PLAINSPACE_LAYOUT_TEMPLATE': {
    const d = params[0] || {};
    await db.collection('plainspace_layout_templates').updateOne(
        { name: d.name },
        {
          $set: {
            lane: d.lane,
            viewport: d.viewport,
            layout_json: d.layoutArr || [],
            preview_path: d.previewPath || null,
            is_global: !!d.isGlobal,
            updated_at: new Date().toISOString()
          }
        },
        { upsert: true }
    );
    return { success: true };
    }

    case 'INIT_PLAINSPACE_PUBLISHED_DESIGNS': {
      await db.createCollection('plainspace_published_designs').catch(() => {});
      return { done: true };
    }

    case 'GET_PLAINSPACE_LAYOUT_TEMPLATE': {
    const d = params[0] || {};
    const doc = await db.collection('plainspace_layout_templates').findOne({ name: d.name });
    return doc ? [doc] : [];
    }

    case 'GET_PLAINSPACE_LAYOUT_TEMPLATE_NAMES': {
    const d = params[0] || {};
    const docs = await db.collection('plainspace_layout_templates')
        .find({ lane: d.lane })
        .project({ name: 1, preview_path: 1, is_global: 1, updated_at: 1, _id: 0 })
        .sort({ updated_at: -1 })
        .toArray();
    return docs;
    }

    case 'UPSERT_PLAINSPACE_PUBLISHED_DESIGN': {
      const d = params[0] || {};
      await db.collection('plainspace_published_designs').updateOne(
        { name: d.name },
        {
          $set: {
            path: d.path,
            files: d.files || [],
            updated_at: new Date().toISOString()
          }
        },
        { upsert: true }
      );
      return { success: true };
    }

    case 'GET_PLAINSPACE_PUBLISHED_DESIGN': {
      const d = params[0] || {};
      const doc = await db.collection('plainspace_published_designs').findOne({ name: d.name });
      return doc ? [doc] : [];
    }

    case 'GET_GLOBAL_LAYOUT_TEMPLATE': {
    const doc = await db.collection('plainspace_layout_templates').findOne({ is_global: true });
    return doc ? [doc] : [];
    }

    case 'SET_GLOBAL_LAYOUT_TEMPLATE': {
    const d = params[0] || {};
    await db.collection('plainspace_layout_templates').updateMany({}, { $set: { is_global: false } });
    await db.collection('plainspace_layout_templates').updateOne({ name: d.name }, { $set: { is_global: true } });
    return { success: true };
    }

    case 'DELETE_LAYOUT_TEMPLATE': {
    const d = params[0] || {};
    await db.collection('plainspace_layout_templates').deleteOne({ name: d.name });
    return { success: true };
    }

    case 'GET_PLAINSPACE_LAYOUT': {
    const d = params[0] || {};
    const doc = await db.collection('plainspace_layouts').findOne({
        page_id: d.pageId,
        lane: d.lane,
        viewport: d.viewport
    });
    return doc ? [doc] : [];
    }

    case 'GET_ALL_PLAINSPACE_LAYOUTS': {
    const d = params[0] || {};
    const docs = await db.collection('plainspace_layouts')
        .find({ page_id: d.pageId, lane: d.lane })
        .sort({ viewport: 1 })
        .toArray();
    return docs;
    }

    case 'INIT_PLAINSPACE_WIDGET_INSTANCES': {
    const collectionName = 'plainspace_widget_instances';
    await db.createCollection(collectionName).catch(() => {});
    await db.collection(collectionName).createIndex({ instance_id: 1 }, { unique: true }).catch(() => {});
    return { done: true };
    }

    case 'UPSERT_WIDGET_INSTANCE': {
    const d = params[0] || {};
    await db.collection('plainspace_widget_instances').updateOne(
        { instance_id: d.instanceId },
        { $set: { content: d.content, updated_at: new Date().toISOString() } },
        { upsert: true }
    );
    return { success: true };
    }

    case 'GET_WIDGET_INSTANCE': {
    const d = params[0] || {};
    const doc = await db.collection('plainspace_widget_instances').findOne({ instance_id: d.instanceId });
    return doc ? [doc] : [];
    }

  }

  notificationEmitter.notify({
     moduleName: 'databaseManager',
     notificationType: 'debug',
     priority: 'debug',
     message: `[PLACEHOLDER][Mongo] Unrecognized built-in placeholder: "${operation}". Doing nothing...`
   });


  return { done: false };
}

module.exports = { handleBuiltInPlaceholderMongo };
