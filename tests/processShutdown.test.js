'use strict';

const { fork } = require('child_process');
const http = require('http');
const path = require('path');
const { DEFAULT_SHUTDOWN_TIMEOUT_MS } = require('../mother/server/lifecycle/shutdown');

const fixturePath = path.join(__dirname, 'fixtures', 'shutdown-process.js');

function waitForMessage(child, type, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), timeoutMs);
    const onMessage = message => {
      if (message?.type !== type) return;
      clearTimeout(timer);
      child.off('message', onMessage);
      resolve(message);
    };
    child.on('message', onMessage);
  });
}

function waitForExit(child, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Timed out waiting for child exit'));
    }, timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

function startFixture(scenario) {
  const child = fork(fixturePath, [scenario], {
    silent: true,
    env: { ...process.env, NODE_ENV: 'test' }
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  return { child, output: () => output };
}

function request(port, pathname, timeoutMs = 1000) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      host: '127.0.0.1',
      port,
      path: pathname,
      agent: false,
      headers: { connection: 'close' }
    }, res => {
      res.resume();
      res.once('end', () => resolve(res.statusCode));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('request timeout')));
    req.once('error', reject);
  });
}

function assertSanitized(output) {
  expect(output).not.toContain('SECRET_TOKEN');
  expect(output).not.toContain('fatal-payload-must-not-be-logged');
}

describe('bounded process shutdown', () => {
  jest.setTimeout(10000);

  test('the production fallback exits before the container stop grace period', () => {
    expect(DEFAULT_SHUTDOWN_TIMEOUT_MS).toBe(8000);
  });

  test.each([
    ['fatal-exception', '/fatal-exception', 'UNCAUGHT_EXCEPTION'],
    ['fatal-rejection', '/fatal-rejection', 'UNHANDLED_REJECTION']
  ])('%s closes the HTTP server and exits nonzero', async (scenario, pathname, reason) => {
    const fixture = startFixture(scenario);
    const { port } = await waitForMessage(fixture.child, 'ready');
    await request(port, pathname);
    const result = await waitForExit(fixture.child);

    expect(result).toEqual({ code: 1, signal: null });
    expect(fixture.output()).toContain(`Shutdown requested (${reason})`);
    assertSanitized(fixture.output());
  });

  test('a normal termination signal drains and exits successfully', async () => {
    const fixture = startFixture('graceful');
    const { port } = await waitForMessage(fixture.child, 'ready');
    await expect(request(port, '/')).resolves.toBe(200);
    fixture.child.send('signal');
    const result = await waitForExit(fixture.child);

    expect(result).toEqual({ code: 0, signal: null });
    expect(fixture.output()).toContain('Process exiting with code 0');
  });

  test('a stuck HTTP connection reaches the deadline, refuses new work, and exits nonzero', async () => {
    const fixture = startFixture('stuck-connection');
    const { port } = await waitForMessage(fixture.child, 'ready');
    const heldRequest = http.get({
      host: '127.0.0.1',
      port,
      path: '/hold',
      agent: false,
      headers: { connection: 'close' }
    });
    heldRequest.on('error', () => {});
    await waitForMessage(fixture.child, 'holding');
    fixture.child.send('signal');

    await new Promise(resolve => setTimeout(resolve, 50));
    await expect(request(port, '/')).rejects.toBeDefined();
    const result = await waitForExit(fixture.child);
    heldRequest.destroy();

    expect(result).toEqual({ code: 1, signal: null });
    expect(fixture.output()).toContain('Shutdown deadline exceeded');
  });

  test.each(['stuck-cleanup', 'rejected-cleanup'])(
    '%s cannot hang or report a successful shutdown',
    async scenario => {
      const fixture = startFixture(scenario);
      await waitForMessage(fixture.child, 'ready');
      fixture.child.send('signal');
      const result = await waitForExit(fixture.child);

      expect(result).toEqual({ code: 1, signal: null });
      assertSanitized(fixture.output());
    }
  );

  test('repeated signals stay idempotent and a fatal event escalates the exit code', async () => {
    const fixture = startFixture('repeated-events');
    const { port } = await waitForMessage(fixture.child, 'ready');
    await request(port, '/signal-then-fatal');
    const result = await waitForExit(fixture.child);
    const output = fixture.output();

    expect(result).toEqual({ code: 1, signal: null });
    expect(output.match(/Shutdown requested/g)).toHaveLength(1);
    expect(output).toContain('Shutdown escalated after a fatal process error');
    assertSanitized(output);
  });

  test('a fatal exception before a server is attached still exits nonzero', async () => {
    const fixture = startFixture('before-server');
    const result = await waitForExit(fixture.child);

    expect(result).toEqual({ code: 1, signal: null });
    expect(fixture.output()).toContain('Shutdown requested (UNCAUGHT_EXCEPTION)');
    expect(fixture.output()).not.toContain('ANALYTICS_CLEANUP_RAN');
    assertSanitized(fixture.output());
  });

  test('a rejected on-close cleanup is contained and exits nonzero', async () => {
    const fixture = startFixture('close-cleanup-rejection');
    const { port } = await waitForMessage(fixture.child, 'ready');
    await request(port, '/natural-close');
    const result = await waitForExit(fixture.child);

    expect(result).toEqual({ code: 1, signal: null });
    expect(fixture.output()).toContain('Shutdown requested (SERVER_CLOSE_CLEANUP_FAILURE)');
    assertSanitized(fixture.output());
  });
});
