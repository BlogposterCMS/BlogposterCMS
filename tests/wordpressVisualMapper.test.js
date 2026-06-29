const assert = require('assert');

const { buildDesignerDraft, _internals } = require('../mother/modules/importer/importers/wordpressVisualMapper');

test('WordPress visual mapper turns neutral HTML into editable Designer widgets', () => {
  const draft = buildDesignerDraft({
    title: 'Landing',
    slug: 'landing',
    normalizedHtml: [
      '<main>',
      '<nav class="primary-menu"><a href="/">Home</a></nav>',
      '<h1>Hello</h1>',
      '<p>Useful copy for the studio.</p>',
      '<figure><img src="../../assets/media/hero.jpg" alt="Hero"></figure>',
      '<a class="btn cta" href="/contact">Contact us</a>',
      '</main>'
    ].join('')
  });

  assert.strictEqual(draft.source, 'wordpress-visual-mapper');
  assert.strictEqual(draft.strategy, 'neutralized-html-to-designer-widgets');
  assert.deepStrictEqual(
    draft.widgets.map(widget => widget.widgetId),
    ['navigationMenu', 'textBox', 'textBox', 'mediaBlock', 'buttonLink']
  );
  assert(draft.widgets.every(widget => widget.code.meta.source === 'wordpress-visual-mapper'));
  assert(draft.widgets[1].code.html.includes('data-text-editable'));
  assert.strictEqual(draft.summary.nativeWidgets, 5);
  assert.strictEqual(draft.summary.fallbackWidgets, 0);
});

test('WordPress visual mapper falls back to an HTML block for unknown neutral markup', () => {
  const draft = buildDesignerDraft({
    title: 'Custom',
    slug: 'custom',
    normalizedHtml: '<div class="custom-engine-output"><span>Only custom wrappers</span></div>'
  });

  assert.strictEqual(draft.widgets.length, 1);
  assert.strictEqual(draft.widgets[0].widgetId, 'htmlBlock');
  assert.strictEqual(draft.summary.fallbackWidgets, 1);
});

test('WordPress visual mapper classifies imported button fragments conservatively', () => {
  assert.strictEqual(_internals.classifyFragment('<a href="/plain">Plain link</a>'), null);
  assert.strictEqual(_internals.classifyFragment('<a class="btn" href="/go">Go</a>').widgetId, 'buttonLink');
});

test('WordPress visual mapper drops unsafe imported button URLs', () => {
  const button = _internals.classifyFragment('<a class="btn" href="javascript:alert(1)">Go</a>');

  assert.strictEqual(button.widgetId, 'buttonLink');
  assert(button.code.html.includes('href="#"'));
  assert(!button.code.html.includes('javascript:'));
});
