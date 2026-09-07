/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

test('Studio header host stays outside inspector and authored app scopes', () => {
  const source = fs.readFileSync(path.join(__dirname, '../ui/designer/app/renderer/builderHeader.ts'), 'utf8');
  // Exercise the actual mount resolver without initializing unrelated editor services.
  const resolver = source.match(/function getHeaderHost\(\): HTMLElement \{[\s\S]*?\n\}/)[0];
  const compiled = ts.transpileModule(resolver, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const resolve = new Function('document', `${compiled}; return getHeaderHost();`);
  document.body.innerHTML = '<div id="builderRow"><aside id="sceneInspector"><div class="app-scope"></div></aside><main class="app-scope"></main></div>';
  const header = document.createElement('header');
  header.id = 'builder-header';
  resolve(document).prepend(header);
  expect(header.parentElement).toBe(document.body);
  expect(document.querySelector('#sceneInspector header')).toBeNull();
  expect(document.body.firstElementChild).toBe(header);
  document.body.replaceChildren();
});
