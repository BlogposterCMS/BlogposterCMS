const PUBLIC_LOADER_SOURCE_PATTERN = /^[-\w]+$/;
const CORE_PUBLIC_LOADER_MODULES = new Set([
  'designerManager',
  'pagesManager',
  'widgetManager'
]);

export function isPublicLoaderSource(source: unknown): source is string {
  return typeof source === 'string' && PUBLIC_LOADER_SOURCE_PATTERN.test(source);
}

export function getPublicLoaderPaths(source: unknown): string[] {
  if (!isPublicLoaderSource(source)) return [];

  // Core loaders have an explicit mount; probing community paths causes 404s.
  if (CORE_PUBLIC_LOADER_MODULES.has(source)) {
    return [`/mother/modules/${source}/publicLoader.js`];
  }
  return [`/modules/${source}/publicLoader.js`];
}
