const sanitizeSlug = (str) => {
  const cleaned = String(str)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split('/')
    .map(seg => seg.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean)
    .join('/');
  return cleaned.substring(0, 96);
};

test('sanitizeSlug preserves slash-separated segments', () => {
  expect(sanitizeSlug('Content/Media')).toBe('content/media');
});

test('sanitizeSlug removes empty and unsafe segments', () => {
  expect(sanitizeSlug('../Test//Foo')).toBe('test/foo');
});
