const { EventEmitter } = require('events');
const { buildHtmlDesignerDraft, safeDeclarations } = require('../mother/modules/importer/importers/htmlVisualMapper');
const htmlPage = require('../mother/modules/importer/importers/htmlPage');

function element(index, extra = {}) {
  return { id: `node-${index}`, kind: 'text', label: 'Heading', rect: { x: 20, y: 30, w: 300, h: 70 },
    html: '<h1 style="font-size:48px;color:rgb(10, 20, 30)">Editable <em>heading</em></h1>', ...extra };
}
function capture(elements = [element(1)]) {
  return { format: 'blogposter-html-capture', version: 1, snapshots: [
    { viewport: { width: 390 }, pageHeight: 3000, elements, warnings: [] },
    { viewport: { width: 1440 }, pageHeight: 1500, elements: elements.map(e => ({ ...e, rect: { ...e.rect, x: 100, w: 600 } })), warnings: [] }
  ] };
}

function structuredCapture() {
  const input = capture();
  input.snapshots.forEach(snapshot => {
    const width = snapshot.viewport.width;
    snapshot.structure = {
      sections: [
        { id: 'hero', title: 'Hero', rect: { x: 0, y: 0, w: width, h: 800 } },
        { id: 'features', title: 'Features', rect: { x: 0, y: 800, w: width, h: 700 } }
      ],
      containers: [{ id: 'copy', title: 'Copy', parentId: 'features', sectionId: 'features', rect: { x: 40, y: 820, w: width - 80, h: 200 } }]
    };
    snapshot.elements[0] = element(1, { parentId: 'copy', sectionId: 'features', rect: { x: 60, y: 850, w: 100, h: 50 } });
  });
  return input;
}

test('imports semantic sections and nested containers with parent-local geometry', () => {
  const draft = buildHtmlDesignerDraft(structuredCapture());
  expect(draft.layout.settings.minHeight).toBe('0px');
  expect(draft.summary).toMatchObject({ sections: 2, containers: 1 });
  const features = draft.layout.children[1];
  expect(features.section.title).toBe('Features');
  expect(features.children[0].nodeId).toBe(draft.widgets[0].workareaId);
  expect(draft.widgets[0].sceneId).toBe(features.nodeId);
  expect(draft.widgets[0].code.meta.responsivePlacement.base).toMatchObject({ yPx: 30, centerXPercent: 70 / 1360 * 100 });
  expect(features.children[0].placement.responsivePlacement.base).toMatchObject({ yPx: 20, widthPx: 1360 });
  expect(draft.widgets[0].code.meta.htmlImport.page.frames[0].height).toBe(700);
});

test('rejects missing or cyclic container ownership before writing', () => {
  const input = structuredCapture();
  input.snapshots[0].structure.containers[0].parentId = 'copy';
  expect(() => buildHtmlDesignerDraft(input)).toThrow('HTML_IMPORT_STRUCTURE_INVALID');
  input.snapshots[0].structure.containers[0].parentId = 'missing';
  expect(() => buildHtmlDesignerDraft(input)).toThrow('HTML_IMPORT_STRUCTURE_INVALID');
});

test('measured import retains repeated content and more than 24 independently editable objects', () => {
  const draft = buildHtmlDesignerDraft(capture(Array.from({ length: 40 }, (_, i) => element(i))));
  expect(draft.widgets).toHaveLength(40);
  expect(draft.summary.editableWidgets).toBe(40);
  expect(draft.widgets[39].code.meta.htmlImport.page.rootId).toBe(draft.layout.children[0].nodeId);
  expect(draft.widgets[0].code.html).toContain('editable');
  expect(draft.widgets[0].code.html).toContain('<em');
  expect(draft.layout.children[0].nodeId).toBe(draft.widgets[0].code.meta.workareaId);
  expect(draft.widgets[0].code.meta.responsivePlacement.rules).toEqual([
    expect.objectContaining({ minWidth: 320, maxWidth: 915, geometry: expect.objectContaining({ widthPx: 300, yPx: 30 }) }),
    expect.objectContaining({ minWidth: 916, maxWidth: 3840, geometry: expect.objectContaining({ widthPx: 600, yPx: 30 }) })
  ]);
});

test('mobile-only objects remain represented and are hidden only in their missing viewport', () => {
  const input = capture();
  input.snapshots[0].elements.push(element(2));
  const draft = buildHtmlDesignerDraft(input);
  const widget = draft.widgets.find(w => w.code.meta.htmlImport.sourceId === 'node-2');
  expect(widget).toBeDefined();
  expect(widget.code.css).toContain('visibility:hidden;pointer-events:none');
});

test('imports preserve explicit header stacking above later page backgrounds', () => {
  const draft = buildHtmlDesignerDraft(capture([element(1, { stackingOrder: 50 }), element(2, { kind: 'decoration', css: { 'background-color': 'white' } })]));
  expect(draft.widgets[0].zIndex).toBeGreaterThan(draft.widgets[1].zIndex);
});

