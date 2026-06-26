'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const { sanitize } = require('./logSanitizer');

const CONSOLE_METHODS = ['log', 'info', 'warn', 'error', 'debug'];
let installedLogger = null;
let writeFailureReported = false;

function isDevFileLoggerEnabled(env = process.env) {
  if (env.DEV_FILE_LOGS === 'false') return false;
  if (env.DEV_FILE_LOGS === 'true') return true;
  if (env.NODE_ENV === 'test') return false;
  return (env.APP_ENV || env.NODE_ENV || 'development') !== 'production';
}

function timestamp(now = new Date()) {
  return now.toISOString();
}

function sanitizeForLog(value) {
  if (value instanceof Error) {
    return sanitize(value.stack || value.message);
  }
  return sanitize(value);
}

function formatArg(value) {
  const clean = sanitizeForLog(value);
  if (typeof clean === 'string') return clean;
  return util.inspect(clean, {
    colors: false,
    depth: 6,
    breakLength: 120,
    compact: false
  });
}

function formatLogLine(level, args, now = new Date()) {
  const message = args.map(formatArg).join(' ');
  return `[${timestamp(now)}] ${String(level).toUpperCase().padEnd(5)} ${message}\n`;
}

function appendLine(filePath, line, originalConsole) {
  try {
    fs.appendFileSync(filePath, line, 'utf8');
  } catch (err) {
    if (!writeFailureReported) {
      writeFailureReported = true;
      originalConsole.warn('[DEV LOGS] Failed to write log file:', err.message);
    }
  }
}

function createDevFileLogger(options = {}) {
  const env = options.env || process.env;
  const enabled = options.enabled ?? isDevFileLoggerEnabled(env);
  const rootDir = options.rootDir || process.cwd();
  const dir = options.dir || path.join(rootDir, 'logs', 'dev');
  const originalConsole = options.originalConsole || console;
  const files = {
    server: path.join(dir, 'server.log'),
    errors: path.join(dir, 'errors.log'),
    requests: path.join(dir, 'requests.log')
  };

  if (enabled) {
    fs.mkdirSync(dir, { recursive: true });
    Object.values(files).forEach(filePath => {
      fs.closeSync(fs.openSync(filePath, 'a'));
    });
  }

  function write(level, args, now = new Date()) {
    if (!enabled) return;
    const line = formatLogLine(level, args, now);
    appendLine(files.server, line, originalConsole);
    if (level === 'warn' || level === 'error') {
      appendLine(files.errors, line, originalConsole);
    }
  }

  function request(req, res, startedAt = Date.now()) {
    if (!enabled) return;
    const durationMs = Date.now() - startedAt;
    const url = sanitize(req.originalUrl || req.url || '');
    const userAgent = sanitize(req.get?.('user-agent') || req.headers?.['user-agent'] || '');
    const ip = sanitize(req.ip || req.socket?.remoteAddress || '');
    const line = formatLogLine('http', [
      `${req.method || 'GET'} ${url}`,
      `status=${res.statusCode}`,
      `durationMs=${durationMs}`,
      `ip=${ip}`,
      `ua=${userAgent}`
    ]);
    appendLine(files.requests, line, originalConsole);
  }

  return {
    enabled,
    dir,
    files,
    write,
    request
  };
}

function installDevFileLogger(options = {}) {
  if (installedLogger && !options.force) {
    return installedLogger;
  }

  const consoleRef = options.consoleRef || console;
  const originalConsole = {};
  CONSOLE_METHODS.forEach(method => {
    originalConsole[method] = typeof consoleRef[method] === 'function'
      ? consoleRef[method].bind(consoleRef)
      : () => {};
  });

  const logger = createDevFileLogger({
    ...options,
    originalConsole
  });

  if (logger.enabled) {
    // Console output remains unchanged; this only mirrors it into ordered files.
    CONSOLE_METHODS.forEach(method => {
      consoleRef[method] = (...args) => {
        logger.write(method, args);
        originalConsole[method](...args);
      };
    });
  }

  installedLogger = logger;
  return logger;
}

function createRequestLogMiddleware(logger) {
  return function devRequestLogMiddleware(req, res, next) {
    if (!logger?.enabled) return next();
    const startedAt = Date.now();
    // Log after response finalization so status and timing are accurate.
    res.on('finish', () => logger.request(req, res, startedAt));
    return next();
  };
}

module.exports = {
  createDevFileLogger,
  createRequestLogMiddleware,
  formatLogLine,
  installDevFileLogger,
  isDevFileLoggerEnabled
};
