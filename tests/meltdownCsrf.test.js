'use strict';

jest.mock('../config/security', () => ({ csrf: { cookieName: 'blog_csrf', headerName: 'x-csrf-token', ignoredPaths: [] } }));
const express = require('express');
const cookieParser = require('cookie-parser');
const { EventEmitter } = require('events');
const csrfProtection = require('../mother/utils/csrfProtection');
const { createMeltdownRouter } = require('../mother/server/http/meltdownRouter');

test('single and batch cookie dispatch require valid CSRF; public/header dispatch remains available', async () => {
  const emitter = new EventEmitter();
  const dispatch = jest.fn((_payload, callback) => callback(null, { resource: 'pages', action: 'list', eventName: 'getAllPages', data: [] }));
  emitter.on('cmsAdminApiRequest', dispatch);
  const app = express(); app.use(express.json(), cookieParser());
  app.get('/csrf', csrfProtection, (req, res) => res.json({ token: req.csrfToken() }));
  app.use(createMeltdownRouter({ csrfProtection, motherEmitter: emitter,
    validateAdminToken: async () => ({ isUser: true, userId: 'fixture', permissions: { '*': true } }),
    isHttpAdminPrincipal: principal => principal.isUser, isProduction: false }));
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const event = { eventName: 'cmsAdminApiRequest', payload: { moduleName: 'runtimeManager', moduleType: 'core', resource: 'pages', action: 'list' } };
  try {
    const bootstrap = await fetch(`${base}/csrf`);
    const cookie = bootstrap.headers.get('set-cookie').split(';')[0];
    const { token } = await bootstrap.json();
    for (const [route, body] of [['/api/meltdown', event], ['/api/meltdown/batch', { events: [event] }]]) {
      const request = headers => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
      const cookieHeaders = { Cookie: `${cookie}; admin_jwt=valid` };
      expect((await request(cookieHeaders)).status).toBe(403);
      expect((await request({ ...cookieHeaders, 'x-csrf-token': 'forged' })).status).toBe(403);
      expect(dispatch).not.toHaveBeenCalled();
      expect((await request({ ...cookieHeaders, 'x-csrf-token': token })).status).toBe(200);
      expect((await request({ 'X-Public-Token': 'explicit-header' })).status).toBe(200);
      dispatch.mockClear();
    }
    const publicResponse = await fetch(`${base}/api/meltdown`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName: 'issuePublicToken', payload: { moduleName: 'auth', purpose: 'login' } }) });
    expect(publicResponse.status).not.toBe(403);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
