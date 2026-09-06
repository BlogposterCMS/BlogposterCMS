'use strict';

// Host-only adapter. The CMS gets a Unix socket, never the Docker socket or shell.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ACTIVE = new Set(['checking', 'installing', 'downloading', 'backing_up', 'restarting', 'verifying', 'rolling_back']);
const PHASES = Object.freeze({
  CORE_UPDATE_DOWNLOADING: 'downloading', CORE_UPDATE_BACKING_UP: 'backing_up',
  CORE_UPDATE_RESTARTING: 'restarting', CORE_UPDATE_VERIFYING: 'verifying',
  CORE_UPDATE_ROLLBACK_STARTED: 'rolling_back', CORE_UPDATE_ROLLED_BACK: 'rolled_back',
  CORE_UPDATE_APPLIED: 'completed', CORE_UPDATE_ROLLBACK_FAILED: 'recovery_failed'
});

function updateError(code) { return Object.assign(new Error(code), { code }); }

function validTarget(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === 'image,version' &&
    /^\d+\.\d+\.\d+$/.test(value.version) && typeof value.image === 'string' &&
    /^[a-z0-9.-]+\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/.test(value.image);
}

function createUpdateAgent({ stateDir, updater, config, spawnImpl = spawn, now = () => new Date().toISOString() }) {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const statePath = path.join(stateDir, 'agent-state.json');
  let state = { configured: true, phase: 'idle', candidate: null, jobId: null, errorCode: null };
  if (fs.existsSync(statePath)) state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  // Never replay a privileged operation after daemon/process interruption.
  if (ACTIVE.has(state.phase)) state = { ...state, phase: 'recovery_failed', errorCode: 'CORE_UPDATE_AGENT_INTERRUPTED' };
  let busy = false;
  function save(patch) {
    state = { ...state, ...patch, updatedAt: now() };
    const temp = `${statePath}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temp, statePath);
  }
  save({});

  function start(operation, target) {
    if (state.phase === 'recovery_failed') throw updateError('CORE_UPDATE_RECOVERY_REQUIRED');
    if (busy) {
      if (operation === 'install' && state.target?.image === target?.image && state.target?.version === target?.version) return state;
      if (operation === 'check') return state;
      throw updateError('CORE_UPDATE_BUSY');
    }
    if (operation === 'install') {
      if (!validTarget(target)) throw updateError('CORE_UPDATE_TARGET_INVALID');
      if (!state.candidate?.available || target.version !== state.candidate.latestVersion || target.image !== state.candidate.image) {
        throw updateError('CORE_UPDATE_TARGET_CHANGED');
      }
    }
    busy = true;
    const jobId = crypto.randomUUID();
    save({ jobId, phase: operation === 'check' ? 'checking' : 'installing', errorCode: null, target: target || null });
    const args = [operation === 'check' ? 'check' : 'apply', '--config', config];
    if (operation === 'install') args.push('--expected-version', target.version, '--expected-image', target.image);
    let child;
    let snapshot = null;
    let lastError = null;
    let finished = false;
    function finish(exitCode) {
      if (finished) return;
      finished = true;
      busy = false;
      if (operation === 'check' && exitCode === 0 && snapshot) {
        save({ phase: snapshot.available ? 'available' : 'current', candidate: snapshot, lastCheckedAt: now(), errorCode: null });
      } else if (operation === 'install' && exitCode === 0 && state.phase === 'completed') {
        save({ candidate: { ...state.candidate, available: false, currentVersion: target.version }, errorCode: null });
      } else {
        const phase = ['rolled_back', 'recovery_failed'].includes(state.phase) ? state.phase : 'failed';
        save({ phase, errorCode: lastError || 'CORE_UPDATE_OPERATION_FAILED' });
      }
    }
    try {
      // Fixed executable and argument vector; no shell, caller paths or environment.
      child = spawnImpl(updater, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8' } });
      function read(stream) {
        let pending = '';
        stream.on('data', data => {
          pending += data.toString();
          if (pending.length > 65536) pending = pending.slice(-65536);
          let newline;
          while ((newline = pending.indexOf('\n')) >= 0) {
            const line = pending.slice(0, newline).trim();
            pending = pending.slice(newline + 1);
            const match = /^\[(CORE_UPDATE_[A-Z_]+)\] (.*)$/.exec(line);
            if (!match) continue;
            const [, code, message] = match;
            if (code === 'CORE_UPDATE_SNAPSHOT' && operation === 'check') {
              try {
                const value = JSON.parse(message);
                if (validTarget({ version: value.latestVersion, image: value.image }) && typeof value.available === 'boolean' && /^\d+\.\d+\.\d+$/.test(value.currentVersion)) {
                  snapshot = { currentVersion: value.currentVersion, latestVersion: value.latestVersion, image: value.image,
                    available: value.available, releaseNotes: String(value.releaseNotes || '').slice(0, 16000),
                    releaseUrl: `https://github.com/BlogposterCMS/BlogposterCMS/releases/tag/v${value.latestVersion}` };
                }
              } catch { lastError = 'CORE_UPDATE_SNAPSHOT_INVALID'; }
            } else if (PHASES[code] && operation === 'install') save({ phase: PHASES[code] });
            if (/(FAILED|DENIED|MISMATCH|MISSING|INVALID|CHANGED|LOCKED|UNKNOWN|OLD)$/.test(code)) lastError = code;
          }
        });
      }
      read(child.stdout); read(child.stderr);
      child.on('error', () => { lastError = 'CORE_UPDATE_AGENT_EXEC_FAILED'; finish(1); });
      child.on('close', finish);
    } catch { lastError = 'CORE_UPDATE_AGENT_EXEC_FAILED'; finish(1); }
    return state;
  }
  return {
    status: () => state,
    check: () => start('check'),
    install: target => start('install', target),
    // A prior interrupted operation must be repaired by the host operator.
    startPeriodicChecks(interval = 6 * 60 * 60 * 1000) {
      const tick = () => { if (!busy && state.phase !== 'recovery_failed') start('check'); };
      const initial = setTimeout(tick, 10000); initial.unref();
      const timer = setInterval(tick, interval); timer.unref();
      return () => { clearTimeout(initial); clearInterval(timer); };
    }
  };
}

function createControlServer(agent) {
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      if (req.method === 'GET' && req.url === '/status') return send(200, agent.status());
      if (req.method !== 'POST' || !['/check', '/install'].includes(req.url)) return send(404, { errorCode: 'CORE_UPDATE_ACTION_DENIED' });
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (body.length > 1024) return send(413, { errorCode: 'CORE_UPDATE_REQUEST_TOO_LARGE' });
      }
      const input = JSON.parse(body || '{}');
      if (req.url === '/check' && (Array.isArray(input) || !input || Object.keys(input).length)) throw updateError('CORE_UPDATE_REQUEST_INVALID');
      send(202, req.url === '/check' ? agent.check() : agent.install(input));
    } catch (err) { send(400, { errorCode: err.code?.startsWith('CORE_UPDATE_') ? err.code : 'CORE_UPDATE_REQUEST_INVALID' }); }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}

if (require.main === module) {
  const socket = '/run/blogposter-updater/control.sock';
  const agent = createUpdateAgent({ stateDir: '/var/lib/blogposter-update-agent', updater: '/opt/blogposter/bin/blogposter-update', config: '/opt/blogposter/updater.conf' });
  if (fs.existsSync(socket)) fs.unlinkSync(socket);
  const server = createControlServer(agent);
  server.listen(socket, () => { fs.chmodSync(socket, 0o660); agent.startPeriodicChecks(); });
}
module.exports = { createUpdateAgent, createControlServer, validTarget };
