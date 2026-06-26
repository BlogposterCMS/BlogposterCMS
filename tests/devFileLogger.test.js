const EventEmitter = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  createDevFileLogger,
  createRequestLogMiddleware,
  installDevFileLogger,
  isDevFileLoggerEnabled
} = require('../mother/utils/devFileLogger');

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'blogposter-dev-logs-'));
}

describe('devFileLogger', () => {
  it('is enabled by default in development and disabled in production or tests', () => {
    expect(isDevFileLoggerEnabled({ APP_ENV: 'development' })).toBe(true);
    expect(isDevFileLoggerEnabled({ APP_ENV: 'production' })).toBe(false);
    expect(isDevFileLoggerEnabled({ NODE_ENV: 'test' })).toBe(false);
    expect(isDevFileLoggerEnabled({ APP_ENV: 'production', DEV_FILE_LOGS: 'true' })).toBe(true);
    expect(isDevFileLoggerEnabled({ APP_ENV: 'development', DEV_FILE_LOGS: 'false' })).toBe(false);
  });

  it('mirrors console output into readable server and error logs', () => {
    const rootDir = tempRoot();
    const logMock = jest.fn();
    const warnMock = jest.fn();
    const fakeConsole = {
      log: logMock,
      info: jest.fn(),
      warn: warnMock,
      error: jest.fn(),
      debug: jest.fn()
    };

    const logger = installDevFileLogger({
      rootDir,
      consoleRef: fakeConsole,
      enabled: true,
      force: true
    });

    fakeConsole.log('boot ok', { token: 'secret-token-value-1234567890' });
    fakeConsole.warn('careful', new Error('wrong password'));

    expect(logMock).toHaveBeenCalledWith('boot ok', {
      token: 'secret-token-value-1234567890'
    });
    expect(warnMock).toHaveBeenCalledWith('careful', expect.any(Error));
    expect(fs.existsSync(logger.files.requests)).toBe(true);
    expect(fs.readFileSync(logger.files.server, 'utf8')).toContain('boot ok');
    expect(fs.readFileSync(logger.files.server, 'utf8')).toContain('[REDACTED]');
    expect(fs.readFileSync(logger.files.errors, 'utf8')).toContain('wrong password');
  });

  it('writes one ordered request line after the response finishes', () => {
    const logger = createDevFileLogger({
      rootDir: tempRoot(),
      enabled: true
    });
    const middleware = createRequestLogMiddleware(logger);
    const req = new EventEmitter();
    req.method = 'GET';
    req.originalUrl = '/login?redirectTo=/admin/home';
    req.ip = '127.0.0.1';
    req.headers = { 'user-agent': 'jest' };
    req.get = name => req.headers[String(name).toLowerCase()];
    const res = new EventEmitter();
    res.statusCode = 200;
    const next = jest.fn();

    middleware(req, res, next);
    res.emit('finish');

    expect(next).toHaveBeenCalled();
    const log = fs.readFileSync(logger.files.requests, 'utf8');
    expect(log).toContain('GET /login?redirectTo=/admin/home');
    expect(log).toContain('status=200');
    expect(log).toContain('durationMs=');
  });
});
