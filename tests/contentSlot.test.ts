/** @jest-environment jsdom */
import { missingContentSlot, htmlContentSlot, designHasContentSlot } from '../ui/shared/article/contentSlot';

const slot = { layoutTree: { type: 'leaf', nodeId: 'slot', isDynamicHost: true } };
const noSlot = { layoutTree: { type: 'leaf', nodeId: 'body' } };
it('recognizes the authored content destination', () => {
  expect(designHasContentSlot(slot)).toBe(true);
  expect(designHasContentSlot(noSlot)).toBe(false);
});
it('does not report standalone articles as missing just because they have no parent', async () => {
  expect(await missingContentSlot({ id: 1, html: '<p>Article</p>' }, [], '', jest.fn(), jest.fn())).toBe(false);
});
it('checks the selected design rather than assuming a parent is sufficient', async () => {
  const page = { id: 1, parent_id: 4, html: '<p>Article</p>', meta: { designId: '9' } };
  expect(await missingContentSlot(page, [], '', async () => noSlot, jest.fn())).toBe(true);
  expect(await missingContentSlot(page, [], '', async () => slot, jest.fn())).toBe(false);
});
it('checks both designs in composed pages', async () => {
  const page = { id: 1, html: '<p>Article</p>', meta: { pageDesignMode: 'composed', designId: '9' } };
  expect(await missingContentSlot(page, [], 'main', async id => id === 'main' ? slot : noSlot, jest.fn())).toBe(true);
});
it('uses the same HTML marker for attached child pages and runtime placement', async () => {
  const page = { id: 1, parent_id: 4, is_content: true, html: '<p>Child</p>' };
  expect(await missingContentSlot(page, [], '', jest.fn(), async () => ({ html: '<main>Parent</main>' }))).toBe(true);
  const html = '<main>Before<div data-dynamic-host="true"></div>After</main>';
  expect(await missingContentSlot(page, [], '', jest.fn(), async () => ({ html }))).toBe(false);
  const root = document.createElement('div'); root.innerHTML = html;
  expect(htmlContentSlot(root)?.parentElement?.tagName).toBe('MAIN');
});
