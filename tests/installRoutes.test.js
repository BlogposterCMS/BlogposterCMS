const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const axios = require('axios');

const { createInstallRoutes } = require('../mother/server/http/installRoutes');

function startApp(app) {
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function createInstallTestApp({ calls, installLockPath }) {
  const app = express();
  app.use(express.json());

  const motherEmitter = {
    emit(eventName, payload, cb) {
      calls.push({ eventName, payload });
      return cb(null, eventName === 'createUser' ? { id: 1 } : true);
    }
  };

  app.use(createInstallRoutes({
    csrfProtection: (req, _res, next) => {
      req.csrfToken = () => 'test-csrf';
      next();
    },
    getCachedCoreToken: async moduleName => `${moduleName}-token`,
    getInstallationStatus: async () => ({ complete: false, hasPersistentData: false }),
    injectDevBanner: html => html,
    isDevAutoLoginAllowed: async () => false,
    loginLimiter: (_req, _res, next) => next(),
    motherEmitter,
    installLockPath,
    publicPath: path.join(__dirname, '..', 'public')
  }));

  return app;
}

describe('install routes local dev credentials', () => {
  const originalEnv = { ...process.env };
  let tempDir;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'development';
    process.env.APP_ENV = 'development';
    process.env.DEV_AUTOLOGIN = 'true';
    delete process.env.ALLOW_WEAK_CREDS;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'blogposter-install-routes-'));
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('renders install page with local dev weak-credential and dev-user metadata', async () => {
    const app = createInstallTestApp({
      calls: [],
      installLockPath: path.join(tempDir, 'install.lock')
    });
    const server = await startApp(app);
    const client = axios.create({
      baseURL: `http://127.0.0.1:${server.address().port}`,
      proxy: false,
      validateStatus: () => true
    });

    try {
      const response = await client.get('/install');

      expect(response.status).toBe(200);
      expect(response.data).toContain('<meta name="allow-weak-creds" content="true">');
      expect(response.data).toContain('<meta name="dev-autologin" content="true">');
      expect(response.data).toContain('<meta name="dev-user" content="admin">');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  test('accepts admin/123 during local dev setup without explicit ALLOW_WEAK_CREDS', async () => {
    const calls = [];
    const app = createInstallTestApp({
      calls,
      installLockPath: path.join(tempDir, 'install.lock')
    });
    const server = await startApp(app);
    const client = axios.create({
      baseURL: `http://127.0.0.1:${server.address().port}`,
      proxy: false,
      validateStatus: () => true
    });

    try {
      const response = await client.post('/install', {
        username: 'admin',
        email: 'admin@localhost.test',
        password: '123',
        favoriteColor: '#008080'
      });

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ success: true });
      expect(calls.find(call => call.eventName === 'createUser')?.payload).toMatchObject({
        username: 'admin',
        password: '123',
        role: 'admin'
      });
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
