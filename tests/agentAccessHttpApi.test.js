const assert = require('assert');
const EventEmitter = require('events');
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const agentAccess = require('../mother/modules/agentAccess');
const agentManager = require('../mother/modules/agentManager');
const {
  createAgentAccessAdminRouter,
  createAgentAccessPublicRouter,
  _internals: agentAccessHttpInternals
} = require('../mother/modules/agentAccess/httpApi');
const {
  createAgentApiRouter,
  _internals: agentManagerHttpInternals
} = require('../mother/modules/agentManager/httpApi');

class TestEmitter extends EventEmitter {
  registerModuleType() {}
}

async function startServer() {
  const emitter = new TestEmitter();
  let issuedAgentTokenPermissions = null;

  agentAccess.setupAgentAccessEvents(emitter, { authModuleSecret: 'test-auth-secret' });
  agentManager.setupAgentManagerEvents(emitter);

  emitter.on('issueUserToken', (payload, cb) => {
    issuedAgentTokenPermissions = payload.customPermissions;
    cb(null, 'agent-bearer-token');
  });
  emitter.on('issueModuleToken', (_payload, cb) => {
    cb(null, 'user-management-token');
  });
  emitter.on('getUserDetailsByUsername', (_payload, cb) => {
    cb(null, { id: 'dev-user-id', username: 'admin' });
  });

  const app = express();
  app.use(bodyParser.json());
  app.use(cookieParser());
  app.use('/admin/api/agent-access', createAgentAccessPublicRouter({ motherEmitter: emitter }));
  app.use('/admin/api/agent-access', createAgentAccessAdminRouter({
    motherEmitter: emitter,
    validateAdminToken: async token => {
      if (token !== 'admin-token') throw new Error('Invalid token');
      return {
        userId: 'admin-user',
        permissions: {
          agent: {
            access: { manage: true },
            control: true
          }
        }
      };
    }
  }));
  app.use('/admin/api/agent', createAgentApiRouter({
    motherEmitter: emitter,
    validateAdminToken: async token => {
      if (token === 'admin-token') {
        return {
          userId: 'admin-user',
          permissions: {
            agent: {
              control: true
            }
          }
        };
      }
      if (token === 'agent-bearer-token') {
        return {
          userId: 'agent-user',
          permissions: issuedAgentTokenPermissions
        };
      }
      throw new Error('Invalid token');
    }
  }));

  const server = await new Promise(resolve => {
    const started = app.listen(0, () => resolve(started));
  });

  return {
    server,
    baseUrl: `http://localhost:${server.address().port}`,
    issuedPermissions: () => issuedAgentTokenPermissions
  };
}

beforeEach(() => {
  agentAccess._internals.resetForTests();
  agentManager._internals.surfaceSnapshots.clear();
  agentManager._internals.surfaceCommands.clear();
  agentManager._internals.activityEvents.length = 0;
});

