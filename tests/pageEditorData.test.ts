/**
 * @jest-environment jsdom
 */

import {
  asString,
  buildPageUpdatePayload,
  clearPageEditorCache,
  errorMessage,
  fetchPageEditorTemplates,
  savePageEditorPage,
  toPage,
  toTemplates,
  visibleTemplates
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
  it('normalizes pages, templates, and primitive values', () => {
    expect(toPage({ id: '1' })).toEqual({ id: '1' });
    expect(toPage(null)).toBeNull();
    expect(toTemplates({
      templates: ['Landing', { name: 'Global', isGlobal: true }, null]
    })).toEqual([
      { name: 'Landing' },
      { name: 'Global', isGlobal: true }
    ]);
    expect(visibleTemplates({ templates: [{ name: 'Global', isGlobal: true }] }))
      .toEqual([{ name: 'default' }]);
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
          publish_at: '2026-06-17T12:00',
          layoutTemplate: 'landing'
        }
      }
    });
  });

  it('fetches non-global layout templates for the page lane', async () => {
    const emit = jest.fn().mockResolvedValue({
      templates: [
        { name: 'Global', isGlobal: true },
        { name: 'Landing' }
      ]
    });

    await expect(fetchPageEditorTemplates(emit, 'admin-token', 'public'))
      .resolves.toEqual([{ name: 'Landing' }]);
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'plainSpace',
      action: 'layoutTemplateNames',
      params: { lane: 'public' }
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
