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
  console.log('[SERVER INIT] Loading Auth module...');
  require(path.join(rootDir, 'mother', 'modules', 'auth', 'index.js'))
    .initialize({
      motherEmitter,
      isCore: true,
      JWT_SECRET: jwtSecret,
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

  const coreModuleLifecycle = createCoreModuleLifecycle(motherEmitter);
  const moduleStore = createCoreModuleStore({ rootDir });
  const coreModuleUpdates = createCoreModuleUpdates({ rootDir, lifecycle: coreModuleLifecycle });
  const hostVersion = require(path.join(rootDir, 'package.json')).version;
  for (const mod of coreModulesForApp({ app, authModuleSecret })) {
    console.log(`[SERVER INIT] Loading ${mod.name}...`);
    const moduleJwt = await getCachedCoreToken(mod.name);
    let generation = null;
    if (Object.prototype.hasOwnProperty.call(MODULE_POLICY, mod.name)) {
      try { generation = moduleStore.active(mod.name); }
      catch (error) {
        // A newly deployed signed host may supersede a valid old override.
        // Invalid signatures or modified code still fail closed at startup.
        if (error.code !== 'CORE_MODULE_HOST_INCOMPATIBLE') throw error;
        console.warn(`[CORE_MODULE_OVERRIDE_HOST_CHANGED] ${mod.name}; using bundled module.`);
      }
      if (generation && compareVersions(generation.manifest.version, hostVersion) <= 0) generation = null;
    }
    const implementation = generation
      ? loadCoreModuleCode({ moduleName: mod.name, moduleDir: generation.moduleDir, canonicalModuleDir: path.join(rootDir, mod.path) })
      : require(path.join(rootDir, mod.path, 'index.js'));
    await coreModuleLifecycle.start(mod.name, implementation, {
        isCore: true,
        jwt: moduleJwt,
        jwtToken: moduleJwt,
        moduleDbSalt,
        moduleGeneration: { generationId: generation?.generationId || null, releaseVersion: generation?.manifest.version || hostVersion },
        ...(mod.name === 'updater' ? { coreModuleUpdates } : {}),
        ...mod.extra
      });
    console.log(`[SERVER INIT] ${mod.name} loaded.`);
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
