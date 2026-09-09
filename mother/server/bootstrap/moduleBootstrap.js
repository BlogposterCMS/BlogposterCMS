'use strict';

const { BACKEND_EVENTS } = require('../../contracts/generatedBackendEventCatalog');

const { requestBackendEvent } = require('../../contracts/backendEventContracts');

const path = require('path');
const { abortConfigError } = require('../config/environment');
const { coreModulesForApp } = require('./coreModules');
const { createCoreModuleLifecycle } = require('./coreModuleLifecycle');
const { loadCoreModuleCode } = require('./coreModuleCode');
const { createCoreModuleStore } = require('../../modules/updater/coreModuleStore');
const { createCoreModuleUpdates } = require('../../modules/updater/coreModuleUpdates');
const { MODULE_POLICY } = require('../../modules/updater/coreModulePackages');
const { compareVersions } = require('../../modules/moduleLoader/moduleUpdateService');

function createCoreModuleTokenFactory({ motherEmitter, authModuleSecret }) {
  return function getCoreModuleToken(moduleName) {
    return requestBackendEvent(motherEmitter, BACKEND_EVENTS.ISSUE_MODULE_TOKEN, {
          skipJWT: true,
          authModuleSecret,
          moduleType: 'core',
          moduleName: 'auth',
          trustLevel: 'high',
          signAsModule: moduleName
        });
  };
}

async function verifyProductionCredentials({ motherEmitter, authModuleSecret }) {
  if (process.env.NODE_ENV !== 'production') return;

  try {
    const umToken = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.ISSUE_MODULE_TOKEN, {
          skipJWT: true,
          authModuleSecret,
          moduleType: 'core',
          moduleName: 'auth',
          signAsModule: 'userManagement',
          trustLevel: 'high'
        });
    const users = await requestBackendEvent(motherEmitter, BACKEND_EVENTS.GET_ALL_USERS, { jwt: umToken, moduleName: 'userManagement', moduleType: 'core' }).then(data => data || []);
    const weak = users.filter(user => (
      user.username === 'admin' || !user.password || user.password.length < 60
    ));
    if (weak.length) {
      abortConfigError(
        'Weak credentials detected for production.',
        'Remove default admin user and ensure all passwords are at least 12 characters.'
      );
    }
  } catch (err) {
    abortConfigError('Failed to verify user credentials: ' + err.message);
  }
}

async function bootstrapCoreModules({
  app,
  rootDir,
  motherEmitter,
  authModuleSecret,
  jwtSecret,
  userPasswordSalt,
  moduleDbSalt,
  tokenSalts,
  jwtExpiryConfig
}) {
  const coreModuleLifecycle = createCoreModuleLifecycle(motherEmitter);
  app.locals = app.locals || {};
  app.locals.coreModuleLifecycle = coreModuleLifecycle;
  const moduleStore = createCoreModuleStore({ rootDir });
  const coreModuleUpdates = createCoreModuleUpdates({ rootDir, lifecycle: coreModuleLifecycle });
  const hostVersion = require(path.join(rootDir, 'package.json')).version;

  function selectedModule(moduleName, modulePath) {
    let generation = null;
    if (Object.prototype.hasOwnProperty.call(MODULE_POLICY, moduleName)) {
      try { generation = moduleStore.active(moduleName); }
      catch (error) {
        if (error.code !== 'CORE_MODULE_HOST_INCOMPATIBLE') throw error;
        console.warn(`[CORE_MODULE_OVERRIDE_HOST_CHANGED] ${moduleName}; using bundled module.`);
      }
      if (generation && compareVersions(generation.manifest.version, hostVersion) <= 0) generation = null;
    }
    const implementation = MODULE_POLICY[moduleName]?.kind === 'widget'
      ? require('./coreBrowserModule')
      : generation
      ? loadCoreModuleCode({ moduleName, moduleDir: generation.moduleDir, canonicalModuleDir: path.join(rootDir, modulePath) })
      : require(path.join(rootDir, modulePath, 'index.js'));
    return { implementation, generation };
  }

  console.log('[SERVER INIT] Loading Auth module...');
  const selectedAuth = selectedModule('auth', 'mother/modules/auth');
  await coreModuleLifecycle.start('auth', selectedAuth.implementation, {
      isCore: true,
      JWT_SECRET: jwtSecret,
      authModuleSecret,
      // Strategies are host-owned and must not capture a retired event facade.
      strategyEmitter: motherEmitter,
      moduleGeneration: { generationId: selectedAuth.generation?.generationId || null, releaseVersion: selectedAuth.generation?.manifest.version || hostVersion },
      userPasswordSalt,
      moduleDbSalt,
      tokenSalts,
      jwtExpiryConfig
    });
  console.log('[SERVER INIT] Auth module loaded.');

  const getCoreModuleToken = createCoreModuleTokenFactory({ motherEmitter, authModuleSecret });
  console.log('[SERVER INIT] Requesting DB-manager token...');
  const dbManagerToken = await getCoreModuleToken('databaseManager');
  const coreTokenCache = new Map([['databaseManager', dbManagerToken]]);

  async function getCachedCoreToken(moduleName) {
    if (!coreTokenCache.has(moduleName)) {
      coreTokenCache.set(moduleName, await getCoreModuleToken(moduleName));
    }
    return coreTokenCache.get(moduleName);
  }
  console.log('[SERVER INIT] dbManagerToken obtained.');

  for (const mod of coreModulesForApp({ app, authModuleSecret })) {
    console.log(`[SERVER INIT] Loading ${mod.name}...`);
    const moduleJwt = await getCachedCoreToken(mod.name);
    const { implementation, generation } = selectedModule(mod.name, mod.path);
    await coreModuleLifecycle.start(mod.name, implementation, {
        isCore: true,
        jwt: moduleJwt,
        jwtToken: moduleJwt,
        moduleDbSalt,
        moduleGeneration: { generationId: generation?.generationId || null, releaseVersion: generation?.manifest.version || hostVersion },
        browserDirectory: generation?.moduleDir,
        ...(mod.name === 'updater' ? { coreModuleUpdates } : {}),
        ...(mod.name === 'fontsManager' ? { strategyEmitter: motherEmitter } : {}),
        ...mod.extra
      });
    console.log(`[SERVER INIT] ${mod.name} loaded.`);
  }

  for (const [moduleName, policy] of Object.entries(MODULE_POLICY)) {
    if (policy.kind !== 'widget') continue;
    const { implementation, generation } = selectedModule(moduleName);
    await coreModuleLifecycle.start(moduleName, implementation, {
      moduleGeneration: { generationId: generation?.generationId || null, releaseVersion: generation?.manifest.version || hostVersion },
      browserDirectory: generation?.moduleDir
    });
  }

  try {
    console.log('[SERVER INIT] Loading optional moduleLoader...');
    const loader = require(path.join(rootDir, 'mother', 'modules', 'moduleLoader', 'index.js'));
    await loader.loadAllModules({
      emitter: motherEmitter,
      app,
      jwt: await getCachedCoreToken('moduleLoader')
    });
    console.log('[SERVER INIT] moduleLoader done.');
  } catch (err) {
    console.error('[SERVER INIT] moduleLoader fizzled ->', err.message);
  }

  await verifyProductionCredentials({ motherEmitter, authModuleSecret });

  return {
    coreModuleLifecycle,
    getCachedCoreToken,
    getCoreModuleToken
  };
}

module.exports = {
  bootstrapCoreModules,
  createCoreModuleTokenFactory,
  verifyProductionCredentials
};
