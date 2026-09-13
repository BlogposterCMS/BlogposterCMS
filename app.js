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
const { createShutdownController } = require('./mother/server/lifecycle/shutdown');

const shutdownController = createShutdownController();
shutdownController.installProcessHandlers();

async function startBlogposter() {
  // This gate intentionally runs before loading the event bus or any module.
  // Production cannot turn it off through an environment variable.
  await verifyRuntimeIntegrity({ rootDir: __dirname });

  const { installDevFileLogger } = require('./mother/utils/devFileLogger');
  const { motherEmitter } = require('./mother/emitters/motherEmitter');
  const {
    ensureRequiredEnv,
    loadSecretsOverrides
  } = require('./mother/server/config/environment');
  const { createBlogposterApp } = require('./mother/server/createBlogposterApp');
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
  shutdownController.attachServer(server, { onClose: closeDevelopmentServices });
}

startBlogposter().catch(() => {
  shutdownController.requestShutdown('STARTUP_FAILURE', 1);
});

module.exports = {
  startBlogposter
};
