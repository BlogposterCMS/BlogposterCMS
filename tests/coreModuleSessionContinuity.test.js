'use strict';

const express = require('express');
const cookieParser = require('cookie-parser');
const { EventEmitter } = require('events');
const { createMeltdownRouter } = require('../mother/server/http/meltdownRouter');
const { createAdminShellRoutes } = require('../mother/server/http/adminShellRoutes');
const { createAuthRoutes } = require('../mother/server/http/authRoutes');
const { createAppManagementRoutes } = require('../mother/server/http/appManagementRoutes');
const { lifecycleError } = require('../mother/server/bootstrap/coreModuleScope');

let server, base, validateAdminToken, needsInitialSetup;
beforeEach(async () => {
  const emitter = new EventEmitter();
  emitter.on('cmsAdminApiRequest', (_payload, callback) => callback(null, {resource:'pages',action:'list',eventName:'getAllPages',data:[]}));
  validateAdminToken = jest.fn(async () => { throw lifecycleError('CORE_MODULE_UPDATING', 'userManagement'); });
  needsInitialSetup = jest.fn(async () => false);
  const options = { motherEmitter: emitter, validateAdminToken, isProduction: false,
    isHttpAdminPrincipal: value => Boolean(value?.isUser),
    csrfProtection: (_req, _res, next) => next(), loginLimiter: (_req, _res, next) => next(),
    needsInitialSetup, maybeIssueDevAdminSession: async () => null };
  const app = express();
  app.use(express.json(), cookieParser());
  app.use(createMeltdownRouter(options), createAuthRoutes(options), createAppManagementRoutes(options), createAdminShellRoutes(options));
  server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
afterEach(async () => { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); });

test.each(['/admin/home', '/admin/app/designer', '/admin/settings/general', '/admin/login'])('%s keeps its session during a module pause', async route => {
  const response = await fetch(base + route, {headers:{Cookie:'admin_jwt=existing-session'},redirect:'manual'});
  expect(response.status).toBe(503);
  expect(response.headers.get('set-cookie')).toBeNull();
  expect(response.headers.get('retry-after')).toBe('1');
  expect((await response.json()).code).toBe('CORE_MODULE_UPDATING');
});

const event = {eventName:'cmsAdminApiRequest',payload:{moduleName:'runtimeManager',moduleType:'core',resource:'pages',action:'list'}};

test.each(['/admin', '/admin/home', '/admin/login'])('%s preserves availability semantics when installation-status queries pause', async route => {
  needsInitialSetup.mockRejectedValue(lifecycleError('CORE_MODULE_UPDATING', 'userManagement'));
  const response = await fetch(base + route, {headers:{Cookie:'admin_jwt=existing-session'},redirect:'manual'});
  expect(response.status).toBe(503);
  expect(response.headers.get('set-cookie')).toBeNull();
});
const request = body => ({method:'POST',headers:{'Content-Type':'application/json',Cookie:'admin_jwt=existing-session'},body:JSON.stringify(body)});

test('HTTP requests keep the same session through a pause and recover after activation', async () => {
  const paused = await fetch(base + '/api/meltdown', request(event));
  expect(paused.status).toBe(503);
  expect(paused.headers.get('set-cookie')).toBeNull();
  validateAdminToken.mockResolvedValue({isUser:true,userId:'fixture',permissions:{'*':true}});
  expect((await fetch(base + '/api/meltdown', request(event))).status).toBe(200);
});

test('batch items report a retryable pause without disguising it as invalid credentials', async () => {
  const response = await fetch(base + '/api/meltdown/batch', request({events:[event]}));
  expect(response.headers.get('set-cookie')).toBeNull();
  const body = await response.json();
  expect(body.results[0].code).toBe('CORE_MODULE_UPDATING');
});

test('actual invalid credentials still fail closed and clear the bad cookie', async () => {
  validateAdminToken.mockRejectedValue(new Error('Invalid token'));
  const response = await fetch(base + '/api/meltdown', request(event));
  expect(response.status).toBe(401);
  expect(response.headers.get('set-cookie')).toContain('admin_jwt=;');
});

test('admin management requests also distinguish a paused dependency from invalid credentials', async () => {
  const response = await fetch(base + '/admin/api/plainspace/reseed', request({}));
  expect(response.status).toBe(503);
  expect(response.headers.get('set-cookie')).toBeNull();
});
