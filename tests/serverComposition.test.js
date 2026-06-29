const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

function source(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('app.js stays a thin startup composition root', () => {
  const appSource = source('app.js');
  const lineCount = appSource.split(/\r?\n/).length;

  expect(lineCount).toBeLessThanOrEqual(80);
  expect(appSource).toContain("require('dotenv').config()");
  expect(appSource).toContain('createBlogposterApp');
  expect(appSource).toContain('attachShutdownHandlers');
  expect(appSource).not.toContain("require('express')");
  expect(appSource).not.toMatch(/\bapp\.(?:get|post|delete|use)\(/);
  expect(appSource).not.toContain('mother/modules/');
});

test('server composition keeps static, security, bootstrap and route order explicit', () => {
  const composition = source('mother/server/createBlogposterApp.js');
  const orderedMarkers = [
    'mountStaticAssetRoutes(app',
    'mountSecurityMiddleware(app',
    'bootstrapCoreModules({',
    'createMeltdownRouter({',
    'createAuthRoutes({',
    'createAppManagementRoutes({',
    'mountAgentApiRoutes(app',
    'createAdminShellRoutes({',
    'createInstallRoutes({',
    'createMaintenanceMiddleware({',
    'createPublicPageRoutes({',
    'reconcileFirstInstallDone({'
  ];

  const positions = orderedMarkers.map(marker => {
    const index = composition.indexOf(marker);
    expect(index).toBeGreaterThanOrEqual(0);
    return index;
  });

  expect(positions).toEqual([...positions].sort((a, b) => a - b));
});

test('server ownership is split into focused host modules', () => {
  [
    'mother/server/http/staticAssets.js',
    'mother/server/http/securityMiddleware.js',
    'mother/server/http/meltdownRouter.js',
    'mother/server/http/authRoutes.js',
    'mother/server/http/installRoutes.js',
    'mother/server/http/adminShellRoutes.js',
    'mother/server/http/maintenanceMiddleware.js',
    'mother/server/http/publicPageRoutes.js',
    'mother/server/bootstrap/moduleBootstrap.js',
    'mother/server/bootstrap/coreModules.js',
    'mother/server/installation/installationStatus.js'
  ].forEach(relativePath => {
    expect(fs.existsSync(path.join(rootDir, relativePath))).toBe(true);
  });
});
