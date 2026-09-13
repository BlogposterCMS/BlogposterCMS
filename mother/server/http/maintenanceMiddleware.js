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
  async function checkMaintenance(req, res, next) {
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

    const isMaintenance = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_SETTING, {
      jwt: settingsManagerToken,
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'MAINTENANCE_MODE'
    }).then(value => {
      const str = String(value).trim().toLowerCase();
      return str === 'true' || str === '1';
    });

    if (!isMaintenance) return next();

    const maintenancePageId = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_SETTING, {
      jwt: settingsManagerToken,
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'MAINTENANCE_PAGE_ID'
    }).then(value => value || null);

    let maintenanceSlug = 'coming-soon';
    if (maintenancePageId) {
      const pagesManagerToken = await getCachedCoreToken('pagesManager');
      const page = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_PAGE_BY_ID, {
        jwt: pagesManagerToken,
        moduleName: 'pagesManager',
        moduleType: 'core',
        pageId: maintenancePageId
      });
      if (page?.slug) maintenanceSlug = page.slug;
    }

    const targetPath = `/${maintenanceSlug}`;
    if (req.path !== targetPath) return res.redirect(targetPath);

    next();
  }

  // Express 4 does not forward rejected middleware promises to its error lane.
  // Never silently bypass configured maintenance when its storage is unavailable.
  return function maintenanceMiddleware(req, res, next) {
    return checkMaintenance(req, res, next).catch(next);
  };
}

module.exports = {
  MAINTENANCE_ALLOWED_PREFIXES,
  createMaintenanceMiddleware
};
