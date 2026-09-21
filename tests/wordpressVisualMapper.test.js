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
  assert(draft.widgets[3].code.html.includes('src="../../assets/media/hero.jpg"'));
  assert(draft.widgets[4].code.html.includes('href="/contact"'));
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

test('WordPress visual mapper sanitizes parser edge cases and obfuscated executable URLs', () => {
  const unsafeUrls = [
    'java&#x73;cript:alert(1)',
    'java&#115;cript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)'
  ];
  for (const url of unsafeUrls) {
    assert.strictEqual(_internals.safeUrlAttribute(url, '#'), '#', url);
  }

  const clean = _internals.safeHtmlFragment([
    '<section class="hero" data-source="wordpress" onclick=alert(1)>',
    '<script>alert(1)</script>',
    '<a href="java&#x73;cript:alert(1)" onmouseover="alert(1)">Bad</a>',
    '<img src="data:text/html,boom" onerror=alert(1)>',
    '<p style="color:red; background-image:url(javascript:alert(1))">Safe text</p>',
    '</section>'
  ].join(''));

  assert(clean.includes('<section class="hero" data-source="wordpress">'));
  assert(clean.includes('Safe text'));
  assert(!clean.includes('<script'));
  assert(!/\son[a-z]+=/i.test(clean));
  assert(!/javascript:|data:text\/html|vbscript:/i.test(clean));
});

test('WordPress visual mapper preserves supported relative and public URL schemes', () => {
  const supported = [
    '/contact',
    '../assets/hero.jpg',
    'https://example.test/path?a=1&amp;b=2',
    'mailto:hello@example.test',
    'tel:+41441234567'
  ];
  for (const url of supported) {
    assert.notStrictEqual(_internals.safeUrlAttribute(url, '#'), '#', url);
  }

  assert.strictEqual(
    _internals.decodeEntities('java&amp;#x73;cript:alert(1)'),
    'java&#x73;cript:alert(1)'
  );
});
