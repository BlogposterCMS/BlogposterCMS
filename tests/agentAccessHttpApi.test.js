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
  createAgentAccessPublicRouter
} = require('../mother/modules/agentAccess/httpApi');
const { createAgentApiRouter } = require('../mother/modules/agentManager/httpApi');

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
