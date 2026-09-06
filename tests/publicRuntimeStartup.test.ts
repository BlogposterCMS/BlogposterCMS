/** @jest-environment jsdom */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const orchestrate = jest.fn();
const loadPublicRuntimeLoaders = jest.fn().mockResolvedValue(undefined);
const refreshColorLibrary = jest.fn();
const refreshFontPackages = jest.fn();
// Exercise the actual startup module with controlled asynchronous dependencies.
// Transpile explicitly because this repository ships sibling browser ESM files.
const source = fs.readFileSync(path.join(__dirname, '../ui/runtime/publicEntry.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const dependencies: Record<string, unknown> = {
  './envelope/orchestrator.js': { orchestrate },
  './publicLoaderImporter.js': { loadPublicRuntimeLoaders },
  './publicBootstrap.js': require('../ui/runtime/publicBootstrap.ts'),
  '../shared/api-client/runtimeFacade.js': require('../ui/shared/api-client/runtimeFacade.ts'),
  '../shared/colors/colorLibrary.js': { configureColorLibraryClient: jest.fn(), refreshColorLibrary },
  '../shared/fonts/fontPackages.js': { configureFontPackagesClient: jest.fn(), refreshFontPackages }
};
const runtimeExports: Record<string, any> = {};
new Function('require', 'exports', code)((name: string) => {
  if (!(name in dependencies)) throw new Error(`Unexpected startup dependency: ${name}`);
  return dependencies[name];
}, runtimeExports);
const { bootPublicRuntime } = runtimeExports;

test('uses the server envelope without rediscovering start page or content', async () => {
  window.history.replaceState({}, '', '/');
  window.PUBLIC_TOKEN = 'public-token';
  const envelope = { attachments: [], meta: { seoTitle: 'Initial' } };
  (window as any).BP_PUBLIC_BOOTSTRAP = { version: 1, slug: 'home', pathname: '/', language: 'en', envelope, layout: null, layoutResolved: true };
  refreshColorLibrary.mockResolvedValue(undefined);
  refreshFontPackages.mockResolvedValue(undefined);
  window.meltdownEmit = jest.fn();
  try {
    await bootPublicRuntime();
    expect(window.meltdownEmit).not.toHaveBeenCalled();
    expect(orchestrate).toHaveBeenCalledWith(envelope, expect.objectContaining({ initialLayoutResolved: true }));
  } finally {
    delete (window as any).BP_PUBLIC_BOOTSTRAP;
    jest.clearAllMocks();
  }
});

test('discovers the page and loads modules while presentation reads are pending', async () => {
  window.history.replaceState({}, '', '/landing');
  window.PUBLIC_TOKEN = 'public-token';
  let colorsReady!: () => void;
  let fontsReady!: () => void;
  refreshColorLibrary.mockImplementation(() => new Promise<void>(resolve => { colorsReady = resolve; }));
  refreshFontPackages.mockImplementation(() => new Promise<void>(resolve => { fontsReady = resolve; }));
  const envelope = { attachments: [], meta: { seoTitle: 'Landing' } };
  window.meltdownEmit = jest.fn().mockResolvedValue({ resource: 'pages', action: 'envelope', data: envelope });
  const boot = bootPublicRuntime();
  // Flush pending promise callbacks without resolving either presentation read.
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(window.meltdownEmit).toHaveBeenCalledWith('cmsPublicRuntimeRequest', expect.objectContaining({
    resource: 'pages', action: 'envelope', params: { slug: 'landing', language: 'en' }
  }));
  expect(loadPublicRuntimeLoaders).toHaveBeenCalledWith(envelope);
  expect(orchestrate).not.toHaveBeenCalled();
  colorsReady();
  fontsReady();
  await boot;
  expect(orchestrate).toHaveBeenCalledWith(envelope, expect.objectContaining({ publicToken: 'public-token' }));
  expect(document.title).toBe('Landing');
});
