'use strict';

// Host-only adapter. The CMS gets a Unix socket, never the Docker socket or shell.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const ACTIVE = new Set(['checking', 'installing', 'downloading', 'cancelling', 'backing_up', 'restarting', 'verifying', 'rolling_back']);
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

function createUpdateAgent({ stateDir, updater, config, spawnImpl = spawn, signalImpl = (pid, signal) => process.kill(-pid, signal), now = () => new Date().toISOString() }) {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const statePath = path.join(stateDir, 'agent-state.json');
  let state = { configured: true, phase: 'idle', candidate: null, jobId: null, errorCode: null };
  if (fs.existsSync(statePath)) state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  // Never replay a privileged operation after daemon/process interruption.
  if (ACTIVE.has(state.phase)) {
    const safe = state.controlProtocol === 1 && state.commitGranted === false && state.target;
    state = { ...state, phase: safe ? 'paused' : 'recovery_failed', canCancel: false, errorCode: 'CORE_UPDATE_AGENT_INTERRUPTED' };
  }
  let busy = false;
  let cancelRunning = null;
  function save(patch) {
    state = { ...state, ...patch, updatedAt: now() };
    const temp = `${statePath}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temp, statePath);
  }
  save({ capabilities: { cancelDownload: true } });

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
    const progress = operation === 'install' && state.target?.image === target.image && state.target?.version === target.version ? state.progress : null;
    save({ jobId, phase: operation === 'check' ? 'checking' : 'installing', errorCode: null, target: target || null,
      progress, controlProtocol: 1, commitGranted: false, canCancel: operation === 'install' });
    const args = [operation === 'check' ? 'check' : 'apply', '--config', config];
    if (operation === 'install') args.push('--expected-version', target.version, '--expected-image', target.image, '--controlled');
    let child;
    let snapshot = null;
    let lastError = null;
    let finished = false;
    let cancelled = false;
    let killTimer;
    function finish(exitCode) {
      if (finished) return;
      finished = true;
      busy = false;
      cancelRunning = null;
      clearTimeout(killTimer);
      save({ canCancel: false });
      if (cancelled) {
        save({ phase: 'paused', errorCode: null });
      } else if (operation === 'check' && exitCode === 0 && snapshot) {
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
      child = spawnImpl(updater, args, { detached: true, stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: process.env.HOME, LANG: 'C.UTF-8' } });
      // The owned process group contains transport children, never the CMS.
      // The stdin gate below is the authority for entering live data changes.
      const signalOwnedGroup = signal => {
        if (!Number.isInteger(child.pid) || child.pid <= 0) throw updateError('CORE_UPDATE_CANCEL_FAILED');
        try { signalImpl(child.pid, signal); } catch (err) { if (err.code !== 'ESRCH') throw updateError('CORE_UPDATE_CANCEL_FAILED'); }
      };
      cancelRunning = () => {
        if (cancelled) return state;
        if (!state.canCancel || state.commitGranted) throw updateError('CORE_UPDATE_CANCEL_TOO_LATE');
        cancelled = true;
        save({ phase: 'cancelling', canCancel: false });
        // EOF also denies the commit gate if termination races the final chunk.
        child.stdin.end();
        signalOwnedGroup('SIGTERM');
        killTimer = setTimeout(() => {
          if (!finished) {
            try { signalOwnedGroup('SIGKILL'); } catch { save({ errorCode: 'CORE_UPDATE_CANCEL_FAILED' }); }
          }
        }, 5000);
        killTimer.unref?.();
        return state;
      };
      child.stdin.on('error', () => { lastError = 'CORE_UPDATE_CONTROL_FAILED'; });
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
                if (validTarget({ version: value.latestVersion, image: value.image }) && typeof value.available === 'boolean' && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value.currentVersion)) {
                  snapshot = { currentVersion: value.currentVersion, latestVersion: value.latestVersion, image: value.image,
                    available: value.available, releaseNotes: String(value.releaseNotes || '').slice(0, 16000),
                    releaseUrl: `https://github.com/BlogposterCMS/BlogposterCMS/releases/tag/v${value.latestVersion}` };
                }
              } catch { lastError = 'CORE_UPDATE_SNAPSHOT_INVALID'; }
            } else if (code === 'CORE_UPDATE_READY_TO_APPLY' && operation === 'install') {
              if (!cancelled && !state.commitGranted) {
                // Persist BEFORE granting permission, so a crash cannot replay.
                save({ commitGranted: true, canCancel: false, phase: 'backing_up' });
                child.stdin.end('continue\n');
              }
            } else if (code === 'CORE_UPDATE_DOWNLOAD_PROGRESS' && operation === 'install' && !cancelled && !state.commitGranted) {
              try {
                const p = JSON.parse(message);
                if (p.resumable === true && [p.completedBytes, p.totalBytes, p.completedChunks, p.totalChunks].every(Number.isSafeInteger) &&
                    p.totalBytes > 0 && p.totalBytes <= 2147483648 && p.completedBytes >= 0 && p.completedBytes <= p.totalBytes &&
                    p.totalChunks > 0 && p.totalChunks <= 256 && p.completedChunks >= 0 && p.completedChunks <= p.totalChunks) {
                  save({ progress: { completedBytes: p.completedBytes, totalBytes: p.totalBytes, completedChunks: p.completedChunks, totalChunks: p.totalChunks, resumable: true } });
                }
              } catch { lastError = 'CORE_UPDATE_PROGRESS_INVALID'; }
            } else if (PHASES[code] && operation === 'install' && !cancelled) {
              save({ phase: PHASES[code], canCancel: code === 'CORE_UPDATE_DOWNLOADING' && !state.commitGranted });
            }
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
    cancel: input => {
      if (!input || Array.isArray(input) || Object.keys(input).join(',') !== 'jobId' ||
          typeof input.jobId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.jobId)) throw updateError('CORE_UPDATE_CANCEL_INVALID');
      if (input.jobId !== state.jobId) throw updateError('CORE_UPDATE_JOB_CHANGED');
      if (state.phase === 'paused') return state;
      if (!busy || !cancelRunning) throw updateError('CORE_UPDATE_CANCEL_TOO_LATE');
      return cancelRunning();
    }
  };
}

function createControlServer(agent) {
  const server = http.createServer(async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
    try {
      if (req.method === 'GET' && req.url === '/status') return send(200, agent.status());
      if (req.method !== 'POST' || !['/check', '/install', '/cancel'].includes(req.url)) return send(404, { errorCode: 'CORE_UPDATE_ACTION_DENIED' });
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
        if (body.length > 1024) return send(413, { errorCode: 'CORE_UPDATE_REQUEST_TOO_LARGE' });
      }
      const input = JSON.parse(body || '{}');
      if (req.url === '/check' && (Array.isArray(input) || !input || Object.keys(input).length)) throw updateError('CORE_UPDATE_REQUEST_INVALID');
      send(202, req.url === '/check' ? agent.check() : req.url === '/cancel' ? agent.cancel(input) : agent.install(input));
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
  server.listen(socket, () => { fs.chmodSync(socket, 0o660); });
}
module.exports = { createUpdateAgent, createControlServer, validTarget };
