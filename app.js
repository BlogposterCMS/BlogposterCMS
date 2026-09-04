'use strict';

// Node's built-in parser avoids executing an unverified dependency before the
// production integrity gate. Container-provided environment values keep their
// precedence over an optional local development .env file.
try {
  process.loadEnvFile();
} catch (err) {
  if (err.code !== 'ENOENT') throw err;
}

const path = require('path');
const { verifyRuntimeIntegrity } = require('./mother/security/runtimeIntegrity');

async function startBlogposter() {
  // This gate intentionally runs before loading the event bus or any module.
  // Production cannot turn it off through an environment variable.
  await verifyRuntimeIntegrity({ rootDir: __dirname });

  const { installDevFileLogger } = require('./mother/utils/devFileLogger');
  const { motherEmitter, meltdownForModule } = require('./mother/emitters/motherEmitter');
  const moduleNameFromStack = require('./mother/utils/moduleNameFromStack');
  const {
    ensureRequiredEnv,
    loadSecretsOverrides
  } = require('./mother/server/config/environment');
  const { createBlogposterApp } = require('./mother/server/createBlogposterApp');
  const { attachShutdownHandlers } = require('./mother/server/lifecycle/shutdown');

  function handleGlobalError(err) {
    console.error('[GLOBAL] Unhandled error =>', err);

    const moduleName = moduleNameFromStack(err.stack || '');
    if (moduleName) {
      meltdownForModule(err.message, moduleName, motherEmitter);
    }
  }

  process.on('uncaughtException', handleGlobalError);
  process.on('unhandledRejection', reason => {
    let err;
    if (reason instanceof Error) {
      err = reason;
    } else if (reason && typeof reason === 'object' && reason.stack) {
      err = new Error(String(reason.message || reason.toString()));
      err.stack = reason.stack;
    } else {
      err = new Error(String(reason));
    }
    handleGlobalError(err);
  });

  ensureRequiredEnv(process.env);
  loadSecretsOverrides({ rootDir: __dirname });

  const devFileLogger = installDevFileLogger({ rootDir: path.resolve(__dirname, '..') });
  const { app, closeDevelopmentServices, port } = await createBlogposterApp({
    rootDir: __dirname,
    motherEmitter,
    devFileLogger
  });

  const server = app.listen(port, () => {
    console.log(`[SERVER] BlogPosterCMS is listening on http://localhost:${port}/`);
  });
  server.once('close', closeDevelopmentServices);
  attachShutdownHandlers(server);
}

startBlogposter().catch(err => {
  console.error('[SERVER INIT] Startup failed:', err);
  process.exit(1);
});

module.exports = {
  startBlogposter
};
