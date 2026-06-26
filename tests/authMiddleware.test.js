const { _internals } = require('../mother/modules/auth/authMiddleware');

describe('authMiddleware local development helpers', () => {
  test('recognizes loopback address formats used by local browsers', () => {
    expect(_internals.isLoopbackAddress('127.0.0.1')).toBe(true);
    expect(_internals.isLoopbackAddress('127.12.0.8')).toBe(true);
    expect(_internals.isLoopbackAddress('::1')).toBe(true);
    expect(_internals.isLoopbackAddress('::ffff:127.0.0.1')).toBe(true);
    expect(_internals.isLoopbackAddress('::ffff:7f00:1')).toBe(true);
    expect(_internals.isLoopbackAddress('localhost')).toBe(true);
  });

  test('keeps non-local requests out of dev autologin', () => {
    expect(_internals.isLoopbackAddress('192.168.1.10')).toBe(false);
    expect(_internals.isLoopbackAddress('example.com')).toBe(false);
    expect(_internals.isLocalDevRequest({
      ip: '203.0.113.5',
      hostname: 'example.com',
      socket: { remoteAddress: '203.0.113.5' },
    })).toBe(false);
  });

  test('accepts local requests when any request address is loopback', () => {
    expect(_internals.isLocalDevRequest({
      ip: '203.0.113.5',
      hostname: 'localhost',
      socket: { remoteAddress: '::ffff:7f00:1' },
    })).toBe(true);
  });
});
