

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

// mother/modules/plainSpace/plainSpaceService.js
// Because obviously we can’t keep these little helpers in index.js. That would be too straightforward.

require('dotenv').config();
const { requestBackendEvent } = require('../../contracts/backendEventContracts');
const { hasPermission } = require('../userManagement/permissionUtils');
const fs = require('fs');
const path = require('path');
const notificationEmitter = require('../../emitters/notificationEmitter');
const { traceRuntimeEvent } = require('../../utils/runtimeLogging');

const notify = (payload) => {
  try {
    notificationEmitter.emit('notify', payload);
  } catch (e) {
    console.error('[NOTIFY-FALLBACK]', payload?.message || payload, e?.message);
  }
};

function meltdownEmit(emitter, event, payload) {
  return requestBackendEvent(emitter, event, payload);
}

const MODULE      = 'plainspace';
const MODULE_TYPE = 'core';
const PUBLIC_LANE = 'public';
const ADMIN_LANE  = 'admin';
const DASHBOARD_SLOTS = new Set(['third', 'half', 'twoThird', 'full', 'page']);
const LAYOUT_OPTION_KEYS = new Set([
  'max',
  'maxWidth',
  'maxHeight',
  'halfWidth',
  'thirdWidth',
  'width',
  'height',
  'overflow'
]);

