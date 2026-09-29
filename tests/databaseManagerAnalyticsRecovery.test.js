const EventEmitter = require('events');

jest.mock('../mother/modules/databaseManager/engines/engineFactory', () => ({ getEngine: jest.fn() }));
jest.mock('../mother/modules/databaseManager/helpers/dbTypeHelpers', () => ({
  moduleHasOwnDb: () => false,
  getDbType: () => 'sqlite'
}));
jest.mock('../mother/emitters/motherEmitter', () => ({
  deactivateModuleRuntime: jest.fn(),
  onceCallback: callback => callback
}));

const previousTimeout = process.env.DB_OP_TIMEOUT_MS;
process.env.DB_OP_TIMEOUT_MS = '10';
const { getEngine } = require('../mother/modules/databaseManager/engines/engineFactory');
const { deactivateModuleRuntime } = require('../mother/emitters/motherEmitter');
const { registerPerformDbOperationEvent } = require('../mother/modules/databaseManager/meltdownBridging/performDbOperationEvent');

afterAll(() => {
  if (previousTimeout === undefined) delete process.env.DB_OP_TIMEOUT_MS;
  else process.env.DB_OP_TIMEOUT_MS = previousTimeout;
});

beforeEach(() => jest.clearAllMocks());

function request(moduleName) {
  const emitter = new EventEmitter();
  emitter._moduleTypes = { [moduleName]: 'core' };
  registerPerformDbOperationEvent(emitter);
  return new Promise(resolve => emitter.emit('performDbOperation', {
    moduleName, operation: 'READ_ANALYTICS', params: []
  }, error => resolve(error)));
}

test.each(['SQLITE_BUSY', 'SQLITE_LOCKED'])('analytics %s remains registered for a later retry', async code => {
  const error = Object.assign(new Error('database is locked'), { code });
  getEngine.mockReturnValue({ performSqliteOperation: jest.fn().mockRejectedValue(error) });

  expect(await request('analyticsManager')).toBe(error);
  expect(deactivateModuleRuntime).not.toHaveBeenCalled();
});

test('fatal analytics storage errors still deactivate the module', async () => {
  const error = Object.assign(new Error('database is corrupt'), { code: 'SQLITE_CORRUPT' });
  getEngine.mockReturnValue({ performSqliteOperation: jest.fn().mockRejectedValue(error) });

  expect(await request('analyticsManager')).toBe(error);
  expect(deactivateModuleRuntime).toHaveBeenCalledTimes(1);
});

test.each([['analyticsManager', false], ['otherCore', true]])('%s timeout reports failure and preserves deactivation policy', async (moduleName, deactivate) => {
  let complete;
  getEngine.mockReturnValue({ performSqliteOperation: jest.fn(() => new Promise(resolve => { complete = resolve; })) });

  const error = await request(moduleName);
  expect(error.message).toContain('Timeout while performing db operation');
  expect(deactivateModuleRuntime).toHaveBeenCalledTimes(deactivate ? 1 : 0);
  complete([]);
});
