/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

// Execute the shipped source with an import boundary that rejects canvas code.
// This detects eager transitive dependencies, not just calls to grid.init().
function loadWithoutCanvas() {
  const source = fs.readFileSync(path.join(__dirname, '../mother/modules/widgetManager/publicLoader.ts'), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const imports = [];
  const exports = {};
  const dependencies = {
    '/ui/shared/layout/publicCanvasPresentation.js': require('../ui/shared/layout/publicCanvasPresentation.ts'),
    '/ui/shared/api-client/runtimeFacade.js': { emitRuntimePublic: jest.fn().mockResolvedValue([]) },
    '/ui/runtime/main/script-utils.js': { executeJs: jest.fn() },
    '/ui/shared/sanitize/sanitizer.js': { sanitizeHtml: html => html }
  };
  new Function('require', 'exports', code)(name => {
    imports.push(name);
    if (!(name in dependencies)) throw new Error(`Canvas dependency unavailable: ${name}`);
    return dependencies[name];
  }, exports);
  return { ...exports, imports };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  delete document.documentElement.dataset.bpPublicWidgetsReady;
});

test('complete HTML renders without fetching canvas or admin dependency modules', async () => {
  const runtime = loadWithoutCanvas();
  await runtime.loadWidgets({}, { hasPageHtmlContent: true, activeLayout: { items: [] } });
  expect(document.documentElement.dataset.bpPublicWidgetsReady).toBe('true');
  expect(runtime.imports.filter(name => /canvasGrid|widgetOptions|adminWidget/.test(name))).toEqual([]);
  expect(document.getElementById('bp-grid')).toBeNull();
});

test('widget canvas dependencies remain lazy bundle edges after the HTML-only return', () => {
  const source = fs.readFileSync(path.join(__dirname, '../mother/modules/widgetManager/publicLoader.ts'), 'utf8');
  const htmlOnlyReturn = source.indexOf("if ((layout.items || []).length === 0 && (hasHtmlPage || ctx.expectsPageContent))");
  const canvasImport = source.indexOf("import('/ui/shared/grid/canvasGrid.js')");

  expect(htmlOnlyReturn).toBeGreaterThan(-1);
  expect(canvasImport).toBeGreaterThan(htmlOnlyReturn);
  expect(source).not.toContain("import(/* webpackIgnore: true */ '/ui/runtime/main/runtimeDesignDocument.js')");
  expect(source).not.toContain("import(/* webpackIgnore: true */ '/ui/shared/grid/canvasGrid.js')");
});

test('a required canvas import failure reports a searchable error before mounting', async () => {
  const runtime = loadWithoutCanvas();
  await expect(runtime.loadWidgets({}, {
    activeLayout: { items: [{ widgetId: 'hero' }] }
  })).rejects.toThrow('WIDGET_PUBLIC_RUNTIME_IMPORT_FAILED');
  expect(document.getElementById('bp-grid')).toBeNull();
});
