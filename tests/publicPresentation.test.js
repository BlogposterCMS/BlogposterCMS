const { loadPublicPresentation, sanitizePublicHtml, scriptJson } = require('../mother/modules/pagesManager/publicPresentation');

function envelope(layoutRef) {
  return {
    meta: { seoTitle: 'Published page' },
    attachments: [
      { type: 'design', descriptor: { css: ['/assets/css/runtime.css'], layoutRef } },
      { type: 'html', descriptor: { fallbackOnly: Boolean(layoutRef), inline: {
        html: '<main><h1>Published</h1><img src="/hero.png"><link rel="stylesheet" href="/site.css"></main>',
        css: 'main { color: red; }', js: 'window.interactive = true;'
      } } }
    ]
  };
}

test('first response contains static HTML and assets, without running page scripts', async () => {
  const original = envelope();
  const request = jest.fn().mockResolvedValue(original);
  const result = await loadPublicPresentation(request, 'home', 'en');
  expect(request.mock.calls).toEqual([['pages', 'envelope', { slug: 'home', language: 'en' }]]);
  expect(result.body).toContain('<h1>Published</h1>');
  expect(result.body).toContain('/hero.png');
  expect(result.body).toContain('/site.css');
  expect(result.body).not.toContain('window.interactive');
  expect(result.bootstrap.htmlRendered).toBe(true);
  expect(result.bootstrap.version).toBe(2);
  const transportedHtml = result.bootstrap.envelope.attachments.find(item => item.type === 'html');
  expect(transportedHtml.descriptor.htmlFromInitialResponse).toBe(true);
  expect(transportedHtml.descriptor.inline).not.toHaveProperty('html');
  expect(transportedHtml.descriptor.inline.js).toBe('window.interactive = true;');
  expect(original.attachments[1].descriptor.inline.html).toContain('<h1>Published</h1>');
});

test('linked layouts reserve geometry while widget data remains client-owned', async () => {
  const layout = { items: [{ instanceId: 'one', widgetId: 'text', xPercent: 20, wPercent: 50, hPercent: 25 }] };
  const request = jest.fn().mockResolvedValueOnce(envelope('layout:one@v1')).mockResolvedValueOnce(layout);
  const result = await loadPublicPresentation(request, 'home', 'en');
  expect(result.body).toContain('data-bp-initial-item="0"');
  expect(result.body).toContain('aria-busy="true"');
  expect(result.body).toContain('class="widget-placeholder" role="status"');
  expect(result.head).toContain('.widget-placeholder');
  expect(result.body).toContain('left:20%');
  expect(result.body).toContain('width:50%');
  expect(result.body).not.toContain('<h1>Published');
  expect(request.mock.calls.map(call => call[0])).toEqual(['pages', 'designer']);
  expect(result.bootstrap.layout).toBe(layout);
});

test('missing design preserves the HTML fallback without a second client lookup', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const request = jest.fn().mockResolvedValueOnce(envelope('layout:gone@v1')).mockRejectedValueOnce(new Error('gone'));
    const result = await loadPublicPresentation(request, 'home', 'en');
    expect(result.body).toContain('<h1>Published</h1>');
    expect(result.bootstrap).toMatchObject({ layout: null, layoutResolved: true });
  } finally { warn.mockRestore(); }
});

test('shared layouts keep article text in server HTML and bootstrap the structural content host', async () => {
  const page = envelope('layout:docs@v1');
  page.attachments[1].descriptor.contentSlot = true;
  const layout = { items: [{ instanceId: 'header', widgetId: 'text' }], document: { layoutTree: {
    type: 'split', nodeId: 'root', direction: 'column', children: [
      { type: 'leaf', nodeId: 'article', isDynamicHost: true }
    ]
  } } };
  const request = jest.fn().mockResolvedValueOnce(page).mockResolvedValueOnce(layout);
  const result = await loadPublicPresentation(request, 'docs/intro', 'en');
  expect(result.body).toContain('<h1>Published</h1>');
  expect(result.bootstrap.htmlRendered).toBe(true);
  expect(result.bootstrap.layout.document).toEqual(layout.document);
  expect(result.head).toContain(':where(body > #bp-initial-html)');
  expect(result.head).not.toMatch(/visibility\s*:\s*hidden|opacity\s*:\s*0/);
});

