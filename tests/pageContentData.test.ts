/**
 * @jest-environment jsdom
 */

import {
  attachDesignMeta,
  attachHtmlMeta,
  buildPageContentUpdatePayload,
  clearPageContentCache,
  detachDesignMeta,
  detachHtmlMeta,
  errorMessage,
  fetchBuilderApps,
  fetchHtmlFile,
  fetchPublishedDesigns,
  htmlFileUrl,
  isHtmlFileName,
  listHtmlFiles,
  savePageContent,
  toBuilderApps,
  toDesigns,
  toFiles,
  toPage,
  uploadHtmlFile,
  visibleDesigns
} from '../ui/widgets/plainspace/admin/pageEditorWidgets/pageContentData';

const page = {
  id: 'page-1',
  slug: 'home',
  status: 'draft',
  seo_image: '/seo.png',
  parent_id: null,
  is_content: true,
  lane: 'public',
  language: 'en',
  title: 'Home',
  html: '<p>Old</p>',
  css: '.old{}',
  meta: {
    keep: true,
    layoutTemplate: 'landing',
    designId: 'design-1',
    designTitle: 'Old Design',
    designThumbnail: '/old.png',
    htmlFileName: 'old.html'
  }
};

describe('pageContentData', () => {
  it('normalizes page content payloads', () => {
    expect(toPage({ id: '1' })).toEqual({ id: '1' });
    expect(toPage(null)).toBeNull();
    expect(toDesigns({ designs: [{ id: 'd1' }, null, 'bad'] })).toEqual([{ id: 'd1' }]);
    expect(visibleDesigns({ designs: [{ id: 'd1' }, { id: 'd2', is_draft: true }] }))
      .toEqual([{ id: 'd1' }]);
    expect(toFiles({ files: ['a.html', 42, 'b.txt'] })).toEqual(['a.html', 'b.txt']);
    expect(isHtmlFileName('index.html')).toBe(true);
    expect(isHtmlFileName('snippet.htm')).toBe(true);
    expect(isHtmlFileName('notes.txt')).toBe(false);
    expect(toBuilderApps({ apps: [{ name: 'designer' }, { title: 'bad' }] }))
      .toEqual([{ name: 'designer' }]);
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('nope')).toBe('nope');
  });

  it('builds metadata transitions without leaking stale attachment state', () => {
    expect(detachDesignMeta(page)).toEqual({ keep: true });
    expect(attachDesignMeta(page, { id: 'design-2', title: 'Design 2', thumbnail: '/d2.png' }))
      .toEqual({
        keep: true,
        designId: 'design-2',
        designTitle: 'Design 2',
        designThumbnail: '/d2.png'
      });
    expect(detachHtmlMeta(page)).toEqual({
      keep: true,
      layoutTemplate: 'landing',
      designId: 'design-1',
      designTitle: 'Old Design',
      designThumbnail: '/old.png'
    });
    expect(attachHtmlMeta(page, 'content.html')).toEqual({
      keep: true,
      htmlFileName: 'content.html'
    });
  });

  it('builds page update payloads and cache clear contracts', () => {
    const meta = attachHtmlMeta(page, 'content.html');
    expect(buildPageContentUpdatePayload('admin-token', page, {
      html: '<h1>New</h1>',
      meta
    })).toEqual({
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'update',
      params: {
        pageId: 'page-1',
        slug: 'home',
        status: 'draft',
        seo_image: '/seo.png',
        parent_id: null,
        is_content: true,
        lane: 'public',
        language: 'en',
        title: 'Home',
        translations: [{
          language: 'en',
          title: 'Home',
          html: '<h1>New</h1>',
          css: '.old{}'
        }],
        meta
      }
    });

    const loader = { clear: jest.fn() };
    clearPageContentCache(loader, page);
    expect(loader.clear).toHaveBeenCalledWith('cmsAdminApiRequest', {
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'get',
      params: { pageId: 'page-1' }
    });
  });

  it('fetches builder apps, published designs, and HTML file listings', async () => {
    const emit = jest.fn(async (_eventName, payload) => {
      const route = `${payload.resource}.${payload.action}`;
      if (route === 'apps.builderList') return { apps: [{ name: 'designer' }] };
      if (route === 'designer.list') return { designs: [{ id: 'd1' }, { id: 'd2', is_draft: true }] };
      if (route === 'media.listLocalFolder') return { files: ['a.html', 'b.txt', 'c.htm'] };
      return undefined;
    });

    await expect(fetchBuilderApps(emit, 'admin-token')).resolves.toEqual([{ name: 'designer' }]);
    await expect(fetchPublishedDesigns(emit, 'admin-token')).resolves.toEqual([{ id: 'd1' }]);
    await expect(listHtmlFiles(emit, 'admin-token')).resolves.toEqual(['a.html', 'c.htm']);
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'apps',
      action: 'builderList',
      params: {}
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'designer',
      action: 'list',
      params: {}
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'media',
      action: 'createLocalFolder',
      params: {
        currentPath: 'public',
        newFolderName: 'page-content'
      }
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'media',
      action: 'listLocalFolder',
      params: { subPath: 'public/page-content' }
    });
  });

  it('fetches and uploads HTML files through stable media paths', async () => {
    expect(htmlFileUrl('my file.html')).toBe('/media/page-content/my%20file.html');
    const fetchImpl = jest.fn().mockResolvedValue({ text: jest.fn().mockResolvedValue('<h1>Hello</h1>') });
    await expect(fetchHtmlFile(fetchImpl, 'my file.html')).resolves.toBe('<h1>Hello</h1>');
    expect(fetchImpl).toHaveBeenCalledWith('/media/page-content/my%20file.html');

    const emit = jest.fn(async (_eventName, payload) => (
      `${payload.resource}.${payload.action}` === 'media.uploadToFolder'
        ? { fileName: 'saved.html' }
        : undefined
    ));
    await expect(uploadHtmlFile(emit, 'admin-token', 'source.html', '<h1>Hello</h1>'))
      .resolves.toBe('saved.html');
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', expect.objectContaining({
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'media',
      action: 'uploadToFolder',
      params: expect.objectContaining({
        subPath: 'public/page-content',
        fileName: 'source.html',
        fileData: expect.any(String),
        mimeType: 'text/html'
      })
    }));
  });

  it('saves page content through updatePage', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);
    const meta = attachDesignMeta(page, { id: 'd2', title: 'D2' });

    await savePageContent(emit, 'admin-token', page, { html: '', meta });

    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', expect.objectContaining({
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'update',
      params: expect.objectContaining({
        pageId: 'page-1',
        translations: [{
          language: 'en',
          title: 'Home',
          html: '',
          css: '.old{}'
        }],
        meta
      })
    }));
  });
});
