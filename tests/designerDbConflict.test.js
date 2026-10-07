const EventEmitter = require('events');
jest.mock('../mother/modules/databaseManager/engines/engineFactory', () => ({ getEngine: jest.fn() }));
jest.mock('../mother/modules/databaseManager/helpers/dbTypeHelpers', () => ({ moduleHasOwnDb: () => false, getDbType: () => 'sqlite' }));
jest.mock('../mother/emitters/motherEmitter', () => ({
  deactivateModuleRuntime: jest.fn(),
  onceCallback: cb => cb
}));
const { getEngine } = require('../mother/modules/databaseManager/engines/engineFactory');
const { deactivateModuleRuntime } = require('../mother/emitters/motherEmitter');
const { registerPerformDbOperationEvent } = require('../mother/modules/databaseManager/meltdownBridging/performDbOperationEvent');

test.each([
  ['DESIGNER_VERSION_CONFLICT', 'DESIGNER_SAVE_DESIGN', false],
  ['SQLITE_CORRUPT', 'DESIGNER_SAVE_DESIGN', true],
  ['DESIGNER_VERSION_CONFLICT', 'DESIGNER_LIST_DESIGNS', true]
])('DB error %s for %s preserves only expected save conflicts', async (code, operation, deactivate) => {
  jest.clearAllMocks();
  const error = Object.assign(new Error('Version conflict'), { code });
  getEngine.mockReturnValue({ performSqliteOperation: jest.fn().mockRejectedValue(error) });
  const emitter = new EventEmitter();
  emitter._moduleTypes = { designerManager: 'core' };
  registerPerformDbOperationEvent(emitter);
  const result = await new Promise(resolve => emitter.emit('performDbOperation', {
    moduleName: 'designerManager', operation, params: []
  }, err => resolve(err)));
  expect(result).toBe(error);
  expect(deactivateModuleRuntime).toHaveBeenCalledTimes(deactivate ? 1 : 0);
});

test.each([
  ['PAGE_CSS_PATCH_VERSION_CONFLICT', 'PATCH_PAGE_PRESENTATION_CSS', false],
  ['PAGE_CSS_PATCH_TRANSLATION_NOT_FOUND', 'PATCH_PAGE_PRESENTATION_CSS', false],
  ['SQLITE_CORRUPT', 'PATCH_PAGE_PRESENTATION_CSS', true],
  ['PAGE_CSS_PATCH_VERSION_CONFLICT', 'GET_PAGE_BY_ID', true]
])('Pages CSS error %s for %s preserves only expected patch rejections', async (code, operation, deactivate) => {
  jest.clearAllMocks();
  const error = Object.assign(new Error(code), { code });
  getEngine.mockReturnValue({ performSqliteOperation: jest.fn().mockRejectedValue(error) });
  const emitter = new EventEmitter();
  emitter._moduleTypes = { pagesManager: 'core' };
  registerPerformDbOperationEvent(emitter);
  const result = await new Promise(resolve => emitter.emit('performDbOperation', { moduleName: 'pagesManager', operation, params: [] }, err => resolve(err)));
  expect(result).toBe(error);
  expect(deactivateModuleRuntime).toHaveBeenCalledTimes(deactivate ? 1 : 0);
});
