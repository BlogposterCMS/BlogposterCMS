const assert = require('assert');
const EventEmitter = require('events');
const agentAccess = require('../mother/modules/agentAccess');

function emitAsync(emitter, eventName, payload) {
  return new Promise(resolve => {
    emitter.emit(eventName, payload, (err, result) => resolve({ err, result }));
  });
}

function adminPayload(extra = {}) {
  return {
    jwt: 'admin-token',
    moduleName: 'agentAccess',
    moduleType: 'core',
    decodedJWT: {
      userId: '42',
      permissions: {
        agent: {
          access: { manage: true },
          control: true
        }
      }
    },
    ...extra
  };
}

function setupEmitter() {
  const emitter = new EventEmitter();
  const issued = [];

  agentAccess.setupAgentAccessEvents(emitter, { authModuleSecret: 'test-auth-secret' });

  emitter.on('issueUserToken', (payload, cb) => {
    issued.push(payload);
    cb(null, 'agent-user-token');
  });

  emitter.on('issueModuleToken', (_payload, cb) => {
    cb(null, 'user-management-token');
  });

  emitter.on('getUserDetailsByUsername', (payload, cb) => {
    cb(null, payload.username === 'missing' ? null : { id: 'dev-user-id', username: payload.username });
  });

  emitter.on('getAllUsers', (_payload, cb) => {
    cb(null, [{ id: 'fallback-user-id', username: 'matteo', role: 'admin' }]);
  });

  return { emitter, issued };
}

function restoreEnv(name, value) {
  if (typeof value === 'undefined') {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

beforeEach(() => {
  agentAccess._internals.resetForTests();
});

test('agent access codes require a scoped manager permission', async () => {
  const { emitter } = setupEmitter();

  const denied = await emitAsync(emitter, 'agentAccess.createCode', adminPayload({
    decodedJWT: {
      userId: '42',
      permissions: {}
    }
  }));

  assert(denied.err);
  assert.match(denied.err.message, /agent\.access\.manage/);

  const allowed = await emitAsync(emitter, 'agentAccess.createCode', adminPayload({
    scope: 'view',
    label: 'codex-local-15min'
  }));

  assert.ifError(allowed.err);
  assert.strictEqual(allowed.result.scope, 'view');
  assert.match(allowed.result.code, /^bp_agent_[a-f0-9]{24}_[A-Za-z0-9_-]+$/);
});

test('agent access exchange is one-time and issues least-privilege user tokens', async () => {
  const { emitter, issued } = setupEmitter();
  const created = await emitAsync(emitter, 'agentAccess.createCode', adminPayload({
    scope: 'control',
    tokenTtlSeconds: 600
  }));

  assert.ifError(created.err);

  const exchanged = await emitAsync(emitter, 'agentAccess.exchangeCode', {
    code: created.result.code
  });

  assert.ifError(exchanged.err);
  assert.strictEqual(exchanged.result.token, 'agent-user-token');
  assert.strictEqual(exchanged.result.tokenType, 'Bearer');
  assert.strictEqual(exchanged.result.scope, 'control');
  assert.strictEqual(issued.length, 1);
  assert.strictEqual(issued[0].role, 'agent');
  assert.deepStrictEqual(issued[0].customRoles, ['agent']);
  assert.deepStrictEqual(issued[0].customPermissions, {
    agent: {
      view: true,
      control: true
    }
  });
  assert.strictEqual(issued[0].userTokenLifetime, '600s');

  const replay = await emitAsync(emitter, 'agentAccess.exchangeCode', {
    code: created.result.code
  });
  assert(replay.err);
  assert.match(replay.err.message, /AGENT_ACCESS_CODE_USED/);
});

test('local dev agent session uses the configured dev user and can be disabled', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAppEnv = process.env.APP_ENV;
  const previousDevAgentLogin = process.env.DEV_AGENT_LOGIN;
  const previousDevUser = process.env.DEV_USER;
  process.env.NODE_ENV = 'development';
  process.env.APP_ENV = 'development';
  delete process.env.DEV_AGENT_LOGIN;
  process.env.DEV_USER = 'admin';

  try {
    const { emitter, issued } = setupEmitter();
    const session = await emitAsync(emitter, 'agentAccess.createDevSession', {
      localRequest: true,
      scope: 'view'
    });

    assert.ifError(session.err);
    assert.strictEqual(session.result.username, 'admin');
    assert.strictEqual(session.result.token, 'agent-user-token');
    assert.deepStrictEqual(issued[0].customPermissions, {
      agent: {
        view: true
      }
    });

    process.env.DEV_AGENT_LOGIN = 'false';
    const disabled = await emitAsync(emitter, 'agentAccess.createDevSession', {
      localRequest: true
    });
    assert(disabled.err);
    assert.match(disabled.err.message, /AGENT_ACCESS_DEV_DISABLED/);
  } finally {
    restoreEnv('NODE_ENV', previousNodeEnv);
    restoreEnv('APP_ENV', previousAppEnv);
    restoreEnv('DEV_AGENT_LOGIN', previousDevAgentLogin);
    restoreEnv('DEV_USER', previousDevUser);
  }
});

test('local dev agent session falls back to an existing local user', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousAppEnv = process.env.APP_ENV;
  const previousDevAgentLogin = process.env.DEV_AGENT_LOGIN;
  const previousDevUser = process.env.DEV_USER;
  process.env.NODE_ENV = 'development';
  process.env.APP_ENV = 'development';
  delete process.env.DEV_AGENT_LOGIN;
  process.env.DEV_USER = 'missing';

  try {
    const { emitter, issued } = setupEmitter();
    const session = await emitAsync(emitter, 'agentAccess.createDevSession', {
      localRequest: true,
      scope: 'control'
    });

    assert.ifError(session.err);
    assert.strictEqual(session.result.username, 'matteo');
    assert.strictEqual(issued[0].userId, 'fallback-user-id');
  } finally {
    restoreEnv('NODE_ENV', previousNodeEnv);
    restoreEnv('APP_ENV', previousAppEnv);
    restoreEnv('DEV_AGENT_LOGIN', previousDevAgentLogin);
    restoreEnv('DEV_USER', previousDevUser);
  }
});
