'use strict';

// Finish before the common 10-second container stop grace period reaches SIGKILL.
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 8000;
const SAFE_REASONS = new Set([
  'SIGINT',
  'SIGTERM',
  'STARTUP_FAILURE',
  'UNCAUGHT_EXCEPTION',
  'UNHANDLED_REJECTION',
  'SERVER_CLOSE_CLEANUP_FAILURE'
]);

function createShutdownController(options = {}) {
  const processRef = options.processRef || process;
  const logger = options.logger || console;
  const shutdownTimeoutMs = options.shutdownTimeoutMs || DEFAULT_SHUTDOWN_TIMEOUT_MS;
  const analyticsShutdown = options.analyticsShutdown || (() => (
    require('../../modules/analyticsManager').shutdown()
  ));

  let server = null;
  let serverCloseCleanup = null;
  let serverCloseCleanupPromise = null;
  let shutdownPromise = null;
  let shutdownTimer = null;
  let exitCode = 0;
  let exited = false;
  let handlersAttached = false;

  const handlers = {
    SIGINT: () => requestShutdown('SIGINT', 0),
    SIGTERM: () => requestShutdown('SIGTERM', 0),
    uncaughtException: () => requestShutdown('UNCAUGHT_EXCEPTION', 1),
    unhandledRejection: () => requestShutdown('UNHANDLED_REJECTION', 1)
  };

  function safeWrite(writer, message) {
    try {
      writer?.(message);
    } catch {
      // Logging must never interrupt or recursively re-enter fatal shutdown.
    }
  }

  function safeReason(reason) {
    return SAFE_REASONS.has(reason) ? reason : 'PROCESS_EVENT';
  }

  function detachProcessHandlers() {
    if (!handlersAttached) return;
    handlersAttached = false;
    Object.entries(handlers).forEach(([event, handler]) => {
      processRef.removeListener(event, handler);
    });
  }

  function finish(code, timedOut = false) {
    if (exited) return;
    exited = true;
    if (shutdownTimer) clearTimeout(shutdownTimer);
    detachProcessHandlers();
    if (timedOut) safeWrite(logger?.error?.bind(logger), '[LIFECYCLE] Shutdown deadline exceeded.');
    const exitWriter = code === 0 ? logger?.log?.bind(logger) : logger?.error?.bind(logger);
    safeWrite(exitWriter, `[LIFECYCLE] Process exiting with code ${code}.`);
    processRef.exit(code);
  }

  function markFailure(message) {
    exitCode = 1;
    safeWrite(logger?.error?.bind(logger), message);
  }

  function runServerCloseCleanup() {
    if (!serverCloseCleanup) return Promise.resolve();
    if (!serverCloseCleanupPromise) {
      serverCloseCleanupPromise = Promise.resolve().then(serverCloseCleanup);
    }
    return serverCloseCleanupPromise;
  }

  function closeServer() {
    if (!server) return Promise.resolve();
    return new Promise((resolve, reject) => {
      try {
        server.close(error => {
          if (error) reject(error);
          else resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function runShutdown() {
    try {
      await closeServer();
    } catch {
      markFailure('[LIFECYCLE] HTTP server shutdown failed.');
    }

    // The controller is installed before the integrity gate. Do not load or
    // execute module cleanup until startup has attached a verified server.
    const analyticsCleanup = server
      ? Promise.resolve().then(analyticsShutdown)
      : Promise.resolve();
    const cleanupResults = await Promise.allSettled([
      runServerCloseCleanup(),
      analyticsCleanup
    ]);
    if (cleanupResults[0].status === 'rejected') {
      markFailure('[LIFECYCLE] Server cleanup failed.');
    }
    if (cleanupResults[1].status === 'rejected') {
      markFailure('[LIFECYCLE] Analytics cleanup failed.');
    }
  }

  function requestShutdown(reason, requestedExitCode = 0) {
    if (requestedExitCode !== 0 && exitCode === 0) {
      exitCode = 1;
      if (shutdownPromise) {
        safeWrite(logger?.error?.bind(logger), '[LIFECYCLE] Shutdown escalated after a fatal process error.');
      }
    }
    if (shutdownPromise) return shutdownPromise;

    const shutdownWriter = exitCode === 0 ? logger?.log?.bind(logger) : logger?.error?.bind(logger);
    safeWrite(
      shutdownWriter,
      `[LIFECYCLE] Shutdown requested (${safeReason(reason)}).`
    );
    shutdownTimer = setTimeout(() => finish(1, true), shutdownTimeoutMs);
    shutdownPromise = Promise.resolve()
      .then(runShutdown)
      .then(() => finish(exitCode))
      .catch(() => finish(1));
    return shutdownPromise;
  }

  function attachServer(nextServer, options = {}) {
    server = nextServer;
    serverCloseCleanup = options.onClose || null;
    server.once('close', () => {
      void runServerCloseCleanup().catch(() => {
        if (shutdownPromise) {
          markFailure('[LIFECYCLE] Server cleanup failed.');
        } else {
          requestShutdown('SERVER_CLOSE_CLEANUP_FAILURE', 1);
        }
      });
    });

    // A fatal event can arrive while asynchronous startup is still completing.
    if (shutdownPromise) {
      void closeServer().catch(() => {
        markFailure('[LIFECYCLE] HTTP server shutdown failed.');
      });
    }
  }

  function installProcessHandlers() {
    if (handlersAttached) return detachProcessHandlers;
    handlersAttached = true;
    Object.entries(handlers).forEach(([event, handler]) => {
      processRef.on(event, handler);
    });
    return detachProcessHandlers;
  }

  return {
    attachServer,
    installProcessHandlers,
    requestShutdown
  };
}

module.exports = {
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  createShutdownController
};
