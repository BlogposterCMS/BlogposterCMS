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

  const paths = [`/modules/${source}/publicLoader.js`];
  if (CORE_PUBLIC_LOADER_MODULES.has(source)) {
    paths.push(`/mother/modules/${source}/publicLoader.js`);
  }
  return paths;
}
