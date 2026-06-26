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
const {
  formatWidgetDesignContractIssues,
  validateCommunityWidgetDesignContract,
  validateWidgetDesignContract
} = require('./widgetDesignContract');

const VALID_WIDGET_ID = /^[A-Za-z0-9_-]{1,80}$/;
const VALID_COMMUNITY_WIDGET_FOLDER = /^[A-Za-z0-9_-]{1,80}$/;
const MODULE_NAME = 'widgetManager';
const MODULE_TYPE = 'core';
const VERSION = '0.7.0';
const VALID_WIDGET_TYPES = new Set(['public', 'admin']);
const FORBIDDEN_WIDGET_FOLDER_FILENAMES = new Set([
  '.npmrc',
  '.yarnrc',
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb'
]);
const FORBIDDEN_WIDGET_FOLDER_DIRNAMES = new Set([
  'node_modules'
]);
const FORBIDDEN_WIDGET_INFO_FIELDS = new Map([
  ['appName', 'app identity'],
  ['appType', 'app identity'],
  ['moduleName', 'module identity'],
  ['moduleType', 'module identity']
]);
const COMMUNITY_WIDGET_SCRIPT_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs'
]);
const FORBIDDEN_WIDGET_SCRIPT_PATTERNS = Object.freeze([
  { label: 'CommonJS require', pattern: /\brequire\s*\(/ },
  { label: 'Node process access', pattern: /\bprocess\s*\./ },
  { label: 'filesystem access', pattern: /\bfs\s*\./ },
  { label: 'admin token access', pattern: /\bADMIN_TOKEN\b/ },
  { label: 'admin token metadata access', pattern: /admin-token|csrf-token|x-csrf-token/i },
  { label: 'Meltdown API access', pattern: /\bmeltdownEmit\b|\/api\/meltdown\b/ },
  { label: 'internal same-origin API access', pattern: /\bfetch\s*\(\s*['"`](?:\/(?:admin(?:\/|\?|#|['"`]|$)|api\/(?!public(?:\/|\?|#|['"`]|$))|login(?:\/|\?|#|['"`]|$)|register(?:\/|\?|#|['"`]|$)|install(?:\/|\?|#|['"`]|$))|(?:admin|api\/(?!public(?:\/|\?|#|['"`]|$)))(?:\/|\?|#|['"`]|$))/i },
  { label: 'authenticated fetch access', pattern: /\bcredentials\s*:\s*['"]include['"]/ },
  { label: 'remote fetch access', pattern: /\bfetch\s*\(\s*['"]https?:\/\//i },
  { label: 'remote import access', pattern: /\bimport\s*\(\s*['"]https?:\/\//i },
  { label: 'WebSocket access', pattern: /\bWebSocket\s*\(/ },
  { label: 'EventSource access', pattern: /\bEventSource\s*\(/ },
  { label: 'sendBeacon access', pattern: /\bsendBeacon\s*\(/ },
  { label: 'cookie access', pattern: /\bdocument\s*\.\s*cookie\b/ },
  { label: 'browser storage access', pattern: /\b(?:localStorage|sessionStorage|indexedDB)\b/ },
  { label: 'eval access', pattern: /\beval\s*\(/ },
  { label: 'Function constructor access', pattern: /\bFunction\s*\(/ },
  { label: 'XMLHttpRequest access', pattern: /\bXMLHttpRequest\b/ }
]);

module.exports = {
  _internals: {
    assertWidgetManagerPayload,
    assertCommunityWidgetFolderShape,
    assertCommunityWidgetScriptsAllowed,
    formatWidgetDesignContractIssues,
    isWidgetScriptAllowed,
    normalizeCommunityWidgetFolderName,
    normalizeCommunityWidgetInfo,
    pickTable,
    resolveCommunityWidgetFolder,
    setupWidgetManagerEvents,
    validateCommunityWidgetDesignContract,
    validateWidgetDesignContract
  },
  async initialize({ motherEmitter, isCore, jwt, nonce }) {
    // 1) Must be loaded as a core module
    if (!isCore) {
      throw new Error('[WIDGET MANAGER] Must be loaded as a core module.');
    }

    // 2) Must have a valid JWT
    if (!jwt) {
      throw new Error('[WIDGET MANAGER] initialization requires a valid JWT token.');
    }
    if (!motherEmitter) {
      throw new Error('[WIDGET MANAGER] motherEmitter missing.');
    }

    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE_NAME, MODULE_TYPE);
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
  },
  MODULE_NAME,
  MODULE_TYPE,
  VERSION
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
  try {
    assertWidgetManagerPayload(payload, 'createWidget');
  } catch (err) {
    return callback(err);
  }

  const { jwt, widgetId, widgetType, label, content, category } = payload || {};

  if (!jwt || !widgetId || !widgetType || !content) {
    return callback(new Error('[WM] createWidget => invalid payload.'));
  }

  if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'widgets.create')) {
    return callback(new Error('Forbidden - missing permission: widgets.create'));
  }

  const designContract = validateWidgetDesignContract(payload);
  if (!designContract.ok) {
    return callback(new Error(`[WM:WIDGET_DESIGN_CONTRACT] ${formatWidgetDesignContractIssues(designContract)}`));
  }
  logWidgetDesignWarnings(widgetId, designContract);

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
      assertWidgetManagerPayload(payload, 'getWidgets');
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
        return callback(new Error('Forbidden - missing permission: widgets.read'));
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

          // Remap the DB rows from snake_case to JS object
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
      assertWidgetManagerPayload(payload, 'updateWidget');
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
        return callback(new Error('Forbidden - missing permission: widgets.update'));
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
      assertWidgetManagerPayload(payload, 'deleteWidget');
      const { jwt, widgetId, widgetType } = payload || {};

      if (!jwt || !widgetId || !widgetType) {
        return callback(new Error('[WM] deleteWidget => invalid payload (missing JWT/ID/type).'));
      }

      if (payload.decodedJWT && !hasPermission(payload.decodedJWT, 'widgets.delete')) {
        return callback(new Error('Forbidden - missing permission: widgets.delete'));
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
      assertWidgetManagerPayload(payload, 'saveLayout.v1');
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
        return callback(new Error('Forbidden - missing permission: widgets.saveLayout'));
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
            moduleName: MODULE_NAME,
            moduleType: MODULE_TYPE,
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

function assertWidgetManagerPayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE_NAME || moduleType !== MODULE_TYPE) {
    throw new Error(`[WM] ${eventName} => invalid meltdown payload.`);
  }
}

function logWidgetDesignWarnings(widgetId, report = {}) {
  for (const warning of report.warnings || []) {
    console.warn(`[WIDGET MANAGER:WIDGET_DESIGN_CONTRACT_WARNING] ${widgetId || 'unknown'} => ${warning.code}: ${warning.message}`);
  }
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

function normalizeCommunityWidgetInfo(info = {}, expectedWidgetId = '') {
  const widgetId = String(info.widgetId || '').trim();
  const widgetType = String(info.widgetType || '').trim();
  const expectedId = String(expectedWidgetId || '').trim();
  for (const [field, label] of FORBIDDEN_WIDGET_INFO_FIELDS.entries()) {
    if (
      Object.prototype.hasOwnProperty.call(info, field) &&
      info[field] !== undefined &&
      info[field] !== null &&
      info[field] !== ''
    ) {
      throw new Error(`Community widget metadata cannot declare ${field}; widgets cannot claim ${label}.`);
    }
  }
  if (!VALID_WIDGET_ID.test(widgetId)) {
    throw new Error('widgetId must contain only letters, numbers, underscores or dashes.');
  }
  if (expectedId && widgetId !== expectedId) {
    throw new Error(`widgetId "${widgetId}" must match widget folder "${expectedId}".`);
  }
  if (!VALID_WIDGET_TYPES.has(widgetType)) {
    throw new Error('widgetType must be "public" or "admin".');
  }
  if (widgetType !== 'public') {
    throw new Error('Community widgets must use widgetType "public"; admin widgets belong to trusted UI modules.');
  }
  return {
    widgetId,
    widgetType,
    label: String(info.label || '').trim().slice(0, 120),
    category: String(info.category || '').trim().slice(0, 80)
  };
}

function normalizeCommunityWidgetFolderName(folderName = '') {
  const normalized = String(folderName || '').trim();
  if (!VALID_COMMUNITY_WIDGET_FOLDER.test(normalized)) {
    throw new Error('Community widget folder names may contain only letters, numbers, underscores or dashes.');
  }
  return normalized;
}

function assertInsideWidgetRoot(widgetRoot, candidatePath, label = 'path') {
  const root = path.resolve(widgetRoot);
  const candidate = path.resolve(candidatePath);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  const compareRoot = process.platform === 'win32' ? root.toLowerCase() : root;
  const compareCandidate = process.platform === 'win32' ? candidate.toLowerCase() : candidate;
  const compareRootPrefix = process.platform === 'win32' ? rootPrefix.toLowerCase() : rootPrefix;
  if (compareCandidate !== compareRoot && !compareCandidate.startsWith(compareRootPrefix)) {
    throw new Error(`[WIDGET MANAGER] ${label} must stay inside the widgets folder.`);
  }
  return candidate;
}

function resolveCommunityWidgetFolder(baseDir, folderName) {
  const safeFolderName = normalizeCommunityWidgetFolderName(folderName);
  const widgetDir = assertInsideWidgetRoot(baseDir, path.join(baseDir, safeFolderName), 'Widget folder');
  if (!fs.existsSync(widgetDir) || !fs.statSync(widgetDir).isDirectory()) {
    throw new Error('Community widget folder must exist and be a directory.');
  }

  const realRoot = fs.realpathSync(baseDir);
  const realWidgetDir = fs.realpathSync(widgetDir);
  assertInsideWidgetRoot(realRoot, realWidgetDir, 'Widget folder');
  return widgetDir;
}

function isForbiddenWidgetFolderFilename(filename = '') {
  const normalized = String(filename || '').trim().toLowerCase();
  return FORBIDDEN_WIDGET_FOLDER_FILENAMES.has(normalized) || /^\.env(?:\.|$)/i.test(normalized);
}

function assertCommunityWidgetFolderShape(widgetDir, folderName) {
  const rootWidgetManifestPath = path.resolve(widgetDir, 'widgetInfo.json');
  const stack = [widgetDir];
  while (stack.length) {
    const currentDir = stack.pop();
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      const entryStats = fs.lstatSync(entryPath);
      const filename = entry.name.toLowerCase();
      if (filename === 'app.json') {
        throw new Error(`Widget "${folderName}" cannot contain app.json. Apps must live under apps/.`);
      }
      if (filename === 'moduleinfo.json') {
        throw new Error(`Widget "${folderName}" cannot contain moduleInfo.json. Modules must live under modules/.`);
      }
      if (filename === 'widgetinfo.json' && path.resolve(entryPath) !== rootWidgetManifestPath) {
        throw new Error(`Widget "${folderName}" cannot contain nested widgetInfo.json. Widgets must be installed as one widget folder.`);
      }
      if (isForbiddenWidgetFolderFilename(filename)) {
        throw new Error(`Widget "${folderName}" cannot contain sensitive runtime file "${entry.name}".`);
      }
      if (entryStats.isSymbolicLink()) {
        throw new Error(`Widget "${folderName}" cannot contain symlinks or junctions.`);
      }
      if (entryStats.isDirectory()) {
        if (FORBIDDEN_WIDGET_FOLDER_DIRNAMES.has(filename)) {
          throw new Error(`Widget "${folderName}" cannot contain runtime dependency folder "${entry.name}".`);
        }
        stack.push(entryPath);
      }
    }
  }
}

function isWidgetScriptAllowed(code = '') {
  const source = String(code || '');
  const blocked = FORBIDDEN_WIDGET_SCRIPT_PATTERNS.find(rule => rule.pattern.test(source));
  return blocked
    ? { ok: false, reason: blocked.label }
    : { ok: true };
}

function isCommunityWidgetScriptFile(filename = '') {
  return COMMUNITY_WIDGET_SCRIPT_EXTENSIONS.has(path.extname(String(filename || '')).toLowerCase());
}

function assertCommunityWidgetScriptsAllowed(widgetDir, folderName) {
  const stack = [widgetDir];
  while (stack.length) {
    const currentDir = stack.pop();
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const entryPath = path.join(currentDir, entry.name);
      const entryStats = fs.lstatSync(entryPath);
      if (entryStats.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (!entryStats.isFile() || !isCommunityWidgetScriptFile(entry.name)) {
        continue;
      }

      const code = fs.readFileSync(entryPath, 'utf8');
      const security = isWidgetScriptAllowed(code);
      if (!security.ok) {
        const relativePath = path.relative(widgetDir, entryPath).replace(/\\/g, '/');
        throw new Error(`Widget "${folderName}" script "${relativePath}" failed security check: ${security.reason}.`);
      }
    }
  }
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
    let folderName;
    let widgetDir;
    try {
      folderName = normalizeCommunityWidgetFolderName(dir);
      widgetDir = resolveCommunityWidgetFolder(baseDir, folderName);
      assertCommunityWidgetFolderShape(widgetDir, folderName);
    } catch (err) {
      console.warn(`[WIDGET MANAGER] Skipping ${dir} => ${err.message}`);
      continue;
    }

    const infoPath = path.join(widgetDir, 'widgetInfo.json');
    const jsPath = path.join(widgetDir, 'widget.js');
    if (!fs.existsSync(infoPath) || !fs.existsSync(jsPath)) {
      console.warn(`[WIDGET MANAGER] Skipping ${folderName} => missing widgetInfo.json or widget.js`);
      continue;
    }

    let info;
    try {
      info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    } catch (err) {
      console.warn(`[WIDGET MANAGER] Invalid JSON in ${folderName}/widgetInfo.json => ${err.message}`);
      continue;
    }

    let widget;
    try {
      widget = normalizeCommunityWidgetInfo(info, folderName);
    } catch (err) {
      console.warn(`[WIDGET MANAGER] Invalid widgetInfo.json in ${folderName} => ${err.message}`);
      continue;
    }

    try {
      assertCommunityWidgetScriptsAllowed(widgetDir, folderName);
    } catch (err) {
      console.warn(`[WIDGET MANAGER] ${err.message}`);
      continue;
    }

    const designReport = validateCommunityWidgetDesignContract(widgetDir, folderName);
    logWidgetDesignWarnings(widget.widgetId, designReport);

    await new Promise(resolve => {
      motherEmitter.emit(
        'createWidget',
        {
          jwt,
          moduleName: 'widgetManager',
          moduleType: 'core',
          widgetId: widget.widgetId,
          widgetType: widget.widgetType,
          label: widget.label,
          category: widget.category,
          content: `/widgets/${folderName}/widget.js`
        },
        onceCallback(err => {
          if (err) {
            console.error(`[WIDGET MANAGER] createWidget failed for ${widget.widgetId} =>`, err.message);
          } else {
            console.log(`[WIDGET MANAGER] Registered community widget ${widget.widgetId}.`);
          }
          resolve();
        })
      );
    });
  }

  console.log('[WIDGET MANAGER] Community widget scan complete.');
}
