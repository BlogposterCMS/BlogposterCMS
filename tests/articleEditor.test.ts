/** @jest-environment jsdom */
import { Editor } from '@tiptap/core';
import { articleExtensions, cleanArticleHtml, validateArticleDocument } from '../ui/shared/article/articleSchema';
import { pageContentKind, saveArticle, createPageDesign } from '../ui/shared/article/articleData';

describe('Article content contract', () => {
  it('distinguishes articles from existing HTML and empty pages', () => {
    expect(pageContentKind({ html: '' })).toBe('empty');
    expect(pageContentKind({ parent_id: 4, meta: { inheritParentDesign: true } })).toBe('empty');
    expect(pageContentKind({ meta: { designId: '42' } })).toBe('design');
    expect(pageContentKind({ html: '<p>Existing</p>' })).toBe('html');
    expect(pageContentKind({ meta: { htmlFileName: 'page.html' } })).toBe('html');
    expect(pageContentKind({ html: '<p>Article</p>', meta: { contentFormat: 'article-v1' } })).toBe('article');
  });
  it('creates an own design through existing contracts and attaches it to the empty page', async () => {
    const page = { id: 77, title: 'Docs', html: '', status: 'draft', meta: {} };
    const emit = jest.fn().mockImplementation((_, payload) => Promise.resolve(payload.resource === 'designer' ? { id: 9 } : page));
    window.meltdownEmit = emit;
    await expect(createPageDesign(page)).resolves.toBe('9');
    expect(emit.mock.calls.find(([,p]) => p.resource === 'designer')![1].params).toMatchObject({ design: { title: 'Docs', isDraft: true }, widgets: [] });
    expect(emit.mock.calls.find(([,p]) => p.action === 'update')![1].params.meta).toMatchObject({ designId: '9' });
  });
  it('saves through the page contract and preserves publication, hierarchy and SEO', async () => {
    const page = { id: 77, title: 'Docs', slug: 'docs', html: '', status: 'draft', parent_id: 4, language: 'en', seo_title: 'Search title', meta_desc: 'Description', meta: { keep: true } };
    const emit = jest.fn().mockResolvedValue(page); window.meltdownEmit = emit;
    await saveArticle(page, '<p data-block-id="one">Hello</p>');
    const payload = emit.mock.calls.find(([, payload]) => payload.action === 'update')![1];
    expect(payload.params).toMatchObject({ pageId: 77, status: 'draft', parent_id: 4, meta: { keep: true, contentFormat: 'article-v1' }, translations: [{ html: '<p data-block-id="one">Hello</p>', seoTitle: 'Search title', metaDesc: 'Description' }] });
  });
  it('refuses stale content and never implicitly converts an HTML attachment', async () => {
    window.meltdownEmit = jest.fn().mockResolvedValue({ id: 77, html: '<p>Changed</p>' });
    await expect(saveArticle({ id: 77, html: '' }, '<p>Mine</p>')).rejects.toThrow('ARTICLE_CONTENT_CHANGED');
    const page = { id: 77, html: '', meta: { htmlFileName: 'page.html' } };
    window.meltdownEmit = jest.fn().mockResolvedValue(page);
    await expect(saveArticle(page, '<p>Mine</p>')).rejects.toThrow('ARTICLE_FORMAT_CONFLICT');
  });
  it('checks and saves the selected article translation while preserving its primary language', async () => {
    const page = { id: 77, language: 'en', title: 'Docs', trans_title: '指南', trans_lang: 'zh', contentLanguage: 'zh', html: '<p>中文</p>', meta: { contentFormat: 'article-v1' } };
    const emit = jest.fn().mockResolvedValue(page); window.meltdownEmit = emit;
    await saveArticle(page, '<p>更新</p>');
    expect(emit.mock.calls[0][1].params).toEqual({ pageId: '77', language: 'zh' });
    const params = emit.mock.calls.find(([,p]) => p.action === 'update')![1].params;
    expect(params).toMatchObject({ translations: [{ language: 'zh', title: '指南', html: '<p>更新</p>' }] });
    expect(params.language).toBeUndefined(); expect(params.title).toBeUndefined();
  });
  it('round trips rich content and stable block identifiers through HTML', () => {
    const content = '<h2 data-block-id="heading">Title</h2><p data-block-id="body"><strong>Hello</strong> world</p><ul><li><p>Item</p></li></ul><img src="/media/image.png" alt="A picture"><video src="/media/movie.mp4" controls></video>';
    const editor = new Editor({ extensions: articleExtensions(), content });
    const html = editor.getHTML();
    const reopened = new Editor({ extensions: articleExtensions(), content: html });
    expect(reopened.getHTML()).toBe(html);
    expect(html).toContain('data-block-id="heading"');
    expect(html).toContain('<strong>Hello</strong>');
    expect(html).toContain('<video');
    validateArticleDocument(reopened.getJSON());
    editor.destroy(); reopened.destroy();
  });
  it('rejects executable URLs and strips active pasted HTML', () => {
    expect(cleanArticleHtml('<script>alert(1)</script><p onclick="bad()">Text</p><img src="javascript:bad()">')).toBe('<p>Text</p><img>');
    expect(() => validateArticleDocument({ type: 'doc', content: [{ type: 'image', attrs: { src: 'javascript:bad()' } }] })).toThrow('ARTICLE_MEDIA_URL_INVALID');
    expect(() => validateArticleDocument({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'bad', marks: [{ type: 'link', attrs: { href: 'data:text/html,bad' } }] }] }] })).toThrow('ARTICLE_LINK_INVALID');
    expect(() => validateArticleDocument({ type: 'doc', content: {} })).toThrow('ARTICLE_DOCUMENT_INVALID');
  });
});
