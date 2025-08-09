/**
 * mother/modules/widgetManager/index.js
 *
 * Manages widget creation, retrieval, updates, and deletions 
 * in two separate tables:
 *   - widgets_public
 *   - widgets_admin
 *
 * Because meltdown demands all sorts of events, we provide:
 *   - createWidget
 *   - getWidgets
 *   - updateWidget
 *   - deleteWidget
 *   - saveLayout.v1 (for drag/drop ordering)
 *
 * We'll pick the correct table based on widgetType="public" | "admin".
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');

module.exports = {
  async initialize({ motherEmitter, isCore, jwt, nonce }) {
    // 1) Must be loaded as a core module
    if (!isCore) {
      console.error('[WIDGET MANAGER] Must be loaded as a core module; cannot proceed as community.');
      return;
    }

    // 2) Must have a valid JWT
    if (!jwt) {
      console.error('[WIDGET MANAGER] No JWT provided, cannot proceed.');
      return;
    }

    console.log('[WIDGET MANAGER] Initializing...');

    try {
      // Create or ensure both widget tables
      await ensureWidgetDatabases(motherEmitter, jwt, nonce);

      // Register meltdown event listeners
      setupWidgetManagerEvents(motherEmitter);

      // Load community widgets from the public assets folder
      await loadCommunityWidgets(motherEmitter, jwt);

      console.log('[WIDGET MANAGER] Initialized successfully.');
    } catch (err) {
      console.error('[WIDGET MANAGER] Error =>', err.message);
    }
  }
};

/**
 * ensureWidgetDatabases:
 *   Ensures the DB tables "widgets_public" and "widgets_admin" exist,
 *   by calling meltdown => dbUpdate => placeholders "INIT_WIDGETS_TABLE_PUBLIC" 
 *   and "INIT_WIDGETS_TABLE_ADMIN".
 */
async function ensureWidgetDatabases(motherEmitter, jwt, nonce) {
  console.log('[WIDGET SERVICE] Ensuring widget DB schemas...');

  // (A) widgets_public
  await new Promise((resolve, reject) => {
    motherEmitter.emit(
      'dbUpdate',
      {
        jwt,
        moduleName: 'widgetManager',
        moduleType: 'core',
        nonce,
        table: '__rawSQL__',
        data: { rawSQL: 'INIT_WIDGETS_TABLE_PUBLIC' }
      },
      err => {
        if (err) {
          console.error('[WIDGET SERVICE] Table creation (widgets_public) failed:', err.message);
          return reject(err);
        }
        console.log('[WIDGET SERVICE] Table "widgets_public" ensured/created.');
        resolve();
      }
    );
  });

  // (B) widgets_admin
  await new Promise((resolve, reject) => {
    motherEmitter.emit(
      'dbUpdate',
      {
        jwt,
        moduleName: 'widgetManager',
        moduleType: 'core',
        nonce,
        table: '__rawSQL__',
        data: { rawSQL: 'INIT_WIDGETS_TABLE_ADMIN' }
      },
      err => {
        if (err) {
          console.error('[WIDGET SERVICE] Table creation (widgets_admin) failed:', err.message);
          return reject(err);
        }
        console.log('[WIDGET SERVICE] Table "widgets_admin" ensured/created.');
        resolve();
      }
    );
  });
}

/**
 * setupWidgetManagerEvents:
 *   meltdown event listeners for 
 *   - createWidget
 *   - getWidgets
 *   - updateWidget
 *   - deleteWidget
 *   - saveLayout.v1 (drag/drop reordering)
 */
