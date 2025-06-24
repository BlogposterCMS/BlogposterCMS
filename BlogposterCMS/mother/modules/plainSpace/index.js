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
  MODULE,
  PUBLIC_LANE,
  ADMIN_LANE
} = require('./plainSpaceService');

const { ADMIN_PAGES }       = require('./config/adminPages');
const { DEFAULT_WIDGETS }   = require('./config/defaultWidgets');
const { getSetting, setSetting } = require('./settingHelpers');
const { onceCallback }      = require('../../emitters/motherEmitter');

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
        await seedAdminPages(motherEmitter, jwt, seed.adminPages);
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
      console.warn('[plainSpace] isCore=false – continuing, but this is unexpected.');
    }
    if (!jwt) {
      console.error('[plainSpace] No JWT => meltdown DB calls not possible. Aborting.');
      return;
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
        if (isCore && jwt) {
          await seedAdminPages(motherEmitter, jwt, ADMIN_PAGES);
          for (const widgetData of DEFAULT_WIDGETS) {
            const { options = {}, ...data } = widgetData;
            await seedAdminWidget(motherEmitter, jwt, data, options);
          }
        }
      } else {
        console.log('[plainSpace] Not seeded => running seed steps...');

        // A) Seed admin pages, if they’re not found
        if (isCore && jwt) {
          await seedAdminPages(motherEmitter, jwt, ADMIN_PAGES);
        }

        // B) Seed default widgets
        for (const widgetData of DEFAULT_WIDGETS) {
          const { options = {}, ...data } = widgetData;
          await seedAdminWidget(motherEmitter, jwt, data, options);
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
        const { jwt, lane } = payload || {};

        // Validate lane (must be either public or admin)
        if (!['public', 'admin'].includes(lane)) {
          return callback(null, { widgets: [] });
        }

        // Forward the request to widgetManager
        motherEmitter.emit('getWidgets', {
          jwt,
          moduleName: 'widgetManager',
          moduleType: 'core',
          widgetType: lane
        }, (err, widgetRows = []) => {
          if (err) {
            console.error(`[plainSpace] Error fetching widgets from widgetManager: ${err.message}`);
            return callback(null, { widgets: [] }); // graceful degradation
          }

          // Resolve to CMS public directory (three levels up)
          const basePublic = path.resolve(__dirname, '../../../public');

          // Filter out widgets whose JS files no longer exist
          const filtered = widgetRows.filter(row => {
            const fp = path.join(basePublic, row.content.replace(/^\/+/, ''));
            if (!fs.existsSync(fp)) {
              console.warn(`[plainSpace] Skipping missing widget file ${row.widgetId} => ${row.content}`);
              return false;
            }
            return true;
          });

          // Map DB widget rows into frontend-friendly format
          const formattedWidgets = filtered.map(row => ({
            id: row.widgetId,           // ID from widgetManager
            lane,
            codeUrl: row.content,       // Path to widget JS file
            checksum: '',               // Optional, currently unused
            metadata: {
              label: row.label,
              category: row.category
            }
          }));

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
