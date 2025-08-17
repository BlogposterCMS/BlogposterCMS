const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const EventEmitter = require('events');
const https = require('https');
const { PassThrough } = require('stream');

function loadNotificationManager() {
  const base = path.resolve(__dirname, '../mother/modules/notificationManager');
  const code = fs.readFileSync(path.join(base, 'index.js'), 'utf8');

  const notifier = new EventEmitter();
  notifier.notify = function(payload) { this.emit('notify', payload); };

  function customRequire(name) {
    if (name === 'dotenv') return { config: () => {} };
    if (name === '../../emitters/notificationEmitter') return notifier;
    if (name.startsWith('./') || name.startsWith('../')) {
      return require(path.join(base, name));
    }
    return require(name);
  }

  const sandbox = { module: {}, exports: {}, require: customRequire, console };
  vm.runInNewContext(code, sandbox, { filename: 'notificationManager/index.js' });
  sandbox.module.exports._emitter = notifier;
  return sandbox.module.exports;
}

async function testFileLogIntegration() {
  const logPath = path.resolve(__dirname, '../mother/modules/notificationManager/blogposter.log');
  const beforeSize = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;

  const nm = loadNotificationManager();
  const stubEmitter = { on() {}, emit() {} };
  await nm.initialize({ motherEmitter: stubEmitter, app: {}, isCore: true, jwt: 't' });
  nm._emitter.notify({ moduleName: 'test', notificationType: 'system', priority: 'info', message: 'Hello Test', timestamp: new Date().toISOString() });

  await new Promise(r => setTimeout(r, 100));
  const afterSize = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;

  assert(afterSize > beforeSize, 'server.log should grow after notification');
}

test('notification manager writes to log file', async () => {
  await testFileLogIntegration();
});

test('getRecentNotifications returns array', async () => {
  const nm = loadNotificationManager();
  const stubEmitter = { on() {}, emit() {} };
  await nm.initialize({ motherEmitter: stubEmitter, app: {}, isCore: true, jwt: 't' });
  const { getRecentNotifications } = require('../mother/modules/notificationManager/notificationManagerService');
  const list = getRecentNotifications(1);
  assert(Array.isArray(list), 'should return array');
});

test('slack webhook sends message', async () => {
  const slack = require('../mother/modules/notificationManager/integrations/slack-webhook');
  const mock = jest.spyOn(https, 'request').mockImplementation((options, cb) => {
    const res = new PassThrough();
    process.nextTick(() => {
      res.emit('data', 'ok');
      res.emit('end');
    });
    if (cb) cb(res);
    return {
      write() {},
      end() {},
      on() {},
      setTimeout() {},
      destroy() {}
    };
  });
  await slack.verify({ webhookUrl: 'https://hooks.slack.com/services/test' });
  const inst = await slack.initialize({ webhookUrl: 'https://hooks.slack.com/services/test' });
  await inst.notify({ moduleName: 't', message: 'hi', priority: 'info' });
  expect(mock).toHaveBeenCalled();
  mock.mockRestore();
});

test('slack verify rejects non-slack host', async () => {
  const slack = require('../mother/modules/notificationManager/integrations/slack-webhook');
  await expect(slack.verify({ webhookUrl: 'https://example.com/foo' })).rejects.toThrow('hooks.slack.com');
});

