/** @jest-environment jsdom */
import { loadArticleEditor, openArticle } from '../ui/shared/article/articleLoader';

test('the already loaded editor is reused and preserves locale and handoff options', async () => {
  const openArticleEditor = jest.fn().mockResolvedValue(undefined);
  window.BlogposterArticleEditor = { openArticleEditor };
  const options = { language: 'zh-cn' };
  expect(await loadArticleEditor()).toBe(window.BlogposterArticleEditor);
  await openArticle(7, undefined, options);
  expect(openArticleEditor).toHaveBeenCalledWith(7, undefined, options);
  delete window.BlogposterArticleEditor;
});
