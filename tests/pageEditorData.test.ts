/**
 * @jest-environment jsdom
 */

import {
  asString,
  buildPageUpdatePayload,
  clearPageEditorCache,
  errorMessage,
  loadPageEditorPage,
  loadPageEditorTranslation,
  normalizePageLanguage,

  savePageEditorPage,
  toPage,


} from '../ui/widgets/plainspace/admin/pageEditorWidgets/pageEditorData';

const page = {
  id: 'page-1',
  slug: 'old-slug',
  status: 'draft',
  seo_image: '/old.png',
  parent_id: null,
  is_content: true,
  lane: 'public',
  language: 'en',
  title: 'Old Title',
  html: '<p>Body</p>',
  css: '.body{}',
  seo_title: 'SEO Old',
  seo_keywords: 'old,keywords',
  meta: {
    keep: true,
    publish_at: '2026-01-01T10:00',
    layoutTemplate: 'old-layout'
  }
};

const values = {
  title: ' New Title ',
  seoDesc: 'Description',
  status: 'published',
  slug: ' new-slug ',
  publishAt: '2026-06-17T12:00',
  layoutName: 'landing',
  seoImage: ' /new.png '
};

describe('pageEditorData', () => {
  it('reads one selected translation without changing the primary language', async () => {
    const emit = jest.fn().mockResolvedValue({ ...page, trans_lang: 'zh', trans_title: '登录', html: '<p>中文</p>' });
    const translated = await loadPageEditorTranslation(emit, 'test', 'page-1', ' ZH ');
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', expect.objectContaining({ params: { pageId: 'page-1', language: 'zh' } }));
    const payload = buildPageUpdatePayload('test', translated, { ...values, title: '更新', seoDesc: '说明' }) as any;
    expect(payload.params).toMatchObject({ translations: [{ language: 'zh', title: '更新', html: '<p>中文</p>', metaDesc: '说明' }] });
    expect(payload.params.title).toBeUndefined(); expect(payload.params.language).toBeUndefined();
    expect(payload.params.translations).toHaveLength(1);
    const clear = jest.fn(); clearPageEditorCache({ clear }, translated);
    expect(clear).toHaveBeenCalledWith('cmsAdminApiRequest', expect.objectContaining({ params: { pageId: 'page-1', language: 'zh' } }));
  });

  it('selects a non-English primary translation and rejects unsafe locale inputs before transport', async () => {
    const emit = jest.fn().mockResolvedValue({ ...page, language: 'de', trans_lang: null });
    await expect(loadPageEditorTranslation(emit, 'test', 'page-1')).resolves.toMatchObject({ contentLanguage: 'de', language: 'de' });
    expect(emit).toHaveBeenLastCalledWith('cmsAdminApiRequest', expect.objectContaining({ params: { pageId: 'page-1', language: 'de' } }));
    emit.mockClear();
    for (const value of ['../zh', '<script>', 'zh?x=1', 'a'.repeat(36)]) {
      expect(() => normalizePageLanguage(value)).toThrow('PAGE_EDITOR_LANGUAGE_INVALID');
      await expect(loadPageEditorTranslation(emit, 'test', 'page-1', value)).rejects.toThrow('PAGE_EDITOR_LANGUAGE_INVALID');
    }
    expect(emit).not.toHaveBeenCalled();
    expect(normalizePageLanguage('zh-Hant')).toBe('zh-hant');
  });

  it('refreshes selected-locale cache before reading shared metadata', async () => {
    const clear = jest.fn(); const load = jest.fn().mockImplementation(async () => {
      expect(clear).toHaveBeenCalledWith('cmsAdminApiRequest', expect.objectContaining({ params: { pageId: 'page-1', language: 'zh' } }));
      return page;
    });
    await loadPageEditorTranslation(undefined, null, 'page-1', 'zh', { clear, load });
  });

  it('reads Mongo nested translations without falling back to the primary text', async () => {
    const emit = jest.fn().mockResolvedValue({ ...page, translation: { language: 'zh', title: '指南', html: '<p>中文</p>', css: 'p{}', meta_desc: '说明' } });
    await expect(loadPageEditorTranslation(emit, 'test', 'page-1', 'zh')).resolves.toMatchObject({ language: 'en', contentLanguage: 'zh', trans_lang: 'zh', trans_title: '指南', html: '<p>中文</p>', css: 'p{}', meta_desc: '说明' });
    emit.mockResolvedValue({ ...page, translation: null });
    await expect(loadPageEditorTranslation(emit, 'test', 'page-1', 'zh')).resolves.toMatchObject({ trans_lang: null, trans_title: '', html: '', css: '' });
  });

  it('loads the explicit SPA editor id instead of the initial shell page', async () => {
    const load = jest.fn().mockResolvedValue(page);
    const initial = Promise.resolve({ id: 'wrong-shell-page' });
    await expect(loadPageEditorPage(undefined, null, '/admin/pages/edit/page-1', 'admin', initial, { load }))
      .resolves.toEqual(page);
    expect(load).toHaveBeenCalledWith('cmsAdminApiRequest', expect.objectContaining({ params: { pageId: 'page-1' } }));
    load.mockResolvedValue({ id: 'wrong-shell-page' });
    await expect(loadPageEditorPage(undefined, null, '/admin/pages/edit/page-1', 'admin', initial, { load }))
      .rejects.toThrow('PAGE_EDITOR_PAGE_MISMATCH');
  });

  it('rejects invalid route ids before requesting or displaying another record', async () => {
    const load = jest.fn();
    for (const id of ['%ZZ', 'one/two', '%2F']) {
      await expect(loadPageEditorPage(undefined, null, `/admin/pages/edit/${id}`, 'admin', undefined, { load }))
        .rejects.toThrow('PAGE_EDITOR_ID_INVALID');
    }
    expect(load).not.toHaveBeenCalled();
  });
  it('normalizes pages, templates, and primitive values', () => {
    expect(toPage({ id: '1' })).toEqual({ id: '1' });
    expect(toPage(null)).toBeNull();
    expect(asString(null)).toBe('');
    expect(asString(42)).toBe('42');
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('nope')).toBe('nope');
  });

  it('builds updatePage payloads from form values and existing page metadata', () => {
    expect(buildPageUpdatePayload('admin-token', page, values)).toEqual({
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'update',
      params: {
        pageId: 'page-1',
        slug: 'new-slug',
        status: 'published',
        seo_image: '/new.png',
        parent_id: null,
        is_content: true,
        lane: 'public',
        language: 'en',
        title: 'New Title',
        translations: [{
          language: 'en',
          title: 'New Title',
          html: '<p>Body</p>',
          css: '.body{}',
          metaDesc: 'Description',
          seoTitle: 'SEO Old',
          seoKeywords: 'old,keywords'
        }],
        meta: {
          keep: true,
          featuredImage: '',
          publish_at: '2026-06-17T12:00',
          layoutTemplate: 'old-layout'
        }
      }
    });
  });

  it('saves page editor changes and clears the page cache contract', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    const loader = { clear: jest.fn() };

    await savePageEditorPage(emit, 'admin-token', page, values);
    clearPageEditorCache(loader, page);

    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', expect.objectContaining({
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'update',
      params: expect.objectContaining({
        pageId: 'page-1',
        slug: 'new-slug'
      })
    }));
    expect(loader.clear).toHaveBeenCalledWith('cmsAdminApiRequest', {
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'get',
      params: { pageId: 'page-1' }
    });
  });
});
