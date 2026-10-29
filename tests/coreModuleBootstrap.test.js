'use strict';

const fs = require('fs');
const path = require('path');

const mockStart = jest.fn(async () => {});
const mockState = jest.fn(() => ({ active: 'a'.repeat(64) }));
const mockWorker = jest.fn();
jest.mock('../mother/server/bootstrap/coreModuleLifecycle', () => ({
  createCoreModuleLifecycle: () => ({ start: mockStart })
}));
jest.mock('../mother/modules/updater/coreModuleStore', () => ({
  createCoreModuleStore: () => ({ state: mockState,
    active: () => { throw new Error('SYNCHRONOUS_BOOTSTRAP_VERIFICATION'); } })
}));
jest.mock('../mother/modules/updater/coreModuleWorker', () => ({
  runModuleWorker: request => mockWorker(request)
}));
jest.mock('../mother/modules/updater/coreModuleUpdates', () => ({ createCoreModuleUpdates: () => ({}) }));
jest.mock('../mother/modules/updater/coreModulePackages', () => ({
  MODULE_POLICY: { auth: {}, databaseManager: {}, 'widget-test': { kind: 'widget' } }
}));
jest.mock('../mother/server/bootstrap/coreModules', () => ({
  coreModulesForApp: () => [{ name: 'databaseManager', path: 'mother/modules/databaseManager', extra: {} }]
}));
jest.mock('../mother/server/bootstrap/coreModuleCode', () => ({ loadCoreModuleCode: () => ({}) }));
jest.mock('../mother/contracts/backendEventContracts', () => ({
  ...jest.requireActual('../mother/contracts/backendEventContracts'),
  requestBackendEvent: async () => 'test-token'
}));
jest.mock('../mother/modules/moduleLoader/index', () => ({ loadAllModules: async () => {} }));
const { bootstrapCoreModules } = require('../mother/server/bootstrap/moduleBootstrap');
const rootDir = path.resolve(__dirname, '..');

beforeEach(() => { jest.clearAllMocks(); });

test('cold-start verification leaves the event loop available before starting each selected generation', async () => {
  const completedIo = [];
  mockWorker.mockImplementation(request => new Promise((resolve, reject) => {
    // A real filesystem callback represents database/worker replies which must
    // continue to run while a selected package is verified outside the main loop.
    fs.readFile(__filename, error => {
      if (error) return reject(error);
      completedIo.push(request.moduleName);
      resolve({ generationId: request.generationId, moduleDir: '/verified', manifest: { version: '99.0.0' } });
    });
  }));
  mockStart.mockImplementation(async name => { expect(completedIo).toContain(name); });
  await bootstrapCoreModules({ app: {}, rootDir, motherEmitter: {} });
  expect(completedIo).toEqual(['auth', 'databaseManager', 'widget-test']);
  expect(mockWorker.mock.calls.map(([request]) => request.operation)).toEqual(['inspect', 'inspect', 'inspect']);
  expect(mockStart.mock.calls.every(([, , options]) => options.moduleGeneration.releaseVersion === '99.0.0')).toBe(true);
});

test('a failed cold-start signature inspection stops startup instead of loading unverified code', async () => {
  const error = Object.assign(new Error('invalid signature'), { code: 'CORE_MODULE_ATTESTATION_FAILED' });
  mockWorker.mockRejectedValue(error);
  await expect(bootstrapCoreModules({ app: {}, rootDir, motherEmitter: {} })).rejects.toBe(error);
  expect(mockStart).not.toHaveBeenCalled();
});
