const {
  AUTH_DEV_AUTOLOGIN_ERRORS,
  canUseDevAutologin,
  isLoopbackAddress,
  resolveDevAutologinUser,
} = require('../mother/modules/auth/devAutoLogin');

describe('devAutoLogin service', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('recognizes browser loopback address formats', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('127.10.0.2')).toBe(true);
    expect(isLoopbackAddress('::1')).toBe(true);
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackAddress('::ffff:7f00:1')).toBe(true);
    expect(isLoopbackAddress('localhost')).toBe(true);
    expect(isLoopbackAddress('203.0.113.4')).toBe(false);
  });

  test('only enables dev autologin for local non-production requests', () => {
    process.env.NODE_ENV = 'development';
    process.env.APP_ENV = 'development';
    process.env.DEV_AUTOLOGIN = 'true';
    process.env.AUTH_MODULE_INTERNAL_SECRET = 'test-secret';

    expect(canUseDevAutologin({
      ip: '203.0.113.4',
      hostname: 'localhost',
      socket: { remoteAddress: '203.0.113.4' },
    })).toBe(true);

    expect(canUseDevAutologin({
      ip: '203.0.113.4',
      hostname: 'example.test',
      socket: { remoteAddress: '203.0.113.4' },
    })).toBe(false);

    process.env.NODE_ENV = 'production';
    expect(canUseDevAutologin({
      ip: '127.0.0.1',
      hostname: 'localhost',
    })).toBe(false);
  });

  test('resolves a dev admin user through the existing auth events', async () => {
    const calls = [];
    const motherEmitter = {
      emit(eventName, payload, cb) {
        calls.push({ eventName, payload });
        if (eventName === 'issueModuleToken') return cb(null, 'module-token');
        if (eventName === 'getUserDetailsByUsername') return cb(null, { id: 7, username: 'devadmin' });
        if (eventName === 'finalizeUserLogin') return cb(null, { id: 7, jwt: 'admin-jwt' });
        return cb(new Error(`unexpected event ${eventName}`));
      }
    };

    const finalUser = await resolveDevAutologinUser({
      motherEmitter,
      authModuleSecret: 'secret',
      devUser: 'devadmin',
    });

    expect(finalUser.jwt).toBe('admin-jwt');
    expect(calls.map(call => call.eventName)).toEqual([
      'issueModuleToken',
      'getUserDetailsByUsername',
      'finalizeUserLogin',
    ]);
    expect(calls[2].payload).toMatchObject({
      moduleName: 'userManagement',
      moduleType: 'core',
      userId: 7,
    });
  });

  test('reports a searchable code when DEV_USER is missing', async () => {
    const motherEmitter = {
      emit(eventName, _payload, cb) {
        if (eventName === 'issueModuleToken') return cb(null, 'module-token');
        if (eventName === 'getUserDetailsByUsername') return cb(null, null);
        return cb(new Error(`unexpected event ${eventName}`));
      }
    };

    await expect(resolveDevAutologinUser({
      motherEmitter,
      authModuleSecret: 'secret',
      devUser: 'missing',
    })).rejects.toMatchObject({
      code: AUTH_DEV_AUTOLOGIN_ERRORS.USER_NOT_FOUND,
    });
  });
});
