// mother/modules/plainSpace/index.js
// This is our proud aggregator of meltdown madness.

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const {
  seedAdminPages,
  seedAdminWidget,
  registerPlainSpaceEvents,
  meltdownEmit,
  assertPlainSpacePayload,
  MODULE,
  MODULE_TYPE,
  PUBLIC_LANE,
  ADMIN_LANE
} = require('./plainSpaceService');

const { ADMIN_PAGES }       = require('./config/adminPages');
const { DEFAULT_WIDGETS }   = require('./config/defaultWidgets');
const { getSetting, setSetting } = require('./settingHelpers');
const { onceCallback }      = require('../../emitters/motherEmitter');

const CMS_ROOT = path.resolve(__dirname, '../../..');
const DEFAULT_WIDGET_BY_ID = new Map(DEFAULT_WIDGETS.map(widget => [widget.widgetId, widget]));
const DEFAULT_WIDGET_DESIGN_CONTRACT = Object.freeze({
  version: 1,
  mode: 'strict',
  tokens: 'required',
  designerRules: 'required'
});

function isPathInside(rootDir, candidatePath) {
  const relative = path.relative(rootDir, candidatePath);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveRegistryWidgetFilePath(content, cmsRoot = CMS_ROOT) {
  const contentPath = typeof content === 'string' ? content.trim() : '';
  if (!contentPath || !contentPath.startsWith('/') || contentPath.startsWith('//')) {
    return null;
  }

  let url;
  try {
    url = new URL(contentPath, 'http://plainspace.local');
  } catch {
    return null;
  }

  const roots = [
    {
      urlPrefix: '/ui/widgets/plainspace/',
      diskRoot: path.resolve(cmsRoot, 'ui', 'widgets', 'plainspace')
    },
    {
      urlPrefix: '/widgets/',
      diskRoot: path.resolve(cmsRoot, 'widgets')
    },
    {
      urlPrefix: '/plainspace/widgets/',
      diskRoot: path.resolve(cmsRoot, 'public', 'plainspace', 'widgets')
    }
  ];

  for (const { urlPrefix, diskRoot } of roots) {
    if (!url.pathname.startsWith(urlPrefix)) {
      continue;
    }
    const relativePath = url.pathname.slice(urlPrefix.length);
    const filePath = path.resolve(diskRoot, relativePath);
    return isPathInside(diskRoot, filePath) ? filePath : null;
  }

  return null;
}

function clonePlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return JSON.parse(JSON.stringify(value));
}

function parseRegistryMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    return clonePlainObject(value);
  }
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? clonePlainObject(parsed)
      : {};
  } catch {
    return {};
  }
}

function buildDefaultWidgetSizeContract(widget = {}) {
  const metadata = parseRegistryMetadata(widget.metadata);
  const contract = metadata.layout || metadata.sizeContract;
  if (contract && typeof contract === 'object' && !Array.isArray(contract)) {
    return clonePlainObject(contract);
  }

  return {
    defaultSlot: 'full',
    supportedSlots: [{ name: 'full', minCols: 12, maxCols: 12 }],
    breakpoints: {
      mobile: ['full'],
      tablet: ['full'],
      desktop: ['full']
    },
    heightMode: 'dynamic',
    height: {
      mode: 'dynamic',
      minHeight: {
        mobile: 120,
        tablet: 140,
        desktop: 160
      }
    }
  };
}

function getDefaultWidgetMetadata(widgetId) {
  const widget = DEFAULT_WIDGET_BY_ID.get(widgetId);
  if (!widget) return {};
  const metadata = clonePlainObject(widget.metadata);
  if (!metadata.layout && !metadata.sizeContract) {
    metadata.layout = buildDefaultWidgetSizeContract(widget);
  }
  if (!metadata.designContract) {
    metadata.designContract = { ...DEFAULT_WIDGET_DESIGN_CONTRACT };
  }
  return metadata;
}

function buildRegistryMetadata(row = {}) {
  const defaults = getDefaultWidgetMetadata(row.widgetId);
  const rowMetadata = parseRegistryMetadata(row.metadata);
  return {
    ...defaults,
    ...rowMetadata,
    label: row.label || rowMetadata.label || defaults.label || row.widgetId,
    category: row.category || rowMetadata.category || defaults.category || ''
  };
}

