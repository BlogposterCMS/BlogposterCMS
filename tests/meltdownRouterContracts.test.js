'use strict';

const assert = require('assert');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const EventEmitter = require('events');
const express = require('express');
const { createMeltdownRouter } = require('../mother/server/http/meltdownRouter');
const { EVENT_CONTRACT_ERROR_CODES } = require('../mother/contracts/eventContract');

async function startServer(emitter = new EventEmitter(), overrides = {}) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(createMeltdownRouter({
    motherEmitter: emitter,
    validateAdminToken: overrides.validateAdminToken || (async token => {
      if (token !== 'admin-token') throw new Error('Invalid token');
      return { userId: 'admin-1', permissions: { '*': true } };
    }),
    isHttpAdminPrincipal: overrides.isHttpAdminPrincipal || (decoded => Boolean(decoded?.userId)),
    isProduction: false
  }));

  const server = await new Promise(resolve => {
    const started = app.listen(0, () => resolve(started));
  });
  return {
    server,
    baseUrl: `http://localhost:${server.address().port}`
  };
}

test('meltdown HTTP adapter returns schema failures with stable codes and status', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await axios.post(`${baseUrl}/api/meltdown`, {
      eventName: 'issuePublicToken',
      payload: { purpose: 'test' }
    }).catch(error => error.response);

    assert.strictEqual(response.status, 400);
    assert.strictEqual(response.data.code, EVENT_CONTRACT_ERROR_CODES.INVALID_PAYLOAD);
    assert.match(response.data.error, /invalid payload/);
    assert.strictEqual(response.data.details.path, '$.moduleName');
  } finally {
    server.close();
  }
});

test('meltdown HTTP adapter reports missing contract listeners as service results', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const response = await axios.post(`${baseUrl}/api/meltdown`, {
      eventName: 'issuePublicToken',
      payload: { moduleName: 'auth', purpose: 'test' }
    }).catch(error => error.response);

    assert.strictEqual(response.status, 404);
    assert.strictEqual(response.data.code, EVENT_CONTRACT_ERROR_CODES.NOT_REGISTERED);
    assert.match(response.data.error, /not registered/);
  } finally {
    server.close();
  }
});

test('meltdown HTTP adapter preserves explicit handler code and status', async () => {
  const emitter = new EventEmitter();
  emitter.on('issuePublicToken', (_payload, callback) => {
    const error = new Error('Token issuance is temporarily locked.');
    error.code = 'AUTH_PUBLIC_TOKEN_LOCKED';
    error.status = 409;
    callback(error);
  });

  const { server, baseUrl } = await startServer(emitter);
  try {
    const response = await axios.post(`${baseUrl}/api/meltdown`, {
      eventName: 'issuePublicToken',
      payload: { moduleName: 'auth', purpose: 'test' }
    }).catch(error => error.response);

    assert.strictEqual(response.status, 409);
    assert.deepStrictEqual(response.data, {
      error: 'Token issuance is temporarily locked.',
      code: 'AUTH_PUBLIC_TOKEN_LOCKED'
    });
  } finally {
    server.close();
  }
});

test('meltdown HTTP adapter codes authentication and policy failures before dispatch', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const missingAuth = await axios.post(`${baseUrl}/api/meltdown`, {
      eventName: 'cmsAdminApiRequest',
      payload: { moduleName: 'runtimeManager', moduleType: 'core', resource: 'pages', action: 'list' }
    }).catch(error => error.response);
    assert.strictEqual(missingAuth.status, 401);
    assert.strictEqual(missingAuth.data.code, EVENT_CONTRACT_ERROR_CODES.HTTP_AUTH_REQUIRED);
    assert.strictEqual(missingAuth.data.error, 'Authentication required: missing JWT.');

    const rejected = await axios.post(`${baseUrl}/api/meltdown`, {
      eventName: 'dbSelect',
      payload: { moduleName: 'databaseManager' }
    }).catch(error => error.response);
    assert.strictEqual(rejected.status, 403);
    assert.strictEqual(rejected.data.code, EVENT_CONTRACT_ERROR_CODES.HTTP_EVENT_REJECTED);

    const invalidToken = await axios.post(`${baseUrl}/api/meltdown`, {
      eventName: 'cmsAdminApiRequest',
      payload: { moduleName: 'runtimeManager', moduleType: 'core', resource: 'pages', action: 'list' }
    }, { headers: { 'X-Public-Token': 'bad-token' } }).catch(error => error.response);
    assert.strictEqual(invalidToken.status, 401);
    assert.strictEqual(invalidToken.data.code, EVENT_CONTRACT_ERROR_CODES.HTTP_TOKEN_INVALID);
  } finally {
    server.close();
  }
});

test('meltdown HTTP adapter codes a valid non-admin principal before dispatch', async () => {
  const { server, baseUrl } = await startServer(new EventEmitter(), {
    validateAdminToken: async () => ({ userId: 'member-1', permissions: {} }),
    isHttpAdminPrincipal: () => false
  });
  try {
    const response = await axios.post(`${baseUrl}/api/meltdown`, {
      eventName: 'cmsAdminApiRequest',
      payload: { moduleName: 'runtimeManager', moduleType: 'core', resource: 'pages', action: 'list' }
    }, { headers: { 'X-Public-Token': 'member-token' } }).catch(error => error.response);

    assert.strictEqual(response.status, 403);
    assert.strictEqual(response.data.code, EVENT_CONTRACT_ERROR_CODES.HTTP_ADMIN_REQUIRED);
  } finally {
    server.close();
  }
});

test('meltdown batch adapter returns stable item and envelope error codes', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const invalidBatch = await axios.post(`${baseUrl}/api/meltdown/batch`, { events: null })
      .catch(error => error.response);
    assert.strictEqual(invalidBatch.status, 400);
    assert.strictEqual(invalidBatch.data.code, EVENT_CONTRACT_ERROR_CODES.HTTP_BATCH_INVALID);

    const response = await axios.post(`${baseUrl}/api/meltdown/batch`, {
      events: [
        {},
        { eventName: 'cmsAdminApiRequest', payload: { moduleName: 'runtimeManager' } },
        { eventName: 'dbSelect', payload: { moduleName: 'databaseManager' } }
      ]
    });
    assert.strictEqual(response.data.results[0].code, EVENT_CONTRACT_ERROR_CODES.HTTP_EVENT_NAME_REQUIRED);
    assert.strictEqual(response.data.results[1].code, EVENT_CONTRACT_ERROR_CODES.HTTP_AUTH_REQUIRED);
    assert.strictEqual(response.data.results[2].code, EVENT_CONTRACT_ERROR_CODES.HTTP_EVENT_REJECTED);
  } finally {
    server.close();
  }
});