function restoreEnv(name, value) {
  if (typeof value === 'undefined') {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test('agent HTTP bearer parsing handles long whitespace without changing cookie fallback', () => {
  const whitespace = ' '.repeat(100000);
  const bearerRequest = {
    get: () => `bEaReR${whitespace}admin-token`,
    cookies: { admin_jwt: 'cookie-token' }
  };
  const fallbackRequest = {
    get: () => 'Basic basic-token',
    cookies: { admin_jwt: 'cookie-token' }
  };
  const malformedBearerRequest = {
    get: () => `Bearer${whitespace}admin token`,
    cookies: { admin_jwt: 'cookie-token' }
  };

  assert.strictEqual(agentAccessHttpInternals.extractJwt(bearerRequest), 'admin-token');
  assert.strictEqual(agentManagerHttpInternals.extractJwt(bearerRequest), 'admin-token');
  assert.strictEqual(agentAccessHttpInternals.extractJwt(fallbackRequest), 'cookie-token');
  assert.strictEqual(agentManagerHttpInternals.extractJwt(fallbackRequest), 'cookie-token');
  assert.strictEqual(agentAccessHttpInternals.extractJwt(malformedBearerRequest), 'admin token');
  assert.strictEqual(agentManagerHttpInternals.extractJwt(malformedBearerRequest), 'admin token');
});

test('explicit malformed bearer credentials cannot fall back to a valid admin cookie', async () => {
  const { server, baseUrl } = await startServer();
  const headers = {
    Authorization: 'Bearer admin token',
    Cookie: 'admin_jwt=admin-token'
  };
  try {
    const accessDenied = await axios.get(`${baseUrl}/admin/api/agent-access/codes`, { headers })
      .catch(error => error.response);
    const managerDenied = await axios.get(`${baseUrl}/admin/api/agent/definition`, { headers })
      .catch(error => error.response);
    assert.strictEqual(accessDenied.status, 401);
    assert.strictEqual(managerDenied.status, 401);

    const validBearer = await axios.get(`${baseUrl}/admin/api/agent/definition`, {
      headers: { Authorization: 'Bearer admin-token' }
    });
    const validCookie = await axios.get(`${baseUrl}/admin/api/agent/definition`, {
      headers: { Cookie: 'admin_jwt=admin-token' }
    });
    assert.strictEqual(validBearer.status, 200);
    assert.strictEqual(validCookie.status, 200);
  } finally {
    server.close();
  }
});

test('agent access http flow creates a one-time code and uses the bearer token on AgentManager', async () => {
  const { server, baseUrl, issuedPermissions } = await startServer();
  try {
    const denied = await axios.post(`${baseUrl}/admin/api/agent-access/codes`, {
      label: 'codex-local-15min'
    }).catch(error => error.response);
    assert.strictEqual(denied.status, 401);

    const created = await axios.post(
      `${baseUrl}/admin/api/agent-access/codes`,
      {
        label: 'codex-local-15min',
        scope: 'control',
        ttlSeconds: 900,
        tokenTtlSeconds: 900
      },
      { headers: { Authorization: 'Bearer admin-token' } }
    );
    assert.match(created.data.data.code, /^bp_agent_/);
    assert.strictEqual(created.data.data.status, 'active');

    const exchanged = await axios.post(`${baseUrl}/admin/api/agent-access/exchange`, {
      code: created.data.data.code
    });
    assert.strictEqual(exchanged.data.data.token, 'agent-bearer-token');
    assert.deepStrictEqual(issuedPermissions(), {
      agent: {
        view: true,
        control: true
      }
    });

    const definition = await axios.get(`${baseUrl}/admin/api/agent/definition`, {
      headers: { Authorization: 'Bearer agent-bearer-token' }
    });
    assert.strictEqual(definition.data.data.moduleName, 'agentManager');

    const replay = await axios.post(`${baseUrl}/admin/api/agent-access/exchange`, {
      code: created.data.data.code
    }).catch(error => error.response);
    assert.strictEqual(replay.status, 401);
    assert.strictEqual(replay.data.code, 'AGENT_ACCESS_CODE_USED');
  } finally {
    server.close();
  }
});

test('local dev session endpoint issues an agent token without an admin cookie', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAppEnv = process.env.APP_ENV;
  const previousDevAgentLogin = process.env.DEV_AGENT_LOGIN;
  process.env.NODE_ENV = 'development';
  process.env.APP_ENV = 'development';
  delete process.env.DEV_AGENT_LOGIN;

  const { server, baseUrl } = await startServer();
  try {
    const session = await axios.post(`${baseUrl}/admin/api/agent-access/dev-session`, {
      scope: 'view'
    });
    assert.strictEqual(session.data.data.token, 'agent-bearer-token');
    assert.strictEqual(session.data.data.scope, 'view');
  } finally {
    server.close();
    restoreEnv('NODE_ENV', previousNodeEnv);
    restoreEnv('APP_ENV', previousAppEnv);
    restoreEnv('DEV_AGENT_LOGIN', previousDevAgentLogin);
  }
});
