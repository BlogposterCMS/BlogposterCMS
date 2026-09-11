import { createArticleLocale, stableSourceBlocks } from '../ui/shared/article/articleLocale';
const block = (id: string, text: string) => ({ type: 'paragraph', attrs: { 'block-id': id }, content: [{ type: 'text', text }] });
const source = { type: 'doc', content: [block('one', 'First'), block('two', 'Second')] };

test('an absent translation presents gray source blocks without changing or copying the stored document', () => {
  const before = JSON.stringify(source);
  const model = createArticleLocale(source, null);
  expect(model.document).toEqual(source);
  expect(model.document.content!.every(model.isFallback)).toBe(true);
  const edited = { type: 'doc', content: [block('one', '第一'), block('two', 'Second')] };
  const progress = model.progress(edited, 'en', false);
  expect(progress.translatedBlockIds).toEqual(['one']);
  const reopened = createArticleLocale(source, edited, progress);
  expect(reopened.isFallback(reopened.document.content![0])).toBe(false);
  expect(reopened.isFallback(reopened.document.content![1])).toBe(true);
  expect(JSON.stringify(source)).toBe(before);
});

test('untranslated blocks follow updated source while translated and intentionally removed blocks remain local', () => {
  const changed = { type: 'doc', content: [block('one', 'Updated source'), block('two', 'Updated second'), block('three', 'New')] };
  const target = { type: 'doc', content: [block('one', '第一')] };
  const model = createArticleLocale(changed, target, { translatedBlockIds: ['one'], removedBlockIds: ['two'] });
  expect(model.document.content).toEqual([block('one', '第一'), block('three', 'New')]);
  expect(model.isFallback(model.document.content![1])).toBe(true);
});

test('legacy source ids are deterministic and an existing complete translation stays authored', () => {
  const legacy = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Source' }] }] };
  expect(stableSourceBlocks(legacy)).toEqual(stableSourceBlocks(legacy));
  expect(legacy.content[0]).not.toHaveProperty('attrs');
  const translated = { type: 'doc', content: [block('other-id', '译文')] };
  expect(createArticleLocale(source, translated).document).toEqual(translated);
});
