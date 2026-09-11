const { EventEmitter } = require('events');
const { localeDesign, readDesignLocalizations, saveDesignLocale, resolveDesignLocale } = require('../ui/shared/localization/designLocaleModel.js');

test('locale widget HTML passes the same core save sanitizer and invalid overrides do not reach persistence', async () => {
  const manager = require('../mother/modules/designerManager');
  const emitter = new EventEmitter(); emitter.registerModuleType = () => {};
  let saved;
  for (const name of ['createDatabase', 'applySchemaDefinition', 'performDbOperation']) emitter.on(name, (payload, callback) => {
    if (payload.operation === 'DESIGNER_SAVE_DESIGN') saved = payload.params[0];
    callback(null, { id: 9, version: 1 });
  });
  await manager.initialize({ motherEmitter: emitter, isCore: true, jwt: 'test-token' });
  const design = { title: 'Locale guide', isDraft: true };
  const base = localeDesign({ design, layout: { type: 'leaf', nodeId: 'content', isDynamicHost: true }, widgets: [{ id: 'one', widgetId: 'custom', code: { html: '<p>Source</p>' } }] });
  const local = JSON.parse(JSON.stringify(base)); local.widgets[0].code.html = '<p onclick="bad()">Translation</p><img src="/media/keep.png"><script>bad()</script>';
  const localizations = saveDesignLocale(base, readDesignLocalizations(base.layout), 'zh', local).localizations;
  const save = payload => new Promise((resolve, reject) => emitter.emit('designer.saveDesign', payload, (error, result) => error ? reject(error) : resolve(result)));
  await save({ design, widgets: base.widgets, layout: { ...base.layout, localizations } });
  const sanitized = resolveDesignLocale(base, saved.layout.localizations, 'zh');
  expect(sanitized.widgets[0].code.html).toContain('/media/keep.png');
  expect(sanitized.widgets[0].code.html).not.toMatch(/onclick|<script|bad\(\)/);
  expect(saved.design.is_draft).toBe(true);
  saved = undefined;
  await expect(save({ design, widgets: [], layout: { localizations: { version: 1, variants: { zh: { fields: { widgets: { value: 'invalid' } } } } } } })).rejects.toThrow('DESIGN_LOCALE_DOCUMENT_INVALID');
  expect(saved).toBeUndefined();
  delete global.loadedModules.designerManager;
});
