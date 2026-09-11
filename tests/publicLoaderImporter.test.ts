import * as LR from '../ui/runtime/envelope/loaderRegistry';
import { loadPublicRuntimeLoaders, tryImportPublicLoader } from '../ui/runtime/publicLoaderImporter';
import type { RuntimeEnvelope } from '../ui/runtime/envelope/orchestrator';
import path from 'path';

const mockPagesRegisterLoaders = jest.fn((register: typeof LR.register) => {
  register('mock:pagesManager', jest.fn());
});

const mockMotherWidgetRegisterLoaders = jest.fn((register: typeof LR.register) => {
  register('mock:widgetManager', jest.fn());
});

jest.doMock(path.resolve(__dirname, '../mother/modules/pagesManager/publicLoader.js'), () => ({
  registerLoaders: mockPagesRegisterLoaders
}));

jest.doMock(path.resolve(__dirname, '../mother/modules/widgetManager/publicLoader.js'), () => ({
  registerLoaders: mockMotherWidgetRegisterLoaders
}));

describe('publicLoaderImporter', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('filters unsafe sources and imports each allowed module once', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const envelope = {
      attachments: [
        { source: 'pagesManager' },
        { source: 'pagesManager' },
        { source: '../pagesManager' },
        { source: '/pagesManager' },
        { source: null },
        {}
      ]
    } as RuntimeEnvelope;

    await loadPublicRuntimeLoaders(envelope);

    expect(mockPagesRegisterLoaders).toHaveBeenCalledTimes(1);
    expect(LR.get('mock:pagesManager')).toEqual(expect.any(Function));
    expect(warn).not.toHaveBeenCalled();
  });

  it('loads explicitly allowed core modules directly', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(tryImportPublicLoader('widgetManager')).resolves.toBe(true);

    expect(mockMotherWidgetRegisterLoaders).toHaveBeenCalledTimes(1);
    expect(LR.get('mock:widgetManager')).toEqual(expect.any(Function));
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps community loaders on the allowlisted runtime path and warns when unavailable', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(tryImportPublicLoader('databaseManager')).resolves.toBe(false);

    expect(mockPagesRegisterLoaders).not.toHaveBeenCalled();
    expect(mockMotherWidgetRegisterLoaders).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'No publicLoader found for "databaseManager" in /modules/databaseManager/publicLoader.js'
    );
  });

  it.each(['constructor', 'toString'])('does not treat inherited object key %s as a core loader', async source => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(tryImportPublicLoader(source)).resolves.toBe(false);

    expect(warn).toHaveBeenCalledWith(
      `No publicLoader found for "${source}" in /modules/${source}/publicLoader.js`
    );
  });
});