test('the Docs example ships its article typography before any layout widget script', async () => {
  const example = require('../examples/docs-site').buildDocsExample('learn');
  const page = envelope('layout:docs@v1');
  page.attachments[1].descriptor.contentSlot = true;
  page.attachments[1].descriptor.inline = example.pages[1];
  const request = jest.fn().mockResolvedValueOnce(page).mockResolvedValueOnce({
    items: example.design.widgets, document: { layoutTree: example.design.layout }
  });
  const result = await loadPublicPresentation(request, 'learn/layouts', 'en');
  expect(result.body).toContain('Layouts &amp; pages');
  expect(result.head).toContain(':is([data-node-id="docs-demo-root"],body > #bp-initial-html) article h1');
  expect(result.head).toContain('prefers-color-scheme:dark');
  expect(result.head).toContain('padding: 148px 32px 80px 304px');
  expect(result.body).not.toContain('createElement');
});

test('article typography still matches after adoption while temporary outer spacing does not', async () => {
  const { JSDOM } = require('jsdom');
  const result = await loadPublicPresentation(jest.fn().mockResolvedValue(envelope()), 'guide', 'en');
  const dom = new JSDOM(`<html><head>${result.head}</head><body>${result.body}<main id="outlet"></main></body></html>`);
  const document = dom.window.document;
  const article = document.querySelector('.bp-page-html');
  const rules = Array.from(document.styleSheets).flatMap(sheet => Array.from(sheet.cssRules));
  const typography = rules.find(rule => rule.style?.getPropertyValue('font').includes('system-ui'));
  const outerSpacing = rules.find(rule => rule.style?.getPropertyValue('padding') === '32px 24px');
  expect(article.matches(typography.selectorText)).toBe(true);
  expect(article.matches(outerSpacing.selectorText)).toBe(true);
  document.getElementById('outlet').append(article);
  expect(article.matches(typography.selectorText)).toBe(true);
  expect(article.matches(outerSpacing.selectorText)).toBe(false);
  // The author's own stylesheet remains later in the same cascade.
  expect(result.head.indexOf('main { color: red; }')).toBeGreaterThan(result.head.indexOf(typography.selectorText));
  dom.window.close();
});

test('public facade rejection fails closed before any initial HTML is produced', async () => {
  await expect(loadPublicPresentation(jest.fn().mockRejectedValue(new Error('Page not found')), 'draft', 'en'))
    .rejects.toThrow('Page not found');
});

test('an incomplete main design never removes article text from first HTML', async () => {
  const page = envelope('layout:main@v1');
  page.attachments[0].descriptor.requiresContentSlot = true;
  const request = jest.fn().mockResolvedValueOnce(page).mockResolvedValueOnce({
    items: [{ instanceId: 'header', widgetId: 'text' }], document: { layoutTree: { type: 'leaf', nodeId: 'header' } }
  });
  const result = await loadPublicPresentation(request, 'article', 'en');
  expect(result.body).toContain('<h1>Published</h1>');
});

test('initial HTML strips active content and applies the existing CSS policy', () => {
  const html = sanitizePublicHtml('<img src="javascript:alert(1)" onerror="bad()"><script nonce="x">bad()</script>'
    + '<iframe srcdoc="bad"></iframe><a href="javascript:bad()">Link</a>'
    + '<style>.a {background:url(javascript:bad);color:red}</style><div style="color:red; background:url(javascript:bad)">ok</div>');
  expect(html).not.toMatch(/<script|onerror|javascript:|srcdoc|nonce=/i);
  expect(html).toContain('color:red');
});

test('bootstrap JSON cannot terminate its script element or corrupt literal replacement text', () => {
  const value = { html: '</script><script>bad()</script>', css: '$& $` $\'', text: '\u2028\u2029' };
  const encoded = scriptJson(value);
  expect(encoded).not.toContain('<');
  expect(JSON.parse(encoded)).toEqual(value);
});
