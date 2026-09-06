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
  const request = jest.fn().mockResolvedValue(envelope());
  const result = await loadPublicPresentation(request, 'home', 'en');
  expect(request.mock.calls).toEqual([['pages', 'envelope', { slug: 'home', language: 'en' }]]);
  expect(result.body).toContain('<h1>Published</h1>');
  expect(result.body).toContain('/hero.png');
  expect(result.body).toContain('/site.css');
  expect(result.body).not.toContain('window.interactive');
  expect(result.bootstrap.htmlRendered).toBe(true);
});

test('linked layouts reserve geometry while widget data remains client-owned', async () => {
  const layout = { items: [{ instanceId: 'one', widgetId: 'text', xPercent: 20, wPercent: 50, hPercent: 25 }] };
  const request = jest.fn().mockResolvedValueOnce(envelope('layout:one@v1')).mockResolvedValueOnce(layout);
  const result = await loadPublicPresentation(request, 'home', 'en');
  expect(result.body).toContain('data-bp-initial-item="0"');
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

test('public facade rejection fails closed before any initial HTML is produced', async () => {
  await expect(loadPublicPresentation(jest.fn().mockRejectedValue(new Error('Page not found')), 'draft', 'en'))
    .rejects.toThrow('Page not found');
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