function setupWidgetManagerEvents(motherEmitter) {
  console.log('[WIDGET MANAGER] Setting up meltdown events...');

// CREATE WIDGET 
motherEmitter.on('createWidget', async (payload, callback) => {
  const { jwt, widgetId, widgetType, label, content, category } = payload || {};

  if (!jwt || !widgetId || !widgetType || !content) {
    return callback(new Error('[WM] createWidget => invalid payload.'));
  }

  if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'widgets.create')) {
    return callback(new Error('Forbidden – missing permission: widgets.create'));
  }

  const targetTable = pickTable(widgetType);

  try {
    // Check existence first
    const widgetExists = await new Promise((resolve, reject) => {
      motherEmitter.emit('dbSelect', {
        jwt,
        moduleName: 'widgetManager',
        moduleType: 'core',
        table: targetTable,
        where: { widget_id: widgetId }
      }, (err, rows) => {
        if (err) return reject(err);
        resolve(rows && rows.length > 0);
      });
    });

    if (widgetExists) {
      console.log(`[WM] Widget "${widgetId}" already exists.`);
      return callback(null, { created: false, reason: 'Widget already exists' });
    }

    // create the widget
    motherEmitter.emit('dbInsert', {
      jwt,
      moduleName: 'widgetManager',
      moduleType: 'core',
      table: targetTable,
      data: {
        widget_id:  widgetId,
        label:      label || '',
        content:    content || '',
        category:   category || '',
        created_at: new Date().toISOString()
      }
    }, (insertErr, result) => {
      if (insertErr) return callback(insertErr);
      callback(null, { created: true, result });
    });

  } catch (ex) {
    callback(ex);
  }
});


  // GET WIDGETS
  motherEmitter.on('getWidgets', (payload, callback) => {
    try {
      const { jwt, widgetType } = payload || {};
      if (!jwt) {
        return callback(new Error('[WM] getWidgets => No JWT provided.'));
      }
      if (!widgetType) {
        return callback(new Error('[WM] getWidgets => "widgetType" is required.'));
      }

      // Public lane widgets should always be readable. Only enforce the
      // widgets.read permission when an admin lane lookup is requested.
      if (
        widgetType === 'admin' &&
        payload.decodedJWT &&
        !hasPermission(payload.decodedJWT, 'widgets.read')
      ) {
        return callback(new Error('Forbidden – missing permission: widgets.read'));
      }

      const targetTable = pickTable(widgetType);

      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName: 'widgetManager',
          moduleType: 'core',
          table: targetTable,
          data: {} // SELECT * from that table
        },
        (err, rows = []) => {
          if (err) return callback(err);

          // Remap the DB rows from snake_case → JS object
          // so downstream modules can read "widgetId," "createdAt," etc.
          const mapped = rows.map(r => ({
            widgetId:   r.widget_id,
            label:      r.label,
            content:    r.content,
            category:   r.category,
            createdAt:  r.created_at,
            // If you have an "order" column or something else, 
            // you could map that here too.
          }));

          callback(null, mapped);
        }
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // UPDATE WIDGET
  motherEmitter.on('updateWidget', (payload, callback) => {
    try {
      const {
        jwt,
        widgetId,
        widgetType,
        newLabel,
        newContent,
        newCategory,
        newOrder
      } = payload || {};

      if (!jwt || !widgetId || !widgetType) {
        return callback(new Error('[WM] updateWidget => missing widgetId or widgetType.'));
      }

      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'widgets.update')) {
        return callback(new Error('Forbidden – missing permission: widgets.update'));
      }

      // Decide which placeholder to call for your DB
      const rawSQL = (widgetType === 'admin')
        ? 'UPDATE_WIDGET_ADMIN'
        : 'UPDATE_WIDGET_PUBLIC';

      motherEmitter.emit(
        'dbUpdate',
        {
          jwt,
          moduleName: 'widgetManager',
          moduleType: 'core',
          table: '__rawSQL__', // meltdown placeholder
          data: {
            rawSQL,
            widgetId,
            newLabel,
            newContent,
            newCategory,
            newOrder
          }
        },
        callback
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // DELETE WIDGET
  motherEmitter.on('deleteWidget', (payload, callback) => {
    try {
      const { jwt, widgetId, widgetType } = payload || {};

      if (!jwt || !widgetId || !widgetType) {
        return callback(new Error('[WM] deleteWidget => invalid payload (missing JWT/ID/type).'));
      }

      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'widgets.delete')) {
        return callback(new Error('Forbidden – missing permission: widgets.delete'));
      }

      // Decide which placeholder
      const rawSQL = (widgetType === 'admin')
        ? 'DELETE_WIDGET_ADMIN'
        : 'DELETE_WIDGET_PUBLIC';

      motherEmitter.emit(
        'dbDelete',
        {
          jwt,
          moduleName: 'widgetManager',
          moduleType: 'core',
          table: '__rawSQL__',
          where: {
            rawSQL,
            widgetId
          }
        },
        callback
      );
    } catch (ex) {
      callback(ex);
    }
  });

  // SAVE LAYOUT (v1)
  motherEmitter.on('saveLayout.v1', (payload, callback) => {
    try {
      const { jwt, moduleName, layout, lane } = payload || {};
      if (!jwt || !moduleName) {
        return callback(new Error('[WM] saveLayout.v1 => missing jwt or moduleName.'));
      }
      if (!Array.isArray(layout)) {
        return callback(new Error('[WM] saveLayout.v1 => layout must be an array.'));
      }
      if (!lane) {
        return callback(new Error('[WM] saveLayout.v1 => "lane" is required (admin|public).'));
      }

      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'widgets.saveLayout')) {
        return callback(new Error('Forbidden – missing permission: widgets.saveLayout'));
      }

      // We'll iterate over layout[] and call `updateWidget` 
      // for each item to store the new `order` field
      let updatedCount = 0;

      const nextOne = () => {
        updatedCount++;
        if (updatedCount === layout.length) {
          return callback(null, { success: true, updated: updatedCount });
        }
      };

      if (layout.length === 0) {
        // Nothing to update
        return callback(null, { success: true, updated: 0 });
      }

      layout.forEach(({ widgetId, order }) => {
        if (!widgetId) return nextOne(); // skip

        motherEmitter.emit(
          'updateWidget',
          {
            jwt,
            moduleName,
            widgetId,
            widgetType: lane, // "public" or "admin"
            newLabel:    null,
            newContent:  null,
            newCategory: null,
            newOrder:    order
          },
          err => {
            if (err) console.error('[WM] saveLayout.v1 => updateWidget error:', err.message);
            nextOne();
          }
        );
      });
    } catch (ex) {
      callback(ex);
    }
  });
}

