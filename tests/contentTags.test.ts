import { normalizeContentTags, normalizeTaggedMeta } from '../ui/shared/content/contentTags';
import { buildPageUpdatePayload } from '../ui/shared/page-editor/pageEditorData';

test('tags preserve Chinese, normalize Latin labels and deduplicate without changing unrelated metadata', () => {
  expect(normalizeContentTags(' Academy, how-to, academy，入门 ')).toEqual(['academy', 'how-to', '入门']);
  expect(normalizeTaggedMeta({ tags: [' Ｆｉｌｅｓ '], keep: true })).toEqual({ tags: ['files'], keep: true });
  expect(normalizeTaggedMeta({ keep: true })).toEqual({ keep: true });
  expect(JSON.parse(normalizeTaggedMeta('{"tags":["ACADEMY"]}'))).toEqual({ tags: ['academy'] });
});

test.each([{}, ['x'.repeat(65)], Array(25).fill('x'), ['<script>'], ['$in'], ['bad\u0000tag'], [42]].map(value => [value]))(
  'invalid tags fail with a safe typed error before persistence: %p', value => {
    expect(() => normalizeContentTags(value)).toThrow('CONTENT_TAGS_INVALID');
  }
);

test('omitted tags preserve existing labels, while an explicit empty input clears them', () => {
  const page = { id: 1, meta: { tags: ['academy'], designId: '2' } };
  const form = { title: 'Guide', slug: 'guide', status: 'draft', seoDesc: '', seoImage: '', publishAt: '' };
  expect((buildPageUpdatePayload('t', page, form) as any).params.meta.tags).toEqual(['academy']);
  expect((buildPageUpdatePayload('t', page, { ...form, tags: '' }) as any).params.meta)
    .toMatchObject({ tags: [], designId: '2' });
});
