'use strict';

const MAINTENANCE_ALLOWED_PREFIXES = [
  '/admin',
  '/assets',
  '/api',
  '/build',
  '/ui',
  '/login',
  '/favicon.ico',
  '/plainspace',
  '/themes',
  '/apps',
  '/widgets',
  '/fonts'
];

function createMaintenanceMiddleware({ getCachedCoreToken, motherEmitter }) {
  return async function maintenanceMiddleware(req, res, next) {
    if (MAINTENANCE_ALLOWED_PREFIXES.some(prefix => req.path.startsWith(prefix))) {
      return next();
    }

    const settingsManagerToken = await getCachedCoreToken('settingsManager');
    const pagesManagerToken = await getCachedCoreToken('pagesManager');

    const isMaintenance = await new Promise((resolve, reject) => {
      motherEmitter.emit(
        'getSetting',
        {
          jwt: settingsManagerToken,
          moduleName: 'settingsManager',
          moduleType: 'core',
          key: 'MAINTENANCE_MODE'
        },
        (err, value) => {
          if (err) return reject(err);
          const str = String(value).trim().toLowerCase();
          resolve(str === 'true' || str === '1');
        }
      );
    }).catch(() => false);

    const maintenancePageId = await new Promise((resolve, reject) => {
      motherEmitter.emit(
        'getSetting',
        {
          jwt: settingsManagerToken,
          moduleName: 'settingsManager',
          moduleType: 'core',
          key: 'MAINTENANCE_PAGE_ID'
        },
        (err, value) => err ? reject(err) : resolve(value || null)
      );
    }).catch(() => null);

    let maintenanceSlug = 'coming-soon';
    if (maintenancePageId) {
      try {
        const page = await new Promise((resolve, reject) => {
          motherEmitter.emit(
            'getPageById',
            {
              jwt: pagesManagerToken,
              moduleName: 'pagesManager',
              moduleType: 'core',
              pageId: maintenancePageId
            },
            (err, result) => err ? reject(err) : resolve(result)
          );
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