/**
 * pickTable(widgetType):
 *   Return either 'widgets_admin' or 'widgets_public'.
 *   Throws if widgetType is unknown.
 */
function pickTable(widgetType) {
  if (widgetType === 'admin')  return 'widgets_admin';
  if (widgetType === 'public') return 'widgets_public';
  throw new Error(`[widgetManager] Unknown widgetType="${widgetType}". Must be "admin" or "public".`);
}

async function loadCommunityWidgets(motherEmitter, jwt) {
  console.log('[WIDGET MANAGER] Scanning community widgets...');
  const baseDir = path.resolve(__dirname, '../../../widgets');

  if (!fs.existsSync(baseDir)) {
    console.log('[WIDGET MANAGER] No community widgets folder =>', baseDir);
    return;
  }

  const folders = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const dir of folders) {
    const infoPath = path.join(baseDir, dir, 'widgetInfo.json');
    const jsPath = path.join(baseDir, dir, 'widget.js');
    if (!fs.existsSync(infoPath) || !fs.existsSync(jsPath)) {
      console.warn(`[WIDGET MANAGER] Skipping ${dir} => missing widgetInfo.json or widget.js`);
      continue;
    }

    let info;
    try {
      info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    } catch (err) {
      console.warn(`[WIDGET MANAGER] Invalid JSON in ${dir}/widgetInfo.json => ${err.message}`);
      continue;
    }

    const { widgetId, widgetType, label = '', category = '' } = info;
    if (!widgetId || !widgetType) {
      console.warn(`[WIDGET MANAGER] Missing widgetId/widgetType in ${dir}`);
      continue;
    }

    const code = fs.readFileSync(jsPath, 'utf8');
    if (/require\(|process\.|fs\./.test(code)) {
      console.warn(`[WIDGET MANAGER] ${dir}/widget.js failed security check`);
      continue;
    }

    await new Promise(resolve => {
      motherEmitter.emit(
        'createWidget',
        {
          jwt,
          moduleName: 'widgetManager',
          moduleType: 'core',
          widgetId,
          widgetType,
          label,
          category,
          content: `/widgets/${dir}/widget.js`
        },
        onceCallback(err => {
          if (err) {
            console.error(`[WIDGET MANAGER] createWidget failed for ${widgetId} =>`, err.message);
          } else {
            console.log(`[WIDGET MANAGER] Registered community widget ${widgetId}.`);
          }
          resolve();
        })
      );
    });
  }

  console.log('[WIDGET MANAGER] Community widget scan complete.');
}
