const PLACEHOLDER_REGISTRY_PATH = '../mother/modules/databaseManager/placeholders/placeholderRegistry';
const NOTIFICATION_EMITTER_PATH = '../mother/emitters/notificationEmitter';

function loadRegistry(initialPlaceholders) {
  const writeFileSync = jest.fn();
  const notify = jest.fn();

  jest.doMock('fs', () => ({
    existsSync: jest.fn(() => true),
    readFileSync: jest.fn(() => JSON.stringify(initialPlaceholders)),
    writeFileSync
  }));
  jest.doMock(NOTIFICATION_EMITTER_PATH, () => ({ notify }));

  let registry;
  jest.isolateModules(() => {
    registry = require(PLACEHOLDER_REGISTRY_PATH);
  });

  return {
    ...registry,
    notify,
    writeFileSync
  };
}

afterEach(() => {
  jest.resetModules();
  jest.dontMock('fs');
  jest.dontMock(NOTIFICATION_EMITTER_PATH);
});

test('identical placeholder registration is idempotent and does not rewrite storage', () => {
  const reference = {
    moduleName: 'designerManager',
    functionName: 'handleSaveDesignPlaceholder'
  };
  const registry = loadRegistry({
    DESIGNER_SAVE_DESIGN: reference
  });
  registry.notify.mockClear();

  const result = registry.registerCustomPlaceholder('DESIGNER_SAVE_DESIGN', reference);

  expect(result).toEqual({
    changed: false,
    placeholderName: 'DESIGNER_SAVE_DESIGN',
    ...reference
  });
  expect(registry.writeFileSync).not.toHaveBeenCalled();
  expect(registry.notify).not.toHaveBeenCalled();
});

test('changed placeholder ownership remains explicit, warned and persisted', () => {
  const registry = loadRegistry({
    EXAMPLE_PLACEHOLDER: {
      moduleName: 'oldModule',
      functionName: 'oldHandler'
    }
  });
  registry.notify.mockClear();

  const result = registry.registerCustomPlaceholder('EXAMPLE_PLACEHOLDER', {
    moduleName: 'newModule',
    functionName: 'newHandler'
  });

  expect(result.changed).toBe(true);
  expect(registry.writeFileSync).toHaveBeenCalledTimes(1);
  expect(registry.notify).toHaveBeenCalledWith(expect.objectContaining({
    priority: 'warning',
    message: expect.stringContaining('[PLACEHOLDER_REGISTRY_REPLACED]')
  }));
});
