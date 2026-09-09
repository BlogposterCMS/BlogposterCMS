'use strict';

const { EventEmitter } = require('events');
const { runModuleWorker } = require('../mother/modules/updater/coreModuleWorker');

test('Windows staging retries transient file locks without changing activation', async () => {
  const { stageWithRetry } = require('../mother/modules/updater/coreModuleWorker');
  const store = { stage: jest.fn().mockImplementationOnce(() => { throw Object.assign(new Error('locked'), {code:'EPERM'}); }).mockReturnValue({ verified: true }) };
  const wait = jest.fn(async () => {});
  await expect(stageWithRetry(store, 'auth', 'verified-source', {platform:'win32',wait})).resolves.toEqual({verified:true});
  expect(store.stage).toHaveBeenCalledTimes(2);
  expect(wait).toHaveBeenCalledWith(100);
});

test.each(['SIGNATURE_INVALID', 'CORE_MODULE_HOST_INCOMPATIBLE'])('staging never retries %s', async code => {
  const { stageWithRetry } = require('../mother/modules/updater/coreModuleWorker');
  const store = {stage: jest.fn(() => { throw Object.assign(new Error(code), {code}); })};
  await expect(stageWithRetry(store, 'auth', 'verified-source', {platform:'win32'})).rejects.toMatchObject({code});
  expect(store.stage).toHaveBeenCalledTimes(1);
});

test.each(['error', 'exit'])('lost activation worker (%s) requires recovery instead of restoring old handlers', async event => {
  class FakeWorker extends EventEmitter {
    constructor() { super(); queueMicrotask(() => this.emit(event, new Error('worker interrupted'))); }
    terminate() { return Promise.resolve(); }
  }
  await expect(runModuleWorker({ operation: 'activate' }, { WorkerImpl: FakeWorker }))
    .rejects.toMatchObject({ code: 'CORE_MODULE_COMMIT_UNCERTAIN' });
});

test('lost inspection worker cannot imply that a selection was committed', async () => {
  class FakeWorker extends EventEmitter {
    constructor() { super(); queueMicrotask(() => this.emit('exit', 1)); }
    terminate() { return Promise.resolve(); }
  }
  await expect(runModuleWorker({ operation: 'inspect' }, { WorkerImpl: FakeWorker }))
    .rejects.toMatchObject({ code: 'CORE_MODULE_WORKER_EXITED' });
});