function formatRegistryWidgets(widgetRows = [], lane, options = {}) {
  const {
    cmsRoot = CMS_ROOT,
    fileExists = fs.existsSync,
    warn = console.warn
  } = options;

  return widgetRows
    .filter(row => {
      const filePath = resolveRegistryWidgetFilePath(row?.content, cmsRoot);
      if (!filePath) {
        warn(`[plainSpace:WIDGET_REGISTRY_PATH_UNSUPPORTED] Skipping widget ${row?.widgetId || 'unknown'} => ${row?.content || 'missing content'}`);
        return false;
      }
      if (!fileExists(filePath)) {
        warn(`[plainSpace:WIDGET_REGISTRY_FILE_MISSING] Skipping widget ${row?.widgetId || 'unknown'} => ${row?.content}`);
        return false;
      }
      return true;
    })
    .map(row => ({
      id: row.widgetId,
      lane,
      codeUrl: row.content,
      checksum: '',
      metadata: buildRegistryMetadata(row)
    }));
}

async function seedFromModules(motherEmitter, jwt) {
  const modulesDir = path.resolve(__dirname, '../../../modules');
  if (!fs.existsSync(modulesDir)) return;

  const dirs = fs.readdirSync(modulesDir, { withFileTypes: true });
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const infoPath = path.join(modulesDir, dir.name, 'moduleInfo.json');
    if (!fs.existsSync(infoPath)) continue;
    try {
      const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
      const seedFile = info.adminSeed || 'adminSeed.json';
      const seedPath = path.join(modulesDir, dir.name, seedFile);
      if (!fs.existsSync(seedPath)) continue;
      const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
      if (Array.isArray(seed.adminPages) && seed.adminPages.length) {
        await seedAdminPages(motherEmitter, jwt, seed.adminPages, true);
      }
      if (Array.isArray(seed.adminWidgets) && seed.adminWidgets.length) {
        for (const widget of seed.adminWidgets) {
          const { options = {}, ...data } = widget;
          await seedAdminWidget(motherEmitter, jwt, data, options);
        }
      }
    } catch (err) {
      console.error(`[plainSpace] Failed module seed for ${dir.name}:`, err.message);
    }
  }
}