test('HTML and computed CSS cannot import scripts, handlers, unsafe URLs or arbitrary selectors', () => {
  const draft = buildHtmlDesignerDraft(capture([element(1, {
    html: '<script>alert(1)</script><a onclick="alert(1)" href="javascript:alert(1)" style="color:red;background-image:url(javascript:alert(1));font-family:x}body{display:none">Go</a><img src="https://example.test/image.png" onerror="evil()">'
  })]));
  expect(draft.widgets[0].code.html).not.toMatch(/script|onclick|onerror|javascript:/);
  expect(draft.widgets[0].code.html).toContain('https://example.test/image.png');
  expect(draft.widgets[0].code.css).not.toMatch(/javascript:|body\{/);
  expect(draft.widgets[0].code.js).toBeUndefined();
  expect(safeDeclarations({ color: 'red', 'background-image': 'url(\\6a avascript:alert(1))', display: 'none;position:fixed' })).toBe('color:red');
});

test.each([
  input => { input.snapshots[0].elements[0].rect.w = Infinity; },
  input => { input.snapshots[0].elements.push(input.snapshots[0].elements[0]); },
  input => { input.snapshots[0].viewport.width = 1; },
  input => { input.snapshots[0].elements[0].id = '"] body {'; },
  input => { input.snapshots[0].elements = Array.from({ length: 1501 }, (_, i) => element(i)); }
])('malformed or excessive capture fails before producing a draft', mutate => {
  const input = capture();
  mutate(input);
  expect(() => buildHtmlDesignerDraft(input)).toThrow(/HTML_IMPORT_/);
});

test('unsupported fragments remain explicit review warnings, never executable fallback widgets', () => {
  const input = capture([element(1), element(2, { kind: 'unsupported', html: '<iframe src="https://example.test"></iframe>' })]);
  input.snapshots[0].warnings = [{ code: 'HTML_IMPORT_UNSUPPORTED_ELEMENT', nodeId: 'node-2' }];
  const draft = buildHtmlDesignerDraft(input);
  expect(draft.widgets).toHaveLength(1);
  expect(draft.summary.warnings).toContainEqual(expect.objectContaining({ code: 'HTML_IMPORT_UNSUPPORTED_ELEMENT', nodeId: 'node-2' }));
});

test('dry run never writes; write import uses the existing Designer save contract and remains a draft', async () => {
  const emitter = new EventEmitter();
  const save = jest.fn((payload, callback) => callback(null, { id: 7, version: 1 }));
  emitter.on('designer.saveDesign', save);
  const options = { capture: capture(), motherEmitter: emitter, jwt: 'test-importer-token' };
  const preview = await htmlPage.import(options);
  expect(preview.dryRun).toBe(true);
  expect(save).not.toHaveBeenCalled();
  const result = await htmlPage.import({ ...options, dryRun: false });
  expect(result.result.id).toBe(7);
  expect(save).toHaveBeenCalledWith(expect.objectContaining({
    moduleName: 'designerManager', moduleType: 'core', design: expect.objectContaining({ isDraft: true }),
    layout: expect.objectContaining({ nodeId: 'page-root' })
  }), expect.any(Function));
});

test('Designer save sanitization retains imported images and editor hooks across persistence', async () => {
  jest.resetModules();
  const manager = require('../mother/modules/designerManager');
  const emitter = new EventEmitter();
  emitter.registerModuleType = () => {};
  let saved;
  for (const name of ['createDatabase', 'applySchemaDefinition', 'performDbOperation']) {
    emitter.on(name, (payload, callback) => { if (payload.operation === 'DESIGNER_SAVE_DESIGN') saved = payload; callback(null, { id: 9, version: 1 }); });
  }
  await manager.initialize({ motherEmitter: emitter, isCore: true, jwt: 'test-token' });
  const draft = buildHtmlDesignerDraft(capture([element(1, { html: '<p class="evil" onclick="evil()">Text</p><img src="https://example.test/image.png" alt="Example">' })]));
  await new Promise((resolve, reject) => emitter.emit('designer.saveDesign', { design: { title: 'Import', isDraft: true }, widgets: draft.widgets, layout: draft.layout }, (e, r) => e ? reject(e) : resolve(r)));
  const stored = JSON.stringify(saved);
  expect(stored).toContain('bp-import-node-');
  expect(stored).toContain('editable');
  expect(stored).toContain('https://example.test/image.png');
  expect(stored).not.toContain('onclick');
  expect(stored).not.toContain('evil');
  delete global.loadedModules.designerManager;
});


test('Designer save preserves authored interactive markup while excluding executable HTML', async () => {
  jest.resetModules();
  const manager = require('../mother/modules/designerManager');
  const emitter = new EventEmitter();
  emitter.registerModuleType = () => {};
  let saved;
  for (const name of ['createDatabase', 'applySchemaDefinition', 'performDbOperation']) {
    emitter.on(name, (payload, callback) => {
      if (payload.operation === 'DESIGNER_SAVE_DESIGN') saved = payload;
      callback(null, { id: 9, version: 1 });
    });
  }
  await manager.initialize({ motherEmitter: emitter, isCore: true, jwt: 'test-token' });
  const html = '<div id="widget-root" class="widget-composer" data-state="search" hidden aria-live="polite"><form action="https://example.test"><div data-editor contenteditable="plaintext-only" role="combobox"></div><select data-locale><option value="zh" selected>Chinese</option></select><button type="submit" disabled onclick="bad()">Go</button></form><script>bad()</script><iframe src="https://example.test"></iframe><a href="javascript:bad()">Link</a></div>';
  await new Promise((resolve, reject) => emitter.emit('designer.saveDesign', {
    design: { title: 'Interactive' }, widgets: [{ id: 'one', widgetId: 'custom', code: { html } }]
  }, (error, result) => error ? reject(error) : resolve(result)));
  const stored = saved.params[0].widgets[0].html;
  for (const hook of ['id="widget-root"', 'class="widget-composer"', 'data-editor', 'contenteditable="plaintext-only"', 'aria-live="polite"', '<form>', '<select', 'value="zh"', 'disabled', 'hidden']) expect(stored).toContain(hook);
  for (const unsafe of ['onclick', '<script', '<iframe', 'javascript:', 'action=']) expect(stored).not.toContain(unsafe);
  delete global.loadedModules.designerManager;
});
