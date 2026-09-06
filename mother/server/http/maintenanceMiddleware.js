'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

const MAINTENANCE_ALLOWED_PREFIXES = [
  '/admin',
  '/assets',
  '/api',
  '/build',
  '/media',
  '/ui',
  '/favicon.ico',
  '/plainspace',
  '/apps',
  '/widgets',
  '/fonts'
];

function createMaintenanceMiddleware({ getCachedCoreToken, motherEmitter }) {
  return async function maintenanceMiddleware(req, res, next) {
    if (MAINTENANCE_ALLOWED_PREFIXES.some(prefix => req.path.startsWith(prefix))) {
      return next();
    }

    // A signed Design Studio preview must reach the public route unchanged so
    // that the origin token can be verified there. Redirecting it to the
    // maintenance slug would discard the token and make the sandboxed frame
    // fail with X-Frame-Options instead of rendering the current draft.
    if (String(req.query?.['designer-live-preview'] || '') === '1') {
      return next();
    }

    const settingsManagerToken = await getCachedCoreToken('settingsManager');
    const pagesManagerToken = await getCachedCoreToken('pagesManager');

    const isMaintenance = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_SETTING, {
  jwt: settingsManagerToken,
  moduleName: 'settingsManager',
  moduleType: 'core',
  key: 'MAINTENANCE_MODE'
}).then(value => {
  const str = String(value).trim().toLowerCase();
  return str === 'true' || str === '1';
}, err => {
  throw err;
}).catch(() => false);

    const maintenancePageId = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_SETTING, {
          jwt: settingsManagerToken,
          moduleName: 'settingsManager',
          moduleType: 'core',
          key: 'MAINTENANCE_PAGE_ID'
        }).then(value => value || null).catch(() => null);

    let maintenanceSlug = 'coming-soon';
    if (maintenancePageId) {
      try {
        const page = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_PAGE_BY_ID, {
              jwt: pagesManagerToken,
              moduleName: 'pagesManager',
              moduleType: 'core',
              pageId: maintenancePageId
            });
        if (page?.slug) maintenanceSlug = page.slug;
      } catch {}
    }

    if (isMaintenance) {
      const targetPath = `/${maintenanceSlug}`;
      if (req.path !== targetPath) {
        return res.redirect(targetPath);
      }
    }

    next();
  };
}

module.exports = {
  MAINTENANCE_ALLOWED_PREFIXES,
  createMaintenanceMiddleware
};
