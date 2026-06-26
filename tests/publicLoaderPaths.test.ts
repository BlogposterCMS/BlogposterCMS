import { getPublicLoaderPaths, isPublicLoaderSource } from '../ui/runtime/publicLoaderPaths';

describe('public loader paths', () => {
  it('loads community module public loaders from the community module mount', () => {
    expect(getPublicLoaderPaths('designer')).toEqual([
      '/modules/designer/publicLoader.js'
    ]);
  });

  it('loads only explicit core public loaders from the mother module mount', () => {
    expect(getPublicLoaderPaths('pagesManager')).toEqual([
      '/modules/pagesManager/publicLoader.js',
      '/mother/modules/pagesManager/publicLoader.js'
    ]);
    expect(getPublicLoaderPaths('widgetManager')).toEqual([
      '/modules/widgetManager/publicLoader.js',
      '/mother/modules/widgetManager/publicLoader.js'
    ]);
  });

  it('does not synthesize mother module paths for arbitrary core module names', () => {
    expect(getPublicLoaderPaths('databaseManager')).toEqual([
      '/modules/databaseManager/publicLoader.js'
    ]);
    expect(getPublicLoaderPaths('moduleLoader')).toEqual([
      '/modules/moduleLoader/publicLoader.js'
    ]);
  });

  it('rejects unsafe loader source values', () => {
    expect(isPublicLoaderSource('../pagesManager')).toBe(false);
    expect(isPublicLoaderSource('/pagesManager')).toBe(false);
    expect(isPublicLoaderSource('pages.Manager')).toBe(false);
    expect(getPublicLoaderPaths('../pagesManager')).toEqual([]);
    expect(getPublicLoaderPaths(null)).toEqual([]);
  });
});