module.exports = {
  async initialize({ motherEmitter, isCore, jwt }) {
    if (!isCore) {
      throw new Error('[plainSpace] Must be loaded as a core module.');
    }
    if (!jwt) {
      throw new Error('[plainSpace] initialization requires a valid JWT token.');
    }

    if (!motherEmitter) {
      throw new Error('[plainSpace] motherEmitter missing.');
    }
    if (typeof motherEmitter.registerModuleType === 'function') {
      motherEmitter.registerModuleType(MODULE, MODULE_TYPE);
    }

    console.log('[plainSpace] Initializing...');

    try {
      // 1) Register meltdown events early so seeding can use them
      registerPlainSpaceEvents(motherEmitter);

      // 2) Ensure DB tables required for layouts and widgets
      await meltdownEmit(motherEmitter, 'dbUpdate', {
        jwt,
        moduleName: MODULE,
        moduleType: 'core',
        table: '__rawSQL__',
        data: { rawSQL: 'INIT_PLAINSPACE_LAYOUTS' }
      }).then(() => {
        console.log('[plainSpace] "plainspace.layouts" table creation ensured.');
      }).catch(err => {
        console.error('[plainSpace] Could not create "plainspace.layouts" table:', err.message);
      });

      await meltdownEmit(motherEmitter, 'dbUpdate', {
        jwt,
        moduleName: MODULE,
        moduleType: 'core',
        table: '__rawSQL__',
        data: { rawSQL: 'INIT_PLAINSPACE_LAYOUT_TEMPLATES' }
      }).then(() => {
        console.log('[plainSpace] "plainspace.layout_templates" table creation ensured.');
      }).catch(err => {
        console.error('[plainSpace] Could not create "plainspace.layout_templates" table:', err.message);
      });

      await meltdownEmit(motherEmitter, 'dbUpdate', {
        jwt,
        moduleName: MODULE,
        moduleType: 'core',
        table: '__rawSQL__',
        data: { rawSQL: 'INIT_PLAINSPACE_PUBLISHED_DESIGNS' }
      }).then(() => {
        console.log('[plainSpace] "plainspace.published_designs" table creation ensured.');
      }).catch(err => {
        console.error('[plainSpace] Could not create "plainspace.published_designs" table:', err.message);
      });

      // Ensure a global layout exists
      try {
        const globalRes = await meltdownEmit(motherEmitter, 'getGlobalLayoutTemplate', {
          jwt,
          moduleName: MODULE,
          moduleType: 'core'
        });
        if (!globalRes?.name) {
          const name = 'global-layout';
          await meltdownEmit(motherEmitter, 'saveLayoutTemplate', {
            jwt,
            moduleName: MODULE,
            moduleType: 'core',
            name,
            lane: PUBLIC_LANE,
            viewport: 'desktop',
            layout: [],
            previewPath: '',
            isGlobal: true
          });
          await meltdownEmit(motherEmitter, 'setGlobalLayoutTemplate', {
            jwt,
            moduleName: MODULE,
            moduleType: 'core',
            name
          });
          console.log('[plainSpace] Default global layout created.');
        }
      } catch (err) {
        console.error('[plainSpace] Failed to ensure global layout:', err.message);
      }

      await meltdownEmit(motherEmitter, 'dbUpdate', {
        jwt,
        moduleName: MODULE,
        moduleType: 'core',
        table: '__rawSQL__',
        data: { rawSQL: 'INIT_PLAINSPACE_WIDGET_INSTANCES' }
      }).then(() => {
        console.log('[plainSpace] "plainspace.widget_instances" table creation ensured.');
      }).catch(err => {
        console.error('[plainSpace] Could not create "plainspace.widget_instances" table:', err.message);
      });

      // 3) Check if PLAINSPACE_SEEDED is already 'true'
      const seededVal = await getSetting(motherEmitter, jwt, 'PLAINSPACE_SEEDED');
      if (seededVal === 'true') {
        console.log('[plainSpace] Already seeded (PLAINSPACE_SEEDED=true). Checking for missing admin pages and widgets...');
        // Ensure registry rows exist before page layouts reference widgets.
        for (const widgetData of DEFAULT_WIDGETS) {
          const { options = {}, ...data } = widgetData;
          await seedAdminWidget(motherEmitter, jwt, data, options);
        }
        if (isCore && jwt) {
          await seedAdminPages(motherEmitter, jwt, ADMIN_PAGES);
        }
      } else {
        console.log('[plainSpace] Not seeded => running seed steps...');

        // A) Seed default widgets before pages so registry rows exist.
        for (const widgetData of DEFAULT_WIDGETS) {
          const { options = {}, ...data } = widgetData;
          await seedAdminWidget(motherEmitter, jwt, data, options);
        }

        // B) Seed admin pages from explicit page/widget slot contracts.
        if (isCore && jwt) {
          await seedAdminPages(motherEmitter, jwt, ADMIN_PAGES);
        }
        console.log('[plainSpace] Admin pages & widgets have been seeded.');

        // C) Mark as seeded
        await setSetting(motherEmitter, jwt, 'PLAINSPACE_SEEDED', 'true');
        console.log('[plainSpace] Set "PLAINSPACE_SEEDED"=true => no more seeds next time.');
      }

          // 3a) Seed admin assets from community modules
      await seedFromModules(motherEmitter, jwt);

      // 3) Issue a public token for front-end usage (why not?)
      motherEmitter.emit(
        'issuePublicToken',
        { purpose: 'plainspacePublic', moduleName: 'auth' },
        (err, token) => {
          if (err || !token) {
            console.error('[plainSpace] Could not issue publicToken =>', err?.message);
          } else {
            global.plainspacePublicToken = token;
            console.log('[plainSpace] Public token for multi-viewport usage is ready ✔');
          }
        }
      );

      // 5) Listen for widget registry requests
      // widget.registry.request.v1 handler (plainSpace)
      motherEmitter.on('widget.registry.request.v1', (payload, callback) => {
        try {
          assertPlainSpacePayload(payload, 'widget.registry.request.v1');
        } catch (err) {
          return callback(err);
        }

        const { jwt, lane } = payload || {};

        // Validate lane (must be either public or admin)
        if (!['public', 'admin'].includes(lane)) {
          return callback(null, { widgets: [] });
        }

        // Forward the request to widgetManager
        motherEmitter.emit('getWidgets', {
          jwt,
          moduleName: 'widgetManager',
          moduleType: MODULE_TYPE,
          widgetType: lane
        }, (err, widgetRows = []) => {
          if (err) {
            console.error(`[plainSpace] Error fetching widgets from widgetManager: ${err.message}`);
            return callback(null, { widgets: [] }); // graceful degradation
          }

          const formattedWidgets = formatRegistryWidgets(widgetRows, lane);

          // Send the formatted widget array to frontend
          callback(null, { widgets: formattedWidgets });
        });
      });


      console.log('[plainSpace] Initialization complete!');
    } catch (err) {
      console.error('[plainSpace] Initialization error:', err.message);
    }
  }
};

module.exports._internals = {
  buildDefaultWidgetSizeContract,
  buildRegistryMetadata,
  formatRegistryWidgets,
  resolveRegistryWidgetFilePath
};
