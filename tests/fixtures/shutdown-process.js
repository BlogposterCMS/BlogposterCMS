'use strict';

const http = require('http');
const { createShutdownController } = require('../../mother/server/lifecycle/shutdown');

const scenario = process.argv[2];
const send = message => process.send?.(message);
const secretError = () => new Error('SECRET_TOKEN=fatal-payload-must-not-be-logged');

const controller = createShutdownController({
  shutdownTimeoutMs: 300,
  analyticsShutdown: () => {
    if (scenario === 'before-server') process.stdout.write('ANALYTICS_CLEANUP_RAN\n');
    if (scenario === 'stuck-cleanup') return new Promise(() => {});
    if (scenario === 'rejected-cleanup') return Promise.reject(secretError());
    return Promise.resolve();
  }
});
controller.installProcessHandlers();

process.on('message', message => {
  if (message === 'signal') process.emit('SIGTERM');
  if (message === 'signal-twice') {
    process.emit('SIGTERM');
    process.emit('SIGTERM');
  }
});

if (scenario === 'before-server') {
  setImmediate(() => {
    throw secretError();
  });
} else {
  const server = http.createServer((req, res) => {
    if (req.url === '/fatal-exception') {
      res.end('crashing');
      setImmediate(() => {
        throw secretError();
      });
      return;
    }
    if (req.url === '/fatal-rejection') {
      res.end('crashing');
      setImmediate(() => Promise.reject(secretError()));
      return;
    }
    if (req.url === '/hold') {
      send({ type: 'holding' });
      return;
    }
    if (req.url === '/signal-then-fatal') {
      res.end('escalating');
      process.emit('SIGTERM');
      process.emit('SIGTERM');
      process.emit('uncaughtException', secretError());
      return;
    }
    if (req.url === '/natural-close') {
      res.end('closing');
      server.close();
      return;
    }
    res.end('ok');
  });

  controller.attachServer(server, {
    onClose: scenario === 'close-cleanup-rejection'
      ? () => Promise.reject(secretError())
      : () => Promise.resolve()
  });
  server.listen(0, '127.0.0.1', () => {
    send({ type: 'ready', port: server.address().port });
  });
}
