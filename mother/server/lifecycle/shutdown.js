'use strict';

function attachShutdownHandlers(server) {
  const closeServer = signal => {
    console.log(`Shutting down server (${signal})...`);
    server.close(async () => {
      await require('../../modules/analyticsManager').shutdown();
      console.log('Server shutdown complete!');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => closeServer('SIGINT'));
  process.on('SIGTERM', () => closeServer('SIGTERM'));
}

module.exports = {
  attachShutdownHandlers
};
