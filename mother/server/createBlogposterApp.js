'use strict';

const express = require('express');
const path = require('path');
const csrfProtection = require('../utils/csrfProtection');
const { createRequestLogMiddleware } = require('../utils/devFileLogger');
const { loginLimiter } = require('../utils/rateLimiters');
const { isProduction, features } = require('../../config/runtime');
const securityConfig = require('../../config/security');
const {
  activeThemeFromEnv,
  createTokenConfig,
  loadPlainSpaceVersion
} = require('./config/environment');
const { createAdminAuthContext } = require('./auth/adminAuth');
const { bootstrapCoreModules } = require('./bootstrap/moduleBootstrap');
const { createInstallationStatusService } = require('./installation/installationStatus');
const { reconcileFirstInstallDone } = require('./lifecycle/firstInstallState');
const { createAdminShellRoutes } = require('./http/adminShellRoutes');
const { mountAgentApiRoutes } = require('./http/agentApiRoutes');
const { createAppManagementRoutes } = require('./http/appManagementRoutes');
const { createAuthRoutes } = require('./http/authRoutes');
const { createInstallRoutes } = require('./http/installRoutes');
const { createMaintenanceMiddleware } = require('./http/maintenanceMiddleware');
const { createMeltdownRouter } = require('./http/meltdownRouter');
const { createPublicPageRoutes } = require('./http/publicPageRoutes');
const { mountSecurityMiddleware } = require('./http/securityMiddleware');
const { mountStaticAssetRoutes } = require('./http/staticAssets');
const {
  escapeHtml,
  injectDevBanner,
  sanitizeSlug
} = require('./utils/text');

async function createBlogposterApp({ rootDir, motherEmitter, devFileLogger }) {
  const app = express();
  const port = process.env.PORT || 3000;
  const installLockPath = path.join(rootDir, 'install.lock');
  const renderMode = features?.renderMode || 'client';
  const activeTheme = activeThemeFromEnv(process.env);
  const plainSpaceVersion = loadPlainSpaceVersion({ rootDir });
  const tokenConfig = createTokenConfig(process.env);

  app.use(createRequestLogMiddleware(devFileLogger));
  if (devFileLogger.enabled) {
    console.log(`[DEV LOGS] Mirroring development logs to ${devFileLogger.dir}`);
  }

  const staticPaths = mountStaticAssetRoutes(app, { rootDir, securityConfig });
  mountSecurityMiddleware(app, { isProduction });

  const { getCachedCoreToken } = await bootstrapCoreModules({
    app,
    rootDir,
    motherEmitter,
    authModuleSecret: tokenConfig.authModuleSecret,
    jwtSecret: tokenConfig.jwtSecret,
    userPasswordSalt: tokenConfig.userPasswordSalt,
    moduleDbSalt: tokenConfig.moduleDbSalt,
    tokenSalts: tokenConfig.tokenSalts,
    jwtExpiryConfig: tokenConfig.jwtExpiryConfig
  });

  const authContext = createAdminAuthContext({
    motherEmitter,
    authModuleSecret: tokenConfig.authModuleSecret,
    isProduction
  });
  const installationStatus = createInstallationStatusService({
    installLockPath,
    motherEmitter
  });

  app.use(createMeltdownRouter({
    motherEmitter,
    validateAdminToken: authContext.validateAdminToken,
    isHttpAdminPrincipal: authContext.isHttpAdminPrincipal,
    isProduction
  }));
  app.use(createAuthRoutes({
    csrfProtection,
    injectDevBanner,
    isDevAutoLoginAllowed: authContext.isDevAutoLoginAllowed,
    isProduction,
    loginLimiter,
    motherEmitter,
    needsInitialSetup: installationStatus.needsInitialSetup,
    publicPath: staticPaths.publicPath,
    validateAdminToken: authContext.validateAdminToken
  }));
  app.use(createAppManagementRoutes({
    csrfProtection,
    motherEmitter,
    validateAdminToken: authContext.validateAdminToken
  }));

  mountAgentApiRoutes(app, {
    csrfProtection,
    loginLimiter,
    motherEmitter,
    validateAdminToken: authContext.validateAdminToken
  });

  app.use(createAdminShellRoutes({
    activeTheme,
    csrfProtection,
    dispatchAppLoaderEvent: authContext.dispatchAppLoaderEvent,
    escapeHtml,
    injectDevBanner,
    isDevAutoLoginAllowed: authContext.isDevAutoLoginAllowed,
    isProduction,
    maybeIssueDevAdminSession: authContext.maybeIssueDevAdminSession,
    motherEmitter,
    needsInitialSetup: installationStatus.needsInitialSetup,
    plainSpaceVersion,
    publicPath: staticPaths.publicPath,
    renderMode,
    rootDir,
    sanitizeSlug,
    securityConfig,
    validateAdminToken: authContext.validateAdminToken
  }));
  app.use(createInstallRoutes({
    csrfProtection,
    getCachedCoreToken,
    getInstallationStatus: installationStatus.getInstallationStatus,
    injectDevBanner,
    isDevAutoLoginAllowed: authContext.isDevAutoLoginAllowed,
    loginLimiter,
    motherEmitter,
    installLockPath,
    publicPath: staticPaths.publicPath
  }));
  app.use(createMaintenanceMiddleware({
    getCachedCoreToken,
    motherEmitter
  }));
  app.use(createPublicPageRoutes({
    activeTheme,
    motherEmitter,
    plainSpaceVersion,
    renderMode,
    rootDir,
    sanitizeSlug
  }));

  await reconcileFirstInstallDone({
    getCachedCoreToken,
    motherEmitter
  });

  return {
    app,
    port
  };
}

module.exports = {
  createBlogposterApp
};