function assertPlainSpacePayload(payload, eventName) {
  const { jwt, moduleName, moduleType } = payload || {};
  if (!jwt || moduleName !== MODULE || moduleType !== MODULE_TYPE) {
    throw new Error(`[plainSpace] ${eventName} => invalid meltdown payload.`);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeDashboardSlot(value, fallback = 'full') {
  return DASHBOARD_SLOTS.has(value) ? value : fallback;
}

function normalizeWidgetSeedEntry(entry, widgetSlots = {}) {
  if (typeof entry === 'string') {
    return {
      widgetId: entry,
      slot: normalizeDashboardSlot(widgetSlots[entry])
    };
  }
  if (!isPlainObject(entry) || typeof entry.widgetId !== 'string') {
    return null;
  }
  return {
    widgetId: entry.widgetId,
    slot: normalizeDashboardSlot(entry.slot ?? widgetSlots[entry.widgetId])
  };
}

function getSeedWidgetEntries(widgets = [], widgetSlots = {}) {
  return Array.isArray(widgets)
    ? widgets
      .map(entry => normalizeWidgetSeedEntry(entry, widgetSlots))
      .filter(Boolean)
    : [];
}

function getSeedWidgetIds(widgets = []) {
  return getSeedWidgetEntries(widgets).map(entry => entry.widgetId);
}

function getRetiredSeedWidgetIds(page) {
  return Array.isArray(page?.config?.retiredWidgets)
    ? page.config.retiredWidgets
      .filter(id => typeof id === 'string' && id.trim())
      .map(id => id.trim())
    : [];
}

function buildDashboardLayoutFromWidgets(widgets = [], widgetSlots = {}, startIndex = 0) {
  return getSeedWidgetEntries(widgets, widgetSlots).map((entry, index) => {
    const orderIndex = startIndex + index;
    return {
      id: `w${orderIndex}`,
      widgetId: entry.widgetId,
      slot: entry.slot,
      order: orderIndex * 10,
      code: null
    };
  });
}

function stripLayoutOptions(options = {}) {
  if (!isPlainObject(options)) return null;
  const cleanEntries = Object.entries(options)
    .filter(([key]) => !LAYOUT_OPTION_KEYS.has(key));
  return cleanEntries.length ? Object.fromEntries(cleanEntries) : null;
}

function cloneSeedLayout(page) {
  const layout = page?.config?.layout;
  if (!isPlainObject(layout)) return null;

  try {
    // Persist a detached copy so runtime pages cannot mutate trusted seed data.
    return JSON.parse(JSON.stringify(layout));
  } catch (err) {
    notify({
      moduleName: MODULE,
      notificationType: 'system',
      priority: 'warning',
      message: `[plainSpace] BP_ADMIN_PAGE_LAYOUT_INVALID for "${page?.slug || 'unknown'}": ${err.message}`
    });
    return null;
  }
}

function sameMetadataValue(currentValue, nextValue) {
  return JSON.stringify(currentValue ?? null) === JSON.stringify(nextValue ?? null);
}

/**
 * seedAdminPages:
 * For each admin page, check if it exists by slug.
 * If it doesn’t, meltdown => createPage. Because the world needs more admin pages.
 */
// plainSpaceService.js
async function seedAdminPages(motherEmitter, jwt, adminPages = [], prefixCommunity = false) {
  const makeSlug = (str) =>
    String(str)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 96);

  if (!motherEmitter.listenerCount(BACKEND_EVENTS.GET_PAGE_BY_SLUG) || !motherEmitter.listenerCount(BACKEND_EVENTS.CREATE_PAGE)) {
    console.warn('[plainSpace] pagesManager not active. Skipping admin page seeding.');
    return;
  }

  for (const page of adminPages) {
    let finalSlugForCheck = '';
    try {
      let parentId = null;
      let parent = null;

      const prefixSegs = (prefixCommunity && page.lane === ADMIN_LANE) ? ['pages'] : [];
      const parentSegs = page.parentSlug ? page.parentSlug.split('/').filter(Boolean) : [];
      const pageSegs   = page.slug.split('/').filter(Boolean);

      const parentSlugRaw = parentSegs.length ? [...prefixSegs, ...parentSegs].join('/') : null;
      const finalSlugRaw  = [...prefixSegs, ...parentSegs, ...pageSegs].join('/');

      finalSlugForCheck = finalSlugRaw;

    if (page.config?.icon) {
      if (typeof page.config.icon !== 'string' || !page.config.icon.startsWith('/assets/icons/')) {
        notify({
          moduleName: MODULE,
          notificationType: 'system',
          priority: 'warning',
          message: `[plainSpace] Invalid icon path for admin page "${page.slug}": ${page.config.icon}`
        });
        delete page.config.icon;
      } else {
        const iconFile = path.join(__dirname, '../../../public', page.config.icon);
        if (!fs.existsSync(iconFile)) {
          notify({
            moduleName: MODULE,
            notificationType: 'system',
            priority: 'warning',
            message: `[plainSpace] Icon not found for admin page "${page.slug}": ${page.config.icon}`
          });
          delete page.config.icon;
        }
      }
    }

    if (parentSlugRaw) {
      parent = await meltdownEmit(motherEmitter, BACKEND_EVENTS.GET_PAGE_BY_SLUG, {
        jwt,
        moduleName: 'pagesManager',
        moduleType: 'core',
        slug: parentSlugRaw,
        lane: page.lane
      }).catch(() => null);

      if (!parent) {
        const baseTitle = parentSegs[parentSegs.length - 1] || 'Page';
        const parentTitle = baseTitle.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const res = await meltdownEmit(motherEmitter, BACKEND_EVENTS.CREATE_PAGE, {
          jwt,
          moduleName: 'pagesManager',
          moduleType: 'core',
          title: parentTitle,
          slug: parentSlugRaw,
          lane: page.lane,
          status: 'published',
          meta: {},
          translations: [{
            language: 'en',
            title: parentTitle,
            html: '<div id="root"></div>',
            css: '',
            metaDesc: '',
            seoTitle: parentTitle,
            seoKeywords: ''
          }]
        }).catch(err => {
          notify({
            moduleName: MODULE,
            notificationType: 'system',
            priority: 'error',
            message: `[plainSpace] Error creating parent "${parentSlugRaw}": ${err.message}`
          });
          return null;
        });
        parentId = res?.pageId || null;
        parent = parentId ? { id: parentId, meta: {} } : null;
      } else {
        parentId = parent.id;
      }
    }

    let pageWorkspace = null;
    if (typeof page.config?.workspace === 'string') {
      pageWorkspace = /^[a-z0-9-]+$/.test(page.config.workspace)
        ? page.config.workspace
        : makeSlug(page.config.workspace);
    }
    const pageLayout = cloneSeedLayout(page);

    const existingPage = await meltdownEmit(motherEmitter, BACKEND_EVENTS.GET_PAGE_BY_SLUG, {
      jwt,
      moduleName: 'pagesManager',
      moduleType: 'core',
      slug: finalSlugForCheck,
      lane: page.lane
    }).catch(() => null);
    const pageObj = Array.isArray(existingPage) ? existingPage[0] : existingPage;
    const exists = !!pageObj;

    if (exists) {
      traceRuntimeEvent(`[plainSpace] Admin page "${finalSlugForCheck}" already exists.`);

      const currentMeta = pageObj.meta || {};
      const newMeta = { ...currentMeta };
      let metaChanged = false;
      const pageWeight = Number(page.weight) || 0;
      const weightChanged = pageWeight !== Number(pageObj.weight || 0);

      if (page.config?.icon && currentMeta.icon !== page.config.icon) {
        newMeta.icon = page.config.icon;
        metaChanged = true;
      }

      if (pageWorkspace && currentMeta.workspace !== pageWorkspace) {
        newMeta.workspace = pageWorkspace;
        metaChanged = true;
      } else if (!pageWorkspace && typeof currentMeta.workspace === 'string') {
        delete newMeta.workspace;
        metaChanged = true;
      }

      if (pageLayout && !sameMetadataValue(currentMeta.layout, pageLayout)) {
        newMeta.layout = pageLayout;
        metaChanged = true;
      }

      let missingWidgets = [];
      let retiredWidgets = [];
      if (Array.isArray(page.config?.widgets) && page.config.widgets.length) {
        const seedWidgetIds = getSeedWidgetIds(page.config.widgets);
        const retiredSeedWidgetIds = getRetiredSeedWidgetIds(page);
        const existingWidgets = Array.isArray(newMeta.widgets) ? newMeta.widgets.slice() : [];
        retiredWidgets = existingWidgets.filter(w => retiredSeedWidgetIds.includes(w));
        const activeExistingWidgets = retiredSeedWidgetIds.length
          ? existingWidgets.filter(w => !retiredSeedWidgetIds.includes(w))
          : existingWidgets;
        missingWidgets = seedWidgetIds.filter(w => !activeExistingWidgets.includes(w));
        const nextWidgets = [...activeExistingWidgets, ...missingWidgets];
        if (retiredWidgets.length || missingWidgets.length) {
          newMeta.widgets = nextWidgets;
          metaChanged = true;
        }
      }

      if (metaChanged || weightChanged) {
        try {
          await meltdownEmit(motherEmitter, BACKEND_EVENTS.UPDATE_PAGE, {
            jwt,
            moduleName: 'pagesManager',
            moduleType: 'core',
            pageId: pageObj.id,
            meta: metaChanged ? newMeta : currentMeta,
            weight: pageWeight
          });
          console.log(`[plainSpace] Updated existing admin page "${finalSlugForCheck}".`);
        } catch (err) {
          console.error(`[plainSpace] Failed to update admin page "${finalSlugForCheck}":`, err.message);
          notify({
            moduleName: MODULE,
            notificationType: 'system',
            priority: 'error',
            message: `[plainSpace] Failed to update metadata for admin page "${finalSlugForCheck}": ${err.message}`
          });
        }
      }

      if (missingWidgets.length || retiredWidgets.length) {
        try {
          const layoutRes = await meltdownEmit(motherEmitter, BACKEND_EVENTS.GET_LAYOUT_FOR_VIEWPORT, {
            jwt,
            moduleName: MODULE,
            moduleType: 'core',
            pageId: pageObj.id,
            lane: page.lane,
            viewport: 'desktop'
          });
          let layout = Array.isArray(layoutRes?.layout) ? layoutRes.layout : [];
          if (retiredWidgets.length) {
            layout = layout.filter(entry => !retiredWidgets.includes(entry?.widgetId));
          }
          const existingIds = layout.map(l => l.widgetId);
          const missingLayoutEntries = buildDashboardLayoutFromWidgets(
            missingWidgets.filter(w => !existingIds.includes(w)),
            page.config.widgetSlots || {},
            layout.length
          );
          layout = [...layout, ...missingLayoutEntries];
          await meltdownEmit(motherEmitter, BACKEND_EVENTS.SAVE_LAYOUT_FOR_VIEWPORT, {
            jwt,
            moduleName: MODULE,
            moduleType: 'core',
            pageId: pageObj.id,
            lane: page.lane,
            viewport: 'desktop',
            layout
          });
          console.log(`[plainSpace] Updated widget slots for existing admin page "${finalSlugForCheck}".`);
        } catch (err) {
          notify({
            moduleName: MODULE,
            notificationType: 'system',
            priority: 'error',
            message: `[plainSpace:ADMIN_PAGE_SLOT_UPDATE_FAILED] Failed to update admin page "${finalSlugForCheck}": ${err.message}`
          });
        }
      }

      continue;
    }

    const pageMeta = {};
    if (page.config?.icon) pageMeta.icon = page.config.icon;
    if (pageWorkspace) pageMeta.workspace = pageWorkspace;
    if (pageLayout) pageMeta.layout = pageLayout;
    if (Array.isArray(page.config?.widgets) && page.config.widgets.length) {
      pageMeta.widgets = getSeedWidgetIds(page.config.widgets);
    }

    const createRes = await meltdownEmit(motherEmitter, BACKEND_EVENTS.CREATE_PAGE, {
      jwt,
      moduleName: 'pagesManager',
      moduleType: 'core',
      title: page.title,
      slug: finalSlugRaw,
      lane: page.lane,
      status: 'published',
      parent_id: parentId,
      meta: pageMeta,
      weight: Number(page.weight) || 0,
      translations: [{
        language: 'en',
        title: page.title,
        html: '<div id="root"></div>',
        css: '',
        metaDesc: '',
      seoTitle: page.title,
      seoKeywords: ''
      }]
    });
    console.log(`[plainSpace] ✅ Admin page "${finalSlugForCheck}" successfully created.`);

    const pageId = createRes?.pageId;
    if (pageId && Array.isArray(page.config?.widgets) && page.config.widgets.length) {
      const layout = buildDashboardLayoutFromWidgets(
        page.config.widgets,
        page.config.widgetSlots || {}
      );

      try {
        await meltdownEmit(motherEmitter, BACKEND_EVENTS.SAVE_LAYOUT_FOR_VIEWPORT, {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          pageId,
          lane: page.lane,
          viewport: 'desktop',
          layout
        });
        console.log(`[plainSpace] Default dashboard slots seeded for "${finalSlugForCheck}".`);
      } catch (err) {
        notify({
          moduleName: MODULE,
          notificationType: 'system',
          priority: 'error',
          message: `[plainSpace:DASHBOARD_SLOT_SEED_FAILED] Failed to seed layout for "${finalSlugForCheck}": ${err.message}`
        });
      }
    }
    } catch(err) {
      notify({
        moduleName: MODULE,
        notificationType: 'system',
        priority: 'error',
        message: `[plainSpace] Error creating "${finalSlugForCheck}": ${err.message}`
      });
    }
  }
}


/**
 * checkOrCreateWidget:
 * 1) dbSelect => see if a widget with { widgetId } already exists.
 * 2) If not, meltdown => createWidget.
 */
async function checkOrCreateWidget(motherEmitter, jwt, widgetData) {
  const { widgetId, widgetType } = widgetData;
  const tableName = (widgetType === ADMIN_LANE) ? 'widgets_admin' : 'widgets_public';

  // 1) Check if the widget already exists
  const widgetExists = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
    jwt,
    moduleName: 'widgetManager',
    moduleType: 'core',
    table: tableName,
    where: { widget_id: widgetId }
  }).then(rows => Array.isArray(rows) && rows.length > 0, err => {
    notify({
      moduleName: MODULE,
      notificationType: 'system',
      priority: 'error',
      message: `[plainSpace] Error checking widget "${widgetId}": ${err.message}`
    });
    return false;
  });

  if (widgetExists) {
    traceRuntimeEvent(`[plainSpace] Widget "${widgetId}" already exists. Skipping creation.`);
    return;
  }

  // 2) If not, create the widget
  await requestBackendEvent(motherEmitter, BACKEND_EVENTS.CREATE_WIDGET, {
    jwt,
    moduleName: 'widgetManager',
    moduleType: 'core',
    ...widgetData
  }).then(() => {
    console.log(`[plainSpace] Widget "${widgetId}" successfully created.`);
  }, err => {
    notify({
      moduleName: MODULE,
      notificationType: 'system',
      priority: 'error',
      message: `[plainSpace] createWidget failed for "${widgetId}": ${err.message}`
    });
  });
}

