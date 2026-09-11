/** @jest-environment jsdom */
import { ensureContentDesign, useDocumentEditor, reuseContentDesign, pageDesignEditorUrl } from '../ui/shared/article/pageEditorMode';

test('switching an article to Studio creates a content host and retains HTML, translations and media', async () => {
  const page = { id: 4, title: 'Guide', html: '<p>Text</p><img src="/media/keep.png">', language: 'en', parent_id: 1, status: 'draft', css: '.image{width:50%}', meta: { contentFormat: 'article-v1', attachments: ['keep'] } };
  const emit = jest.fn(async (_event, payload) => payload.resource === 'designer' ? { id: 8 } : page); window.meltdownEmit = emit;
  expect(await ensureContentDesign(page)).toBe('8');
  expect(emit.mock.calls.find(([, p]) => p.resource === 'designer')![1].params.layout).toMatchObject({ isDynamicHost: true, nodeId: 'page-content', settings: { mode: 'stack' } });
  const update = emit.mock.calls.find(([, p]) => p.action === 'update')![1].params;
  expect(update).toMatchObject({ parent_id: 1, status: 'draft', translations: [{ html: page.html, css: page.css }], meta: { attachments: ['keep'], contentFormat: 'article-v1', designId: '8', pageDesignMode: 'composed' } });
  expect(page.meta).not.toHaveProperty('designId');
});

test('document mode detaches only the page association and returning reuses the saved design', async () => {
  let page: any = { id: 4, title: 'Guide', html: '<p>Body</p>', meta: { designId: '8', pageDesignMode: 'composed', contentFormat: 'article-v1', attachments: ['keep'] } };
  const emit = jest.fn(async (_event, payload) => {
    if (payload.action === 'update') page = { ...page, meta: payload.params.meta };
    return page;
  }); window.meltdownEmit = emit;
  await expect(useDocumentEditor('4', 'other')).rejects.toThrow('PAGE_CONTENT_CHANGED');
  const next = await useDocumentEditor('4', '8');
  expect(next.html).toBe('<p>Body</p>'); expect(next.meta).toMatchObject({ attachments: ['keep'], pageDesignMode: 'main' });
  expect(next.meta).not.toHaveProperty('designId');
  await reuseContentDesign(next, '8'); expect(page.meta.designId).toBe('8');
  expect(emit.mock.calls.some(([, p]) => p.resource === 'designer')).toBe(false);
  expect(pageDesignEditorUrl(4, '8', 'zh')).toBe('/admin/studio/design/8?contentPageId=4&contentLang=zh');
});

test('a failed or concurrent design attachment never overwrites a newer page association', async () => {
  let reads = 0;
  const emit = jest.fn(async (_e, p) => p.resource === 'designer' ? { id: 8 } : (++reads === 1 ? { id: 4, html: '<p>Body</p>' } : { id: 4, meta: { designId: 'other' } }));
  window.meltdownEmit = emit;
  await expect(ensureContentDesign({ id: 4 })).rejects.toThrow('PAGE_CONTENT_CHANGED');
  expect(emit.mock.calls.some(([, p]) => p.action === 'update')).toBe(false);
});
