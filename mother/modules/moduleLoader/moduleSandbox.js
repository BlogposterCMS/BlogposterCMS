'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { moduleSeccomp } = require('./moduleSeccomp');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

const MAX_FRAME = 1048576;
function sandboxError(code, message) { return Object.assign(new Error(`[${code}] ${message}`), { code }); }

/** No host root, data, credentials, sockets or writable package mount enters this namespace. */
function sandboxCommand(moduleDir, runner, platform = process.platform) {
  if (platform !== 'linux') throw sandboxError('E_MODULE_SANDBOX_UNAVAILABLE', 'Community modules require Linux with bubblewrap; there is no unsandboxed fallback.');
  for (const file of ['/usr/bin/bwrap', '/usr/bin/prlimit']) {
    if (!fs.existsSync(file)) throw sandboxError('E_MODULE_SANDBOX_UNAVAILABLE', `Required sandbox executable is missing: ${file}`);
  }
  const args = [
    // The mandatory seccomp filter blocks further namespaces. --disable-userns
    // writes /proc/sys, which Docker correctly keeps read-only even for bwrap.
    '--unshare-all', '--unshare-user', '--unshare-cgroup',
    '--die-with-parent', '--new-session', '--cap-drop', 'ALL', '--clearenv', '--seccomp', '3',
    '--ro-bind', fs.realpathSync(process.execPath), '/runtime/node',
    '--ro-bind', fs.realpathSync(runner), '/runtime/runner.js',
    '--ro-bind', fs.realpathSync(moduleDir), '/module',
    // No procfs enters the runner. Node and the moduleHost protocol do not need
    // it; omitting it also preserves Docker's masked/read-only proc protections.
    '--dev', '/dev', '--size', '16777216', '--tmpfs', '/tmp',
    '--chdir', '/module', '--setenv', 'BP_RUNNER_STDIO', '1'
  ];
  // Dynamic linker/runtime libraries only. Never bind /usr, /etc or the CMS tree.
  for (const directory of ['/lib', '/lib64', '/usr/lib']) {
    if (fs.existsSync(directory)) args.push('--ro-bind', fs.realpathSync(directory), directory);
  }
  args.push('--remount-ro', '/', '--', '/runtime/node', '--jitless', '--max-old-space-size=128', '/runtime/runner.js');
  return { command: '/usr/bin/prlimit', args: [
    '--data=536870912', '--nproc=64', '--nofile=64', '--fsize=16777216', '--core=0', '--cpu=3600',
    '--', '/usr/bin/bwrap', ...args
  ] };
}

/** Keep the existing host protocol; bounded stdio replaces Node's inherited IPC descriptor. */
function startSandbox(moduleDir, runner) {
  const spec = sandboxCommand(moduleDir, runner);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-seccomp-'));
  const filter = path.join(temporary, 'filter');
  let descriptor, processHandle;
  try {
    fs.writeFileSync(filter, moduleSeccomp(), { mode: 0o600 });
    descriptor = fs.openSync(filter, 'r');
    processHandle = spawn(spec.command, spec.args, { env: {}, stdio: ['pipe', 'pipe', 'pipe', descriptor] });
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  const channel = new EventEmitter();
  channel.pid = processHandle.pid;
  channel.connected = true;
  channel.killed = false;
  channel.stderr = processHandle.stderr;
  channel.kill = () => { channel.killed = true; return processHandle.kill('SIGKILL'); };
  channel.send = message => {
    const frame = JSON.stringify(message) + '\n';
    if (Buffer.byteLength(frame) > MAX_FRAME || processHandle.stdin.writableLength > MAX_FRAME * 2) {
      throw sandboxError('E_MODULE_RUNNER_MESSAGE_LIMIT', 'Runner message or queue limit exceeded.');
    }
    processHandle.stdin.write(frame);
  };
  let buffer = Buffer.alloc(0), count = 0, windowStart = Date.now();
  processHandle.stdout.on('data', chunk => {
    if (!channel.connected) return;
    buffer = Buffer.concat([buffer, chunk]);
    try {
      let newline;
      while ((newline = buffer.indexOf(10)) >= 0) {
        if (Date.now() - windowStart >= 1000) { count = 0; windowStart = Date.now(); }
        if (++count > 200 || newline > MAX_FRAME) throw sandboxError('E_MODULE_RUNNER_MESSAGE_LIMIT', 'Runner output limit exceeded.');
        const message = JSON.parse(buffer.subarray(0, newline).toString('utf8'));
        buffer = buffer.subarray(newline + 1);
        channel.emit('message', message);
      }
      if (buffer.length > MAX_FRAME) throw sandboxError('E_MODULE_RUNNER_MESSAGE_LIMIT', 'Runner frame limit exceeded.');
    } catch (err) { channel.connected = false; channel.kill(); channel.emit('error', sandboxError('E_MODULE_RUNNER_PROTOCOL', err.message)); }
  });
  processHandle.stdin.on('error', err => channel.emit('error', err));
  processHandle.on('error', err => { channel.connected = false; channel.emit('error', err); });
  // close also follows spawn errors, so host shutdown cannot wait forever on a missing exit event.
  processHandle.on('close', (code, signal) => { channel.connected = false; channel.emit('exit', code, signal); });
  return channel;
}

module.exports = { sandboxCommand, startSandbox, MAX_FRAME };
