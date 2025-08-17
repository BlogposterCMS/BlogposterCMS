/**
 * mother/modules/notificationManager/integrations/fileLog.js
 *
 * Simple integration that logs notifications to a file. Acts as a safe default
 * so that important events are persisted even without external services.
 */
const fs = require('fs');
const path = require('path');

const ensureDir = p => fs.mkdirSync(path.dirname(p), { recursive: true });

module.exports = {
  integrationName: 'FileLog',
  fields: [
    { name: 'logPath', label: 'Log File Path', required: true }
  ],

  verify: async (config = {}) => {
    const logPath = config.logPath || path.join(__dirname, '..', 'server.log');
    ensureDir(logPath);
    try {
      // Attempt a dummy append to ensure the path is writable
      fs.appendFileSync(logPath, '', 'utf8');
    } catch (err) {
      throw new Error(`Cannot write to logPath: ${err.message}`);
    }
  },

  initialize: async (config = {}) => {
    const logPath = config.logPath || path.join(__dirname, '..', 'server.log');
    ensureDir(logPath);
    return {
      notify: async ({ moduleName = 'unknown', message = '', priority = 'info', timestamp }) => {
        const line = `[${priority.toUpperCase()}] ${timestamp} | Module: ${moduleName} | ${message}\n`;
        try {
          fs.appendFileSync(logPath, line, 'utf8');
        } catch (err) {
          console.error('[FileLog Integration] Failed to write to log =>', err.message);
        }
      }
    };
  }
};
