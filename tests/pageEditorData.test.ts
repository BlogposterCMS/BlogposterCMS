/**
 * @jest-environment jsdom
 */

import {
  asString,
  buildPageUpdatePayload,
  clearPageEditorCache,
  errorMessage,
  loadPageEditorPage,

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