/**
 * seedAdminWidget:
 * Creates a widget row if missing and stores only non-layout defaults.
 * Dashboard sizing is owned by explicit widget metadata and page slots.
 *
 * @param {EventEmitter} motherEmitter
 * @param {string} jwt
 * @param {object} widgetData - { widgetId, widgetType, label, content, category }
 * @param {object} [layoutOpts] - non-layout defaults from module seeds
 */
async function seedAdminWidget(motherEmitter, jwt, widgetData, layoutOpts = {}) {
  await checkOrCreateWidget(motherEmitter, jwt, widgetData);

  const defaultData = stripLayoutOptions(layoutOpts);
  if (!defaultData) {
    return;
  }

  const instanceId = `default.${widgetData.widgetId}`;
  try {
    await meltdownEmit(motherEmitter, BACKEND_EVENTS.SAVE_WIDGET_INSTANCE, {
      jwt,
      moduleName: MODULE,
      moduleType: MODULE_TYPE,
      instanceId,
      content: JSON.stringify(defaultData)
    });
    console.log(`[plainSpace] Stored default widget data for ${widgetData.widgetId}.`);
  } catch (err) {
    notify({
      moduleName: MODULE,
      notificationType: 'system',
      priority: 'error',
      message: `[plainSpace:WIDGET_DEFAULT_SAVE_FAILED] Failed to store default widget data for ${widgetData.widgetId}: ${err.message}`
    });
  }
}

