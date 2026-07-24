const crypto = require('crypto');
const http = require('http');
const express = require('express');
const {
  createOriginToken,
  verifyOriginToken
} = require('../mother/server/security/originToken');
const { createMaintenanceMiddleware } = require('../mother/server/http/maintenanceMiddleware');
const { createPublicPageRoutes } = require('../mother/server/http/publicPageRoutes');

function request(server, path) {
  return new Promise((resolve, reject) => {
    const address = server.address();
    const req = http.request({
      host: '127.0.0.1',
      port: address.port,
      path,
      method: 'GET'
    }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('Designer Live Preview origin token', () => {
  let securityConfig;

  beforeAll(() => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    securityConfig = {
      postMessage: {
        allowedOrigins: ['http://localhost:3000'],
        originToken: {
          privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
          publicKey: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
          ttlSeconds: 300
        }
      }
    };
  });

  it('verifies signatures, expiry and configured scope', () => {
    const token = createOriginToken(['http://localhost:3000'], securityConfig);
    expect(verifyOriginToken(token, securityConfig)).toMatchObject({ valid: true, code: '' });
    expect(verifyOriginToken(`${token}tampered`, securityConfig)).toMatchObject({
      valid: false,
      code: 'DESIGNER_LIVE_PREVIEW_ORIGIN_TOKEN_SIGNATURE_INVALID'
    });

    const valid = verifyOriginToken(token, securityConfig);
    expect(verifyOriginToken(token, securityConfig, {
      now: valid.payload.expiresAt + 1
    })).toMatchObject({
      valid: false,
      code: 'DESIGNER_LIVE_PREVIEW_ORIGIN_TOKEN_EXPIRED'
    });
  });

  it('removes SAMEORIGIN only for an authorized live preview request', async () => {
    const app = express();
    app.use((req, res, next) => {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      next();
    });
    const motherEmitter = {
      emit(eventName, payload, callback) {
        if (eventName === 'ensurePublicToken') callback(null, 'public-token');
        else callback(null, { id: 'page-1', slug: 'home' });
      }
    };
    app.use(createPublicPageRoutes({
      motherEmitter,
      plainSpaceVersion: 'test',
      renderMode: 'client',
      rootDir: require('path').join(__dirname, '..'),
      sanitizeSlug: value => String(value || '').replace(/[^a-z0-9-]/gi, ''),
      securityConfig
    }));
    const server = app.listen(0);
    try {
      const token = createOriginToken(['http://localhost:3000'], securityConfig);
      const allowed = await request(
        server,
        `/?designer-live-preview=1&originToken=${encodeURIComponent(token)}`
      );
      expect(allowed.status).toBe(200);
      expect(allowed.headers['x-frame-options']).toBeUndefined();
      expect(allowed.headers['cache-control']).toBe('no-store');
      expect(allowed.headers['referrer-policy']).toBe('no-referrer');

      const denied = await request(server, '/?designer-live-preview=1&originToken=invalid');
      expect(denied.status).toBe(403);
      expect(denied.headers['x-frame-options']).toBe('SAMEORIGIN');
      expect(JSON.parse(denied.body).code).toBe('DESIGNER_LIVE_PREVIEW_ORIGIN_TOKEN_MALFORMED');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });

  it('lets a live preview reach token verification while maintenance mode is active', async () => {
    const app = express();
    app.use((req, res, next) => {
      res.setHeader('X-Frame-Options', 'SAMEORIGIN');
      next();
    });
    const motherEmitter = {
      emit(eventName, payload, callback) {
        if (eventName === 'getSetting') {
          callback(null, payload.key === 'MAINTENANCE_MODE' ? 'true' : null);
        } else if (eventName === 'ensurePublicToken') {
          callback(null, 'public-token');
        } else {
          callback(null, { id: 'page-1', slug: 'home' });
        }
      }
    };
    app.use(createMaintenanceMiddleware({
      motherEmitter,
      getCachedCoreToken: async moduleName => `${moduleName}-token`
    }));
    app.use(createPublicPageRoutes({
      motherEmitter,
      plainSpaceVersion: 'test',
      renderMode: 'client',
      rootDir: require('path').join(__dirname, '..'),
      sanitizeSlug: value => String(value || '').replace(/[^a-z0-9-]/gi, ''),
      securityConfig
    }));
    const server = app.listen(0);
    try {
      const token = createOriginToken(['http://localhost:3000'], securityConfig);
      const allowed = await request(
        server,
        `/?designer-live-preview=1&originToken=${encodeURIComponent(token)}`
      );
      expect(allowed.status).toBe(200);
      expect(allowed.headers.location).toBeUndefined();
      expect(allowed.headers['x-frame-options']).toBeUndefined();

      const normalRequest = await request(server, '/');
      expect(normalRequest.status).toBe(302);
      expect(normalRequest.headers.location).toBe('/coming-soon');
    } finally {
      await new Promise(resolve => server.close(resolve));
    }
  });
});
