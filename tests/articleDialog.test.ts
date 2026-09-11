/** @jest-environment jsdom */
import { openArticleEditor } from '../ui/shared/article/articleEditor';
import { bpDialog } from '../ui/shared/dialogs/bpDialog';
import { registerWorkspaceAgent } from '../ui/shared/agent/workspaceAgent';
jest.mock('../ui/shared/agent/workspaceAgent', () => ({ registerWorkspaceAgent: jest.fn(() => ({ stop: jest.fn() })) }));
jest.mock('../ui/shared/dialogs/bpDialog', () => ({ bpDialog: { open: jest.fn() } }));

// jsdom has no layout engine. ProseMirror's deferred focus scroll needs the
// Range geometry API even though this test exercises content and save guards.
beforeAll(() => {
  Object.defineProperties(Range.prototype, {
    getClientRects: { configurable: true, value: () => [] },
    // Use jsdom's existing element geometry: older CI jsdom has no DOMRect global.
    getBoundingClientRect: { configurable: true, value: () => document.body.getBoundingClientRect() }
  });
});

it('exposes stable block edits and protects a dirty dialog until an explicit save', async () => {
  let options: any, finish: (value: unknown) => void;
  (bpDialog.open as jest.Mock).mockImplementation(value => {
    options = value; document.body.append(value.body, value.footerContent);
    return new Promise(resolve => { finish = resolve; });
  });
  const page = { id: 77, title: 'Docs', status: 'draft', html: '<p data-block-id="first">Before</p>', meta: { contentFormat: 'article-v1' } };
  window.meltdownEmit = jest.fn().mockResolvedValue(page);
  const dialog = openArticleEditor(77);
  // Editor and shared dialog mount asynchronously.
  await new Promise(resolve => setTimeout(resolve, 30));
  const surface = (registerWorkspaceAgent as jest.Mock).mock.calls[0][0];
  expect(surface.read().dirty).toBe(false);
  expect(options.beforeClose()).toBe(true);
  const action = (name: string) => surface.actions.find((entry: any) => entry.action === name);
  expect(options.titleContent.value).toBe('Docs');
  action('article.setTitle').run({ title: 'Updated guide' });
  expect(surface.read().title).toBe('Updated guide');
  action('article.replaceBlock').run({ id: 'first', node: { type: 'paragraph', content: [{ type: 'text', text: 'After' }] } });
  expect(surface.read().blocks[0]).toMatchObject({ id: 'first', text: 'After' });
  expect(options.beforeClose()).toBe(false);
  expect(() => action('article.replaceBlock').run({ id: 'missing', node: { type: 'paragraph' } })).toThrow('ARTICLE_BLOCK_NOT_FOUND');
  expect(() => action('article.appendBlock').run({ node: { type: 'text', text: 'not a block' } })).toThrow('ARTICLE_BLOCK_INVALID');
  await action('article.save').run();
  const saved = (window.meltdownEmit as jest.Mock).mock.calls.find(([, payload]) => payload.action === 'update')![1].params;
  expect(saved.title).toBe('Updated guide');
  expect(saved.translations[0].seoTitle).toBe('');
  expect(action('article.openDesign').confirm).toBe(true);
  expect(surface.read().dirty).toBe(false);
  expect(options.beforeClose()).toBe(true);
  finish!({ action: 'cancel' }); await dialog;
  document.body.replaceChildren();
});
