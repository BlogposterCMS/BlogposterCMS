const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const EventEmitter = require('events');
const { PassThrough } = require('stream');
const { createUpdateAgent, createControlServer } = require('../deploy/update-agent');
const { requestHost } = require('../mother/modules/updater/coreUpdateService');

const image = `ghcr.io/blogpostercms/blogpostercms@sha256:${'a'.repeat(64)}`;
let dir, agent, spawnImpl, children;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-update-test-'));
  children = [];
  spawnImpl = jest.fn(() => {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); children.push(child); return child;
  });
  agent = createUpdateAgent({ stateDir: dir, updater: '/fixed/updater', config: '/fixed/config', spawnImpl });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
function candidate() {
  agent.check();
  children[0].stdout.write(`[CORE_UPDATE_SNAPSHOT] ${JSON.stringify({ currentVersion: '0.9.4', latestVersion: '0.9.5', image, available: true })}\n`);
  children[0].emit('close', 0);
}

test('check accepts only a successful verified snapshot and preserves candidate on failure', () => {
  candidate();
  expect(agent.status().candidate.available).toBe(true);
  agent.check(); children[1].stderr.write('[CORE_UPDATE_ATTESTATION_FAILED] rejected\n'); children[1].emit('close', 1);
  expect(agent.status()).toMatchObject({ phase: 'failed', errorCode: 'CORE_UPDATE_ATTESTATION_FAILED', candidate: { latestVersion: '0.9.5' } });
});

test('a preview installation can inspect the stable release channel', () => {
  agent.check();
  children[0].stdout.write(`[CORE_UPDATE_SNAPSHOT] ${JSON.stringify({ currentVersion: '0.10.0-rc.2', latestVersion: '0.9.5', image, available: false })}\n`);
  children[0].emit('close', 0);
  expect(agent.status()).toMatchObject({ phase: 'current', candidate: { currentVersion: '0.10.0-rc.2', available: false } });
});

test('install binds reviewed version and digest; double click does not spawn twice', () => {
  candidate();
  const first = agent.install({ version: '0.9.5', image });
  expect(agent.install({ version: '0.9.5', image }).jobId).toBe(first.jobId);
  expect(spawnImpl).toHaveBeenCalledTimes(2);
  expect(spawnImpl.mock.calls[1][0]).toBe('/fixed/updater');
  expect(spawnImpl.mock.calls[1][1]).toEqual(['apply', '--config', '/fixed/config', '--expected-version', '0.9.5', '--expected-image', image]);
  expect(spawnImpl.mock.calls[1][2].shell).toBeUndefined();
  children[1].stdout.write('[CORE_UPDATE_RESTARTING] restarting\n');
  expect(agent.status().phase).toBe('restarting');
  children[1].stdout.write('[CORE_UPDATE_APPLIED] healthy\n'); children[1].emit('close', 0);
  expect(agent.status()).toMatchObject({ phase: 'completed', candidate: { currentVersion: '0.9.5', available: false } });
});

test.each([
  { version: '0.9.5; reboot', image }, { version: '0.9.5', image, command: 'sh' },
  { version: '0.9.6', image }, { version: '0.9.5', image: '../../etc' }
])('rejects unreviewed or malicious installation %j', target => {
  candidate(); expect(() => agent.install(target)).toThrow(/CORE_UPDATE_TARGET_/); expect(spawnImpl).toHaveBeenCalledTimes(1);
});

test('rollback completion is not confused with success or recovery failure', () => {
  candidate(); agent.install({ version: '0.9.5', image });
  children[1].stderr.write('[CORE_UPDATE_READINESS_FAILED] unhealthy\n');
  children[1].stdout.write('[CORE_UPDATE_ROLLBACK_STARTED] recovering\n[CORE_UPDATE_ROLLED_BACK] restored\n');
  children[1].emit('close', 1);
  expect(agent.status()).toMatchObject({ phase: 'rolled_back', errorCode: 'CORE_UPDATE_READINESS_FAILED' });
});

test('interrupted host job persists and cannot be silently replayed or reset by check', () => {
  candidate(); agent.install({ version: '0.9.5', image });
  const reopened = createUpdateAgent({ stateDir: dir, updater: '/fixed/updater', config: '/fixed/config', spawnImpl });
  expect(reopened.status()).toMatchObject({ phase: 'recovery_failed', errorCode: 'CORE_UPDATE_AGENT_INTERRUPTED' });
  expect(() => reopened.check()).toThrow('CORE_UPDATE_RECOVERY_REQUIRED');
  expect(() => reopened.install({ version: '0.9.5', image })).toThrow('CORE_UPDATE_RECOVERY_REQUIRED');
});

test('control API denies unknown commands and extra request fields', async () => {
  const server = createControlServer(agent);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const call = (url, body) => new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: url, method: 'POST' }, res => {
      let data = ''; res.on('data', chunk => { data += chunk; }); res.on('end', () => resolve({ status: res.statusCode, ...JSON.parse(data) }));
    }); req.on('error', reject); req.end(JSON.stringify(body));
  });
  try {
    // Exercise the CMS JSON transport against the actual control handler.
    const request = (options, callback) => http.request({ ...options, socketPath: undefined, host: '127.0.0.1', port: server.address().port }, callback);
    expect(await requestHost('status', undefined, { request })).toMatchObject({ configured: true, phase: 'idle' });
    expect(await call('/shell', {})).toMatchObject({ status: 404 });
    expect(await call('/check', { path: '/etc/passwd' })).toMatchObject({ status: 400 });
    expect(await call('/install', { version: '0.9.5', image })).toMatchObject({ errorCode: 'CORE_UPDATE_TARGET_CHANGED' });
    expect(spawnImpl).not.toHaveBeenCalled();
  } finally { await new Promise(resolve => server.close(resolve)); }
});
