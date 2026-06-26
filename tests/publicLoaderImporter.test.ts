import * as LR from '../ui/runtime/envelope/loaderRegistry';
import { loadPublicRuntimeLoaders, tryImportPublicLoader } from '../ui/runtime/publicLoaderImporter';
import type { RuntimeEnvelope } from '../ui/runtime/envelope/orchestrator';

const mockPagesRegisterLoaders = jest.fn((register: typeof LR.register) => {
  register('mock:pagesManager', jest.fn());
});

const mockMotherWidgetRegisterLoaders = jest.fn((register: typeof LR.register) => {
  register('mock:widgetManager', jest.fn());
});

jest.mock('/modules/pagesManager/publicLoader.js', () => ({
  registerLoaders: mockPagesRegisterLoaders
}), { virtual: true });

jest.mock('/mother/modules/widgetManager/publicLoader.js', () => ({
  registerLoaders: mockMotherWidgetRegisterLoaders
}), { virtual: true });

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

  it('falls back to explicitly allowed mother module loaders', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(tryImportPublicLoader('widgetManager')).resolves.toBe(true);

    expect(mockMotherWidgetRegisterLoaders).toHaveBeenCalledTimes(1);
    expect(LR.get('mock:widgetManager')).toEqual(expect.any(Function));
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns when no allowed public loader can be imported', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(tryImportPublicLoader('databaseManager')).resolves.toBe(false);

    expect(warn).toHaveBeenCalledWith(
      'No publicLoader found for "databaseManager" in /modules/databaseManager/publicLoader.js'
    );
  });
});