/**
 * registerPlainSpaceEvents:
 * meltdown events for multi-viewport layout storage:
 *   - saveLayoutForViewport
 *   - getLayoutForViewport
 *   - getAllLayoutsForPage
 *   - saveLayoutTemplate
 *   - getLayoutTemplate
 *   - getLayoutTemplateNames
 *   - getGlobalLayoutTemplate
 *   - setGlobalLayoutTemplate
 *   - deleteLayoutTemplate
 */
function registerPlainSpaceEvents(motherEmitter) {
  // 1) saveLayoutForViewport
  motherEmitter.on(BACKEND_EVENTS.SAVE_LAYOUT_FOR_VIEWPORT, (payload, cb) => {
    try {
      assertPlainSpacePayload(payload, BACKEND_EVENTS.SAVE_LAYOUT_FOR_VIEWPORT);
      const { jwt, moduleName, pageId, lane, viewport, layout, decodedJWT } = payload || {};
      if (!jwt || !moduleName || !pageId || !lane || !viewport || !Array.isArray(layout)) {
        return cb(new Error('[plainSpace] Invalid payload in saveLayoutForViewport.'));
      }
      if (decodedJWT && !hasPermission(decodedJWT, 'plainspace.saveLayout')) {
        return cb(new Error('Forbidden – missing permission: plainspace.saveLayout'));
      }
      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
          jwt,
          moduleName: MODULE,
          moduleType: MODULE_TYPE,
          table: '__rawSQL__',
          data: {
            rawSQL: 'UPSERT_PLAINSPACE_LAYOUT',
            params: [{ pageId, lane, viewport, layoutArr: layout }]
          }
        }).then(result => cb(null, result), error => cb(error));
    } catch (err) {
      cb(err);
    }
  });

  // 2) getLayoutForViewport
  motherEmitter.on(BACKEND_EVENTS.GET_LAYOUT_FOR_VIEWPORT, (payload, cb) => {
    try {
      assertPlainSpacePayload(payload, BACKEND_EVENTS.GET_LAYOUT_FOR_VIEWPORT);
      const { jwt, pageId, lane, viewport } = payload || {};
      if (!jwt || !pageId || !lane || !viewport) {
        return cb(new Error('[plainSpace] Missing arguments in getLayoutForViewport.'));
      }
      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'GET_PLAINSPACE_LAYOUT',
            params: [{ pageId, lane, viewport }]
          }
        }).then((rows = []) => {
  if (!rows.length) {
    return cb(null, {
      layout: []
    });
  }
  let layoutArr = rows[0].layout_json || [];
  if (typeof layoutArr === 'string') {
    try {
      layoutArr = JSON.parse(layoutArr);
    } catch {
      layoutArr = [];
    }
  }
  cb(null, {
    layout: layoutArr
  });
}, err => {
  return cb(err);
});
    } catch (err) {
      cb(err);
    }
  });

  // 3) getAllLayoutsForPage
  motherEmitter.on(BACKEND_EVENTS.GET_ALL_LAYOUTS_FOR_PAGE, (payload, cb) => {
    try {
      assertPlainSpacePayload(payload, BACKEND_EVENTS.GET_ALL_LAYOUTS_FOR_PAGE);
      const { jwt, pageId, lane } = payload || {};
      if (!jwt || !pageId || !lane) {
        return cb(new Error('[plainSpace] Invalid payload in getAllLayoutsForPage.'));
      }
      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'GET_ALL_PLAINSPACE_LAYOUTS',
            params: [{ pageId, lane }]
          }
        }).then((rows = []) => {
  const layouts = rows.map(r => {
    let layoutArr = r.layout_json || [];
    if (typeof layoutArr === 'string') {
      try {
        layoutArr = JSON.parse(layoutArr);
      } catch {
        layoutArr = [];
      }
    }
    return {
      viewport: r.viewport,
      layout: layoutArr
    };
  });
  cb(null, {
    layouts
  });
}, err => {
  return cb(err);
});
    } catch (err) {
      cb(err);
    }
  });

  // 4) saveLayoutTemplate
  motherEmitter.on(BACKEND_EVENTS.SAVE_LAYOUT_TEMPLATE, (payload, cb) => {
    try {
      assertPlainSpacePayload(payload, BACKEND_EVENTS.SAVE_LAYOUT_TEMPLATE);
      const { jwt, name, lane, viewport, layout, previewPath, decodedJWT } = payload || {};
      if (!jwt || !name || !lane || !viewport || !Array.isArray(layout)) {
        return cb(new Error('[plainSpace] Invalid payload in saveLayoutTemplate.'));
      }
      if (decodedJWT && !hasPermission(decodedJWT, 'plainspace.saveLayoutTemplate')) {
        return cb(new Error('Forbidden – missing permission: plainspace.saveLayoutTemplate'));
      }
      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'UPSERT_PLAINSPACE_LAYOUT_TEMPLATE',
            params: [{ name, lane, viewport, layoutArr: layout, previewPath }]
          }
        }).then(result => cb(null, result), error => cb(error));
    } catch (err) {
      cb(err);
    }
  });

  // 5) getLayoutTemplate
  motherEmitter.on(BACKEND_EVENTS.GET_LAYOUT_TEMPLATE, (payload, cb) => {
    try {
      assertPlainSpacePayload(payload, BACKEND_EVENTS.GET_LAYOUT_TEMPLATE);
      const { jwt, name } = payload || {};
      if (!jwt || !name) {
        return cb(new Error('[plainSpace] Invalid payload in getLayoutTemplate.'));
      }
      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'GET_PLAINSPACE_LAYOUT_TEMPLATE',
            params: [{ name }]
          }
        }).then((rows = []) => {
  if (!rows.length) {
    return cb(null, {
      layout: []
    });
  }
  let layoutArr = rows[0].layout_json || [];
  if (typeof layoutArr === 'string') {
    try {
      layoutArr = JSON.parse(layoutArr);
    } catch {
      layoutArr = [];
    }
  }
  cb(null, {
    layout: layoutArr
  });
}, err => {
  return cb(err);
});
    } catch (err) {
      cb(err);
    }
  });

  // 6) getLayoutTemplateNames
  motherEmitter.on(BACKEND_EVENTS.GET_LAYOUT_TEMPLATE_NAMES, (payload, cb) => {
    try {
      assertPlainSpacePayload(payload, BACKEND_EVENTS.GET_LAYOUT_TEMPLATE_NAMES);
      const { jwt, lane } = payload || {};
      if (!jwt || !lane) {
        return cb(new Error('[plainSpace] Invalid payload in getLayoutTemplateNames.'));
      }
      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'GET_PLAINSPACE_LAYOUT_TEMPLATE_NAMES',
            params: [{ lane }]
          }
        }).then((rows = []) => {
  const templates = rows.map(r => ({
    name: r.name,
    previewPath: r.preview_path || '',
    isGlobal: !!r.is_global,
    updatedAt: r.updated_at || null
  }));
  cb(null, {
    templates
  });
}, err => {
  return cb(err);
});
    } catch (err) {
      cb(err);
    }
  });

  // 7) getGlobalLayoutTemplate
  motherEmitter.on(BACKEND_EVENTS.GET_GLOBAL_LAYOUT_TEMPLATE, (payload, cb) => {
    try {
      assertPlainSpacePayload(payload, BACKEND_EVENTS.GET_GLOBAL_LAYOUT_TEMPLATE);
      const { jwt } = payload || {};
      if (!jwt) {
        return cb(new Error('[plainSpace] Invalid payload in getGlobalLayoutTemplate.'));
      }
      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: { rawSQL: 'GET_GLOBAL_LAYOUT_TEMPLATE', params: [{}] }
        }).then((rows = []) => {
  if (!rows.length) return cb(null, {
    layout: [],
    name: null
  });
  let layoutArr = rows[0].layout_json || [];
  if (typeof layoutArr === 'string') {
    try {
      layoutArr = JSON.parse(layoutArr);
    } catch {
      layoutArr = [];
    }
  }
  cb(null, {
    layout: layoutArr,
    name: rows[0].name
  });
}, err => {
  return cb(err);
});
    } catch (err) { cb(err); }
  });

  // 8) setGlobalLayoutTemplate
  motherEmitter.on(BACKEND_EVENTS.SET_GLOBAL_LAYOUT_TEMPLATE, (payload, cb) => {
    try {
      assertPlainSpacePayload(payload, BACKEND_EVENTS.SET_GLOBAL_LAYOUT_TEMPLATE);
      const { jwt, name, decodedJWT } = payload || {};
      if (!jwt || !name) {
        return cb(new Error('[plainSpace] Invalid payload in setGlobalLayoutTemplate.'));
      }
      if (decodedJWT && !hasPermission(decodedJWT, 'plainspace.saveLayoutTemplate')) {
        return cb(new Error('Forbidden – missing permission: plainspace.saveLayoutTemplate'));
      }
      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
      data: { rawSQL: 'SET_GLOBAL_LAYOUT_TEMPLATE', params: [{ name }] }
      }).then(result => cb(null, result), error => cb(error));
  } catch (err) { cb(err); }
  });

  // 9) deleteLayoutTemplate
  motherEmitter.on(BACKEND_EVENTS.DELETE_LAYOUT_TEMPLATE, (payload, cb) => {
    try {
      assertPlainSpacePayload(payload, BACKEND_EVENTS.DELETE_LAYOUT_TEMPLATE);
      const { jwt, name, decodedJWT } = payload || {};
      if (!jwt || !name) {
        return cb(new Error('[plainSpace] Invalid payload in deleteLayoutTemplate.'));
      }
      if (decodedJWT && !hasPermission(decodedJWT, 'plainspace.saveLayoutTemplate')) {
        return cb(new Error('Forbidden – missing permission: plainspace.saveLayoutTemplate'));
      }
      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_DELETE, {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          where: { rawSQL: 'DELETE_LAYOUT_TEMPLATE', name }
        }).then(result => cb(null, result), error => cb(error));
    } catch (err) { cb(err); }
  });

  // 7) saveWidgetInstance
  motherEmitter.on(BACKEND_EVENTS.SAVE_WIDGET_INSTANCE, (payload, cb) => {
    try {
      assertPlainSpacePayload(payload, BACKEND_EVENTS.SAVE_WIDGET_INSTANCE);
      const { jwt, instanceId, content, decodedJWT } = payload || {};
      if (!jwt || !instanceId) {
        return cb(new Error('[plainSpace] Invalid payload in saveWidgetInstance.'));
      }
      if (decodedJWT && !hasPermission(decodedJWT, 'plainspace.widgetInstance')) {
        return cb(new Error('Forbidden – missing permission: plainspace.widgetInstance'));
      }
      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: { rawSQL: 'UPSERT_WIDGET_INSTANCE', params: [{ instanceId, content }] }
        }).then(result => cb(null, result), error => cb(error));
    } catch (err) {
      cb(err);
    }
  });

  // 8) getWidgetInstance
  motherEmitter.on(BACKEND_EVENTS.GET_WIDGET_INSTANCE, (payload, cb) => {
    try {
      assertPlainSpacePayload(payload, BACKEND_EVENTS.GET_WIDGET_INSTANCE);
      const { jwt, instanceId, decodedJWT } = payload || {};
      if (!jwt || !instanceId) {
        return cb(new Error('[plainSpace] Invalid payload in getWidgetInstance.'));
      }
      if (decodedJWT && !hasPermission(decodedJWT, 'plainspace.widgetInstance')) {
        return cb(new Error('Forbidden – missing permission: plainspace.widgetInstance'));
      }
      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: { rawSQL: 'GET_WIDGET_INSTANCE', params: [{ instanceId }] }
        }).then((rows = []) => {
  const content = rows.length ? rows[0].content || '' : '';
  cb(null, {
    content
  });
}, err => {
  return cb(err);
});
    } catch (err) {
      cb(err);
    }
  });

  // 10) savePublishedDesignMeta
  motherEmitter.on(BACKEND_EVENTS.SAVE_PUBLISHED_DESIGN_META, (payload, cb) => {
    try {
      assertPlainSpacePayload(payload, BACKEND_EVENTS.SAVE_PUBLISHED_DESIGN_META);
      const { jwt, name, path, files, decodedJWT } = payload || {};
      if (!jwt || !name || !path || !Array.isArray(files)) {
        return cb(new Error('[plainSpace] Invalid payload in savePublishedDesignMeta.'));
      }
      if (decodedJWT && !hasPermission(decodedJWT, 'plainspace.saveLayoutTemplate')) {
        return cb(new Error('Forbidden – missing permission: plainspace.saveLayoutTemplate'));
      }
      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_UPDATE, {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: { rawSQL: 'UPSERT_PLAINSPACE_PUBLISHED_DESIGN', params: [{ name, path, files }] }
        }).then(result => cb(null, result), error => cb(error));
    } catch (err) {
      cb(err);
    }
  });

  // 11) getPublishedDesignMeta
  motherEmitter.on(BACKEND_EVENTS.GET_PUBLISHED_DESIGN_META, (payload, cb) => {
    try {
      assertPlainSpacePayload(payload, BACKEND_EVENTS.GET_PUBLISHED_DESIGN_META);
      const { jwt, name } = payload || {};
      if (!jwt || !name) {
        return cb(new Error('[plainSpace] Invalid payload in getPublishedDesignMeta.'));
      }
      requestBackendEvent(motherEmitter, BACKEND_EVENTS.DB_SELECT, {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: { rawSQL: 'GET_PLAINSPACE_PUBLISHED_DESIGN', params: [{ name }] }
        }).then((rows = []) => {
  if (!rows.length) return cb(null, {
    path: '',
    files: []
  });
  let files = rows[0].files || [];
  if (typeof files === 'string') {
    try {
      files = JSON.parse(files);
    } catch {
      files = [];
    }
  }
  cb(null, {
    path: rows[0].path || '',
    files
  });
}, err => {
  return cb(err);
});
    } catch (err) {
      cb(err);
    }
  });

}

module.exports = {
  seedAdminPages,
  checkOrCreateWidget,
  seedAdminWidget,
  registerPlainSpaceEvents,
  meltdownEmit,
  assertPlainSpacePayload,
  MODULE,
  MODULE_TYPE,
  PUBLIC_LANE,
  ADMIN_LANE
};
