import { resolvePagePresentation, pagePresentationFromList, pageLayoutMeta, pageLayoutMode } from '../ui/shared/layout/pagePresentation';

const pages = [
  { id: 'docs', title: 'Docs', lane: 'public', status: 'published', meta: { designId: 'shared', designTitle: 'Documentation' } },
  { id: 'guide', parent_id: 'docs', status: 'published', meta: { inheritParentDesign: true } },
  { id: 'article', parent_id: 'guide', status: 'published', html: '<h1>Article</h1>', meta: { inheritParentDesign: true } }
];
const load = async (id: string) => pages.find(page => page.id === id) || null;

test('explicit legacy parent inheritance remains readable without copied assignments', async () => {
  const result = await resolvePagePresentation(pages[2]!, load, { publicOnly: true });
  expect(result).toMatchObject({ designId: 'shared', inherited: true, depth: 2, sourcePage: pages[0] });
  expect(pagePresentationFromList(pages[2]!, pages)).toEqual(result);
  expect(pages[2]!.meta).toEqual({ inheritParentDesign: true });
});

test('own design and explicit no-layout mode override inheritance', async () => {
  expect(await resolvePagePresentation({ ...pages[2], meta: { designId: 'own' } }, load))
    .toMatchObject({ designId: 'own', inherited: false });
  const blocked = { ...pages[2], meta: { inheritParentDesign: false } };
  expect(await resolvePagePresentation(blocked, load)).toBeNull();
  expect(pageLayoutMode(blocked)).toBe('none');
  expect(await resolvePagePresentation(pages[2]!, async id => id === 'guide'
    ? { ...pages[1]!, meta: { inheritParentDesign: false } } : load(id))).toBeNull();
});

test.each(['draft', 'deleted'])('public descendants never obtain a %s parent layout', async status => {
  expect(await resolvePagePresentation(pages[2]!, async id => id === 'docs'
    ? { ...pages[0]!, status } : load(id), { publicOnly: true })).toBeNull();
});

test('stops at lane boundaries, cycles and excessive depth', async () => {
  expect(await resolvePagePresentation(pages[2]!, async id => id === 'docs'
    ? { ...pages[0]!, lane: 'admin' } : load(id))).toBeNull();
  await expect(resolvePagePresentation({ id: 'a', parent_id: 'a', meta: { pageDesignMode: 'inherit' } }, async () => ({ id: 'a', parent_id: 'a' })))
    .rejects.toThrow('PAGE_LAYOUT_CYCLE');
  await expect(resolvePagePresentation(pages[2]!, load, { maxDepth: 1 })).rejects.toThrow('PAGE_LAYOUT_DEPTH');
});

test('switching modes preserves unrelated metadata and the page body', () => {
  const page = { ...pages[2], meta: { designId: 'old', design_layout: 'layout:older@v1', inheritDesign: false, keep: true, htmlFileName: 'article.html' } };
  expect(pageLayoutMeta(page, 'inherit')).toEqual({ keep: true, htmlFileName: 'article.html', inheritParentDesign: true, pageDesignMode: 'inherit' });
  expect(pageLayoutMeta(page, 'design', 'new', 'New layout')).toMatchObject({ designId: 'new', keep: true, designTitle: 'New layout' });
  expect(page.html).toBe('<h1>Article</h1>');
  expect(() => pageLayoutMeta(page, 'design')).toThrow('PAGE_LAYOUT_DESIGN_REQUIRED');
});

test('normalizes stored JSON metadata and keeps legacy explicit references readable', async () => {
  expect(await resolvePagePresentation({ id: 1, meta: JSON.stringify({ design_layout: 'layout:abc@v2' }) }, load))
    .toMatchObject({ designId: 'abc', layoutRef: 'layout:abc@v2' });
});
