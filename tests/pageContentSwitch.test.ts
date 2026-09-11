/** @jest-environment jsdom */
import { mountPageContentSwitch, openDocumentMode } from '../ui/designer/app/renderer/pageContentSwitch';
import { openArticle } from '../ui/shared/article/articleLoader';
jest.mock('../ui/shared/article/articleLoader', () => ({ openArticle: jest.fn().mockResolvedValue(undefined), loadArticleEditor: jest.fn().mockResolvedValue({}) }));

test('the Studio document action protects dirty designs and reuses the same saved design after returning', async () => {
  history.replaceState({}, '', '/?contentPageId=4&contentLang=zh');
  const header = document.createElement('header'); document.body.append(header);
  mountPageContentSwitch(header, () => '8');
  window.blogposterDesignerCommands = { snapshot: () => ({ save: { dirty: true } }) } as any;
  await expect(openDocumentMode()).rejects.toThrow('PAGE_DESIGN_SAVE_REQUIRED');
  let page: any = { id: 4, language: 'en', trans_lang: 'zh', title: 'Article', html: '<p>内容</p>', meta: { contentFormat: 'article-v1', pageDesignMode: 'composed', designId: '8' } };
  window.meltdownEmit = jest.fn(async (_e, p: any) => { if (p.action === 'update') page = { ...page, meta: p.params.meta }; return page; }) as any;
  window.blogposterDesignerCommands = { snapshot: () => ({ save: { dirty: false } }) } as any;
  expect(await openDocumentMode()).toMatchObject({ pageId: '4', editor: 'article' });
  expect(page.meta).not.toHaveProperty('designId');
  const options = (openArticle as jest.Mock).mock.calls[0][2];
  await options.openDesign(page);
  expect(page.meta.designId).toBe('8');
  expect(page.html).toBe('<p>内容</p>');
  document.body.replaceChildren();
});
