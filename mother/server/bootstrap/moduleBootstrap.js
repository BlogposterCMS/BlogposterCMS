'use strict';

const path = require('path');
const { abortConfigError } = require('../config/environment');
const { coreModulesForApp } = require('./coreModules');

function createCoreModuleTokenFactory({ motherEmitter, authModuleSecret }) {
  return function getCoreModuleToken(moduleName) {
    return new Promise((resolve, reject) => {
      motherEmitter.emit(
        'issueModuleToken',
        {
          skipJWT: true,
          authModuleSecret,
          moduleType: 'core',
          moduleName: 'auth',
          trustLevel: 'high',
          signAsModule: moduleName
        },
        (err, token) => err ? reject(err) : resolve(token)
      );
    });
  };
}

async function verifyProductionCredentials({ motherEmitter, authModuleSecret }) {
  if (process.env.NODE_ENV !== 'production') return;

  try {
    const umToken = await new Promise((resolve, reject) => {
      motherEmitter.emit(
        'issueModuleToken',
        {
          skipJWT: true,
          authModuleSecret,
          moduleType: 'core',
          moduleName: 'auth',
          signAsModule: 'userManagement',
          trustLevel: 'high'
        },
        (err, token) => (err ? reject(err) : resolve(token))
      );
    });
    const users = await new Promise((resolve, reject) => {
      motherEmitter.emit(
        'getAllUsers',
        { jwt: umToken, moduleName: 'userManagement', moduleType: 'core' },
        (err, data) => (err ? reject(err) : resolve(data || []))
      );
    });
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

  for (const mod of coreModulesForApp({ app, authModuleSecret })) {
    console.log(`[SERVER INIT] Loading ${mod.name}...`);
    const moduleJwt = await getCachedCoreToken(mod.name);
    await require(path.join(rootDir, mod.path, 'index.js'))
      .initialize({
        motherEmitter,
        isCore: true,
        jwt: moduleJwt,
        jwtToken: moduleJwt,
        moduleDbSalt,
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
    getCachedCoreToken,
    getCoreModuleToken
  };
}

module.exports = {
  bootstrapCoreModules,
  createCoreModuleTokenFactory,
  verifyProductionCredentials
};
