const { renderPublicSeoHead, absolutePublicUrl } = require('../mother/modules/seoManager/publicHead');

test('renders description and social metadata without JavaScript and with absolute image URLs', () => {
  const head = renderPublicSeoHead({ seoTitle: 'A & B', seoDesc: 'A "description"', seoImage: '/media/cover.png', robots: 'index,follow' },
    { baseUrl: 'https://site.test', pathname: '/docs/start' });
  expect(head).toContain('name="description" content="A &quot;description&quot;"');
  expect(head).toContain('property="og:title" content="A &amp; B"');
  expect(head).toContain('property="og:image" content="https://site.test/media/cover.png"');
  expect(head).toContain('name="twitter:image" content="https://site.test/media/cover.png"');
  expect(head).toContain('name="twitter:card" content="summary_large_image"');
  expect(head).toContain('rel="canonical" href="https://site.test/docs/start"');
});

test('preserves explicit canonical URLs and never invents missing descriptions or images', () => {
  const head = renderPublicSeoHead({ seoTitle: 'Title', canonicalUrl: 'https://primary.test/' },
    { baseUrl: 'https://alias.test', pathname: '/home' });
  expect(head).toContain('rel="canonical" href="https://primary.test/"');
  expect(head).not.toContain('og:image');
  expect(head).not.toContain('name="description"');
});

test.each(['javascript:alert(1)', '//evil.test/a.png', 'https://user:secret@site.test/a', '/bad\\image', '/bad\nimage'])
('rejects unsafe metadata URLs: %s', value => {
  expect(absolutePublicUrl(value, 'https://site.test')).toBe('');
});

test('metadata text cannot escape its quoted attribute', () => {
  const head = renderPublicSeoHead({ seoDesc: '"><script>bad()</script>' });
  expect(head).not.toContain('<script>');
  expect(head).toContain('&quot;&gt;&lt;script&gt;');
});
