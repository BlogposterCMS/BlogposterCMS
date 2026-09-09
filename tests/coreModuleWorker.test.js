'use strict';

const { EventEmitter } = require('events');
const { runModuleWorker } = require('../mother/modules/updater/coreModuleWorker');

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
