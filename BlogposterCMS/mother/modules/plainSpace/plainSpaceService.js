// mother/modules/plainSpace/plainSpaceService.js
// Because obviously we can’t keep these little helpers in index.js. That would be too straightforward.

require('dotenv').config();
const { onceCallback } = require('../../emitters/motherEmitter');
const { hasPermission } = require('../userManagement/permissionUtils');
const fs = require('fs');
const path = require('path');

function meltdownEmit(emitter, event, payload) {
  return new Promise((resolve, reject) => {
    const callback = onceCallback((err, res) => {
      if (err) return reject(err);
      resolve(res);
    });

    const emitted = emitter.emit(event, payload, callback);

    if (!emitted) {
      reject(new Error(`No listeners for event "${event}"`));
    }
  });
}

const MODULE      = 'plainspace';
const PUBLIC_LANE = 'public';
const ADMIN_LANE  = 'admin';

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

  for (const page of adminPages) {
    try {
    let parentId = null;
    let parent = null;

    const prefixSegs = (prefixCommunity && page.lane === ADMIN_LANE) ? ['pages'] : [];
    const parentSegs = page.parentSlug ? page.parentSlug.split('/').filter(Boolean) : [];
    const pageSegs   = page.slug.split('/').filter(Boolean);

    const parentSlugRaw = parentSegs.length ? [...prefixSegs, ...parentSegs].join('/') : null;
    const finalSlugRaw  = [...prefixSegs, ...parentSegs, ...pageSegs].join('/');

    let finalSlugForCheck = finalSlugRaw.replace(/\//g, '-');

    if (page.config?.icon) {
      if (typeof page.config.icon !== 'string' || !page.config.icon.startsWith('/assets/icons/')) {
        console.warn(`[plainSpace] Invalid icon path for admin page "${page.slug}":`, page.config.icon);
        delete page.config.icon;
      } else {
        const iconFile = path.join(__dirname, '../../../public', page.config.icon);
        if (!fs.existsSync(iconFile)) {
          console.warn(`[plainSpace] Icon not found for admin page "${page.slug}":`, page.config.icon);
          delete page.config.icon;
        }
      }
    }

    if (parentSlugRaw) {
      const parentSlugSanitized = parentSlugRaw.replace(/\//g, '-');

      parent = await meltdownEmit(motherEmitter, 'getPageBySlug', {
        jwt,
        moduleName: 'pagesManager',
        moduleType: 'core',
        slug: parentSlugSanitized,
        lane: page.lane
      }).catch(() => null);

      if (!parent) {
        const baseTitle = parentSegs[parentSegs.length - 1] || 'Page';
        const parentTitle = baseTitle.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        const res = await meltdownEmit(motherEmitter, 'createPage', {
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
        }).catch(err => { console.error(`[plainSpace] Error creating parent "${parentSlugRaw}":`, err.message); return null; });
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

    const existingPage = await meltdownEmit(motherEmitter, 'getPageBySlug', {
      jwt,
      moduleName: 'pagesManager',
      moduleType: 'core',
      slug: finalSlugForCheck,
      lane: page.lane
    }).catch(() => null);
    const pageObj = Array.isArray(existingPage) ? existingPage[0] : existingPage;
    const exists = !!pageObj;

    if (exists) {
      console.log(`[plainSpace] Admin page "${finalSlugForCheck}" already exists.`);

      const currentMeta = pageObj.meta || {};
      const newMeta = { ...currentMeta };
      let metaChanged = false;

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

      let missingWidgets = [];
      if (Array.isArray(page.config?.widgets) && page.config.widgets.length) {
        const existingWidgets = Array.isArray(newMeta.widgets) ? newMeta.widgets.slice() : [];
        missingWidgets = page.config.widgets.filter(w => !existingWidgets.includes(w));
        if (missingWidgets.length) {
          newMeta.widgets = [...existingWidgets, ...missingWidgets];
          metaChanged = true;
        }
      }

      if (metaChanged) {
        try {
          await meltdownEmit(motherEmitter, 'updatePage', {
            jwt,
            moduleName: 'pagesManager',
            moduleType: 'core',
            pageId: pageObj.id,
            meta: newMeta
          });
          console.log(`[plainSpace] Updated metadata for existing admin page "${finalSlugForCheck}".`);
        } catch (err) {
          console.error(`[plainSpace] Failed to update metadata for admin page "${finalSlugForCheck}":`, err.message);
        }
      }

      if (missingWidgets.length) {
        try {
          const layoutRes = await meltdownEmit(motherEmitter, 'getLayoutForViewport', {
            jwt,
            moduleName: MODULE,
            moduleType: 'core',
            pageId: pageObj.id,
            lane: page.lane,
            viewport: 'desktop'
          });
          let layout = Array.isArray(layoutRes?.layout) ? layoutRes.layout : [];
          const existingIds = layout.map(l => l.widgetId);
          let y = layout.reduce((m, l) => Math.max(m, (l.y ?? 0) + (l.h ?? 4)), 0);
          for (const w of missingWidgets) {
            if (existingIds.includes(w)) continue;
            layout.push({ id: `w${layout.length}`, widgetId: w, x: 0, y, w: 8, h: 4, code: null });
            y += 4;
          }
          await meltdownEmit(motherEmitter, 'saveLayoutForViewport', {
            jwt,
            moduleName: MODULE,
            moduleType: 'core',
            pageId: pageObj.id,
            lane: page.lane,
            viewport: 'desktop',
            layout
          });
          console.log(`[plainSpace] Updated widgets for existing admin page "${finalSlugForCheck}".`);
        } catch (err) {
          console.error(`[plainSpace] Failed to update admin page "${finalSlugForCheck}":`, err.message);
        }
      }

      continue;
    }

    const pageMeta = {};
    if (page.config?.icon) pageMeta.icon = page.config.icon;
    if (pageWorkspace) pageMeta.workspace = pageWorkspace;
    if (Array.isArray(page.config?.widgets) && page.config.widgets.length) {
      pageMeta.widgets = page.config.widgets;
    }

    const createRes = await meltdownEmit(motherEmitter, 'createPage', {
      jwt,
      moduleName: 'pagesManager',
      moduleType: 'core',
      title: page.title,
      slug: finalSlugRaw,
      lane: page.lane,
      status: 'published',
      parent_id: parentId,
      meta: pageMeta,
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
      const layout = page.config.widgets.map((wId, idx) => ({
        id: `w${idx}`,
        widgetId: wId,
        x: 0,
        y: idx * 2,
        w: 8,
        h: 4,
        code: null
      }));
      try {
        await meltdownEmit(motherEmitter, 'saveLayoutForViewport', {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          pageId,
          lane: page.lane,
          viewport: 'desktop',
          layout
        });
        console.log(`[plainSpace] Default layout seeded for "${finalSlugForCheck}".`);
      } catch (err) {
        console.error(`[plainSpace] Failed to seed layout for "${finalSlugForCheck}":`, err.message);
      }
    }
    } catch(err) {
      console.error(`[plainSpace] Error creating "${finalSlugForCheck}":`, err.message);
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
  const widgetExists = await new Promise((resolve) => {
    motherEmitter.emit(
      'dbSelect',
      {
        jwt,
        moduleName: 'widgetManager',
        moduleType: 'core',
        table: tableName,
        where: { widget_id: widgetId }
      },
      onceCallback((err, rows) => {
        if (err) {
          console.error(`[plainSpace] Error checking widget "${widgetId}":`, err.message);
          return resolve(false);
        }
        resolve(Array.isArray(rows) && rows.length > 0);
      })
    );
  });

  if (widgetExists) {
    console.log(`[plainSpace] Widget "${widgetId}" already exists. Skipping creation.`);
    return;
  }

  // 2) If not, create the widget
  await new Promise((resolve) => {
    motherEmitter.emit(
      'createWidget',
      {
        jwt,
        moduleName: 'widgetManager',
        moduleType: 'core',
        ...widgetData
      },
      onceCallback((err) => {
        if (err) {
          console.error(`[plainSpace] createWidget failed for "${widgetId}":`, err.message);
        } else {
          console.log(`[plainSpace] Widget "${widgetId}" successfully created.`);
        }
        resolve();
      })
    );
  });
}

/**
 * seedAdminWidget:
 * Creates an admin lane widget if missing and optionally stores
 * layout options in the widget_instances table. These options
 * describe width/height behaviour of the widget when seeded on a page.
 *
 * @param {EventEmitter} motherEmitter
 * @param {string} jwt
 * @param {object} widgetData - { widgetId, widgetType, label, content, category }
 * @param {object} [layoutOpts] - { max, maxWidth, maxHeight, halfWidth, thirdWidth, width, height, overflow }
 */
async function seedAdminWidget(motherEmitter, jwt, widgetData, layoutOpts = {}) {
  await checkOrCreateWidget(motherEmitter, jwt, widgetData);

  if (Object.keys(layoutOpts).length === 0) return;

  const instanceId = `default.${widgetData.widgetId}`;
  try {
    await meltdownEmit(motherEmitter, 'saveWidgetInstance', {
      jwt,
      moduleName: MODULE,
      instanceId,
      content: JSON.stringify(layoutOpts)
    });
    console.log(`[plainSpace] Stored layout options for ${widgetData.widgetId}.`);
  } catch (err) {
    console.error(`[plainSpace] Failed to store layout options for ${widgetData.widgetId}:`, err.message);
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
  motherEmitter.on('saveLayoutForViewport', (payload, cb) => {
    try {
      const { jwt, moduleName, pageId, lane, viewport, layout, decodedJWT } = payload || {};
      if (!jwt || !moduleName || !pageId || !lane || !viewport || !Array.isArray(layout)) {
        return cb(new Error('[plainSpace] Invalid payload in saveLayoutForViewport.'));
      }
      if (decodedJWT && !hasPermission(decodedJWT, 'plainspace.saveLayout')) {
        return cb(new Error('Forbidden – missing permission: plainspace.saveLayout'));
      }
      motherEmitter.emit(
        'dbUpdate',
        {
          jwt,
          moduleName,
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'UPSERT_PLAINSPACE_LAYOUT',
            params: [{ pageId, lane, viewport, layoutArr: layout }]
          }
        },
        cb
      );
    } catch (err) {
      cb(err);
    }
  });

  // 2) getLayoutForViewport
  motherEmitter.on('getLayoutForViewport', (payload, cb) => {
    try {
      const { jwt, pageId, lane, viewport } = payload || {};
      if (!jwt || !pageId || !lane || !viewport) {
        return cb(new Error('[plainSpace] Missing arguments in getLayoutForViewport.'));
      }
      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'GET_PLAINSPACE_LAYOUT',
            params: [{ pageId, lane, viewport }]
          }
        },
        (err, rows = []) => {
          if (err) return cb(err);
          if (!rows.length) {
            return cb(null, { layout: [] });
          }
          let layoutArr = rows[0].layout_json || [];
          if (typeof layoutArr === 'string') {
            try { layoutArr = JSON.parse(layoutArr); } catch { layoutArr = []; }
          }
          cb(null, { layout: layoutArr });
        }
      );
    } catch (err) {
      cb(err);
    }
  });

  // 3) getAllLayoutsForPage
  motherEmitter.on('getAllLayoutsForPage', (payload, cb) => {
    try {
      const { jwt, pageId, lane } = payload || {};
      if (!jwt || !pageId || !lane) {
        return cb(new Error('[plainSpace] Invalid payload in getAllLayoutsForPage.'));
      }
      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'GET_ALL_PLAINSPACE_LAYOUTS',
            params: [{ pageId, lane }]
          }
        },
        (err, rows = []) => {
          if (err) return cb(err);
          const layouts = rows.map((r) => {
            let layoutArr = r.layout_json || [];
            if (typeof layoutArr === 'string') {
              try { layoutArr = JSON.parse(layoutArr); } catch { layoutArr = []; }
            }
            return { viewport: r.viewport, layout: layoutArr };
          });
          cb(null, { layouts });
        }
      );
    } catch (err) {
      cb(err);
    }
  });

  // 4) saveLayoutTemplate
  motherEmitter.on('saveLayoutTemplate', (payload, cb) => {
    try {
      const { jwt, name, lane, viewport, layout, previewPath, decodedJWT } = payload || {};
      if (!jwt || !name || !lane || !viewport || !Array.isArray(layout)) {
        return cb(new Error('[plainSpace] Invalid payload in saveLayoutTemplate.'));
      }
      if (decodedJWT && !hasPermission(decodedJWT, 'plainspace.saveLayoutTemplate')) {
        return cb(new Error('Forbidden – missing permission: plainspace.saveLayoutTemplate'));
      }
      motherEmitter.emit(
        'dbUpdate',
        {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'UPSERT_PLAINSPACE_LAYOUT_TEMPLATE',
            params: [{ name, lane, viewport, layoutArr: layout, previewPath }]
          }
        },
        cb
      );
    } catch (err) {
      cb(err);
    }
  });

  // 5) getLayoutTemplate
  motherEmitter.on('getLayoutTemplate', (payload, cb) => {
    try {
      const { jwt, name } = payload || {};
      if (!jwt || !name) {
        return cb(new Error('[plainSpace] Invalid payload in getLayoutTemplate.'));
      }
      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'GET_PLAINSPACE_LAYOUT_TEMPLATE',
            params: [{ name }]
          }
        },
        (err, rows = []) => {
          if (err) return cb(err);
          if (!rows.length) {
            return cb(null, { layout: [] });
          }
          let layoutArr = rows[0].layout_json || [];
          if (typeof layoutArr === 'string') {
            try { layoutArr = JSON.parse(layoutArr); } catch { layoutArr = []; }
          }
          cb(null, { layout: layoutArr });
        }
      );
    } catch (err) {
      cb(err);
    }
  });

  // 6) getLayoutTemplateNames
  motherEmitter.on('getLayoutTemplateNames', (payload, cb) => {
    try {
      const { jwt, lane } = payload || {};
      if (!jwt || !lane) {
        return cb(new Error('[plainSpace] Invalid payload in getLayoutTemplateNames.'));
      }
      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: {
            rawSQL: 'GET_PLAINSPACE_LAYOUT_TEMPLATE_NAMES',
            params: [{ lane }]
          }
        },
        (err, rows = []) => {
          if (err) return cb(err);
          const templates = rows.map(r => ({
            name: r.name,
            previewPath: r.preview_path || '',
            isGlobal: !!r.is_global,
            updatedAt: r.updated_at || null
          }));
          cb(null, { templates });
        }
      );
    } catch (err) {
      cb(err);
    }
  });

  // 7) getGlobalLayoutTemplate
  motherEmitter.on('getGlobalLayoutTemplate', (payload, cb) => {
    try {
      const { jwt } = payload || {};
      if (!jwt) {
        return cb(new Error('[plainSpace] Invalid payload in getGlobalLayoutTemplate.'));
      }
      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: { rawSQL: 'GET_GLOBAL_LAYOUT_TEMPLATE', params: [{}] }
        },
        (err, rows = []) => {
          if (err) return cb(err);
          if (!rows.length) return cb(null, { layout: [], name: null });
          let layoutArr = rows[0].layout_json || [];
          if (typeof layoutArr === 'string') {
            try { layoutArr = JSON.parse(layoutArr); } catch { layoutArr = []; }
          }
          cb(null, { layout: layoutArr, name: rows[0].name });
        }
      );
    } catch (err) { cb(err); }
  });

  // 8) setGlobalLayoutTemplate
  motherEmitter.on('setGlobalLayoutTemplate', (payload, cb) => {
    try {
      const { jwt, name, decodedJWT } = payload || {};
      if (!jwt || !name) {
        return cb(new Error('[plainSpace] Invalid payload in setGlobalLayoutTemplate.'));
      }
      if (decodedJWT && !hasPermission(decodedJWT, 'plainspace.saveLayoutTemplate')) {
        return cb(new Error('Forbidden – missing permission: plainspace.saveLayoutTemplate'));
      }
      motherEmitter.emit(
        'dbUpdate',
        {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
      data: { rawSQL: 'SET_GLOBAL_LAYOUT_TEMPLATE', params: [{ name }] }
      },
      cb
    );
  } catch (err) { cb(err); }
  });

  // 9) deleteLayoutTemplate
  motherEmitter.on('deleteLayoutTemplate', (payload, cb) => {
    try {
      const { jwt, name, decodedJWT } = payload || {};
      if (!jwt || !name) {
        return cb(new Error('[plainSpace] Invalid payload in deleteLayoutTemplate.'));
      }
      if (decodedJWT && !hasPermission(decodedJWT, 'plainspace.saveLayoutTemplate')) {
        return cb(new Error('Forbidden – missing permission: plainspace.saveLayoutTemplate'));
      }
      motherEmitter.emit(
        'dbDelete',
        {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          where: { rawSQL: 'DELETE_LAYOUT_TEMPLATE', name }
        },
        cb
      );
    } catch (err) { cb(err); }
  });

  // 7) saveWidgetInstance
  motherEmitter.on('saveWidgetInstance', (payload, cb) => {
    try {
      const { jwt, instanceId, content, decodedJWT } = payload || {};
      if (!jwt || !instanceId) {
        return cb(new Error('[plainSpace] Invalid payload in saveWidgetInstance.'));
      }
      if (decodedJWT && !hasPermission(decodedJWT, 'plainspace.widgetInstance')) {
        return cb(new Error('Forbidden – missing permission: plainspace.widgetInstance'));
      }
      motherEmitter.emit(
        'dbUpdate',
        {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: { rawSQL: 'UPSERT_WIDGET_INSTANCE', params: [{ instanceId, content }] }
        },
        cb
      );
    } catch (err) {
      cb(err);
    }
  });

  // 8) getWidgetInstance
  motherEmitter.on('getWidgetInstance', (payload, cb) => {
    try {
      const { jwt, instanceId, decodedJWT } = payload || {};
      if (!jwt || !instanceId) {
        return cb(new Error('[plainSpace] Invalid payload in getWidgetInstance.'));
      }
      if (decodedJWT && !hasPermission(decodedJWT, 'plainspace.widgetInstance')) {
        return cb(new Error('Forbidden – missing permission: plainspace.widgetInstance'));
      }
      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: { rawSQL: 'GET_WIDGET_INSTANCE', params: [{ instanceId }] }
        },
        (err, rows = []) => {
          if (err) return cb(err);
          const content = rows.length ? rows[0].content || '' : '';
          cb(null, { content });
        }
      );
    } catch (err) {
      cb(err);
    }
  });

  // 10) savePublishedDesignMeta
  motherEmitter.on('savePublishedDesignMeta', (payload, cb) => {
    try {
      const { jwt, name, path, files, decodedJWT } = payload || {};
      if (!jwt || !name || !path || !Array.isArray(files)) {
        return cb(new Error('[plainSpace] Invalid payload in savePublishedDesignMeta.'));
      }
      if (decodedJWT && !hasPermission(decodedJWT, 'plainspace.saveLayoutTemplate')) {
        return cb(new Error('Forbidden – missing permission: plainspace.saveLayoutTemplate'));
      }
      motherEmitter.emit(
        'dbUpdate',
        {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: { rawSQL: 'UPSERT_PLAINSPACE_PUBLISHED_DESIGN', params: [{ name, path, files }] }
        },
        cb
      );
    } catch (err) {
      cb(err);
    }
  });

  // 11) getPublishedDesignMeta
  motherEmitter.on('getPublishedDesignMeta', (payload, cb) => {
    try {
      const { jwt, name } = payload || {};
      if (!jwt || !name) {
        return cb(new Error('[plainSpace] Invalid payload in getPublishedDesignMeta.'));
      }
      motherEmitter.emit(
        'dbSelect',
        {
          jwt,
          moduleName: MODULE,
          moduleType: 'core',
          table: '__rawSQL__',
          data: { rawSQL: 'GET_PLAINSPACE_PUBLISHED_DESIGN', params: [{ name }] }
        },
        (err, rows = []) => {
          if (err) return cb(err);
          if (!rows.length) return cb(null, { path: '', files: [] });
          let files = rows[0].files || [];
          if (typeof files === 'string') {
            try { files = JSON.parse(files); } catch { files = []; }
          }
          cb(null, { path: rows[0].path || '', files });
        }
      );
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
  MODULE,
  PUBLIC_LANE,
  ADMIN_LANE
};
