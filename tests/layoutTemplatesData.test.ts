/**
 * @jest-environment jsdom
 */

import {
  buildTemplateViews,
  createBlankLayoutTemplate,
  errorMessage,
  fetchLayoutTemplateNames,
  fetchPublicPages,
  toPages,
  toTemplateNames
} from '../ui/widgets/plainspace/admin/layoutTemplatesData';

describe('layoutTemplatesData', () => {
  it('normalizes template and page payloads', () => {
    expect(toTemplateNames({
      templates: [
        'Landing',
        { name: 'Article', previewPath: '/preview.png' },
        { title: 'bad' },
        null
      ]
    })).toEqual([
      { name: 'Landing' },
      { name: 'Article', previewPath: '/preview.png' }
    ]);
    expect(toPages({
      pages: [
        { title: 'Home', meta: { layoutTemplate: 'Landing' } },
        null,
        'bad'
      ]
    })).toEqual([{ title: 'Home', meta: { layoutTemplate: 'Landing' } }]);
    expect(toPages([{ title: 'About' }])).toEqual([{ title: 'About' }]);
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('nope')).toBe('nope');
  });

  it('builds template views with page usage labels', () => {
    expect(buildTemplateViews(
      [
        { name: 'Landing', previewPath: '/landing.png' },
        { name: 'Article' },
        { name: 'Unused' }
      ],
      [
        { title: 'Home', meta: { layoutTemplate: 'Landing' } },
        { meta: { layoutTemplate: 'Article' } },
        { title: 'Post', meta: { layoutTemplate: 'Article' } }
      ]
    )).toEqual([
      { name: 'Landing', previewPath: '/landing.png', usedPages: ['Home'] },
      { name: 'Article', previewPath: '', usedPages: ['Unnamed', 'Post'] },
      { name: 'Unused', previewPath: '', usedPages: [] }
    ]);
  });

  it('fetches layout template names and public pages', async () => {
    const emit = jest.fn(async eventName => (
      eventName === 'getLayoutTemplateNames'
        ? { templates: ['Landing'] }
        : { pages: [{ title: 'Home' }] }
    ));

    await expect(fetchLayoutTemplateNames(emit, 'admin-token')).resolves.toEqual([{ name: 'Landing' }]);
    await expect(fetchPublicPages(emit, 'admin-token')).resolves.toEqual([{ title: 'Home' }]);
    expect(emit).toHaveBeenCalledWith('getLayoutTemplateNames', {
      jwt: 'admin-token',
      moduleName: 'plainspace',
      moduleType: 'core',
      lane: 'public'
    });
    expect(emit).toHaveBeenCalledWith('getPagesByLane', {
      jwt: 'admin-token',
      moduleName: 'pagesManager',
      moduleType: 'core',
      lane: 'public'
    });
  });

  it('creates blank public desktop layout templates', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await createBlankLayoutTemplate(emit, 'admin-token', ' Landing ', '/preview.png');

    expect(emit).toHaveBeenCalledWith('saveLayoutTemplate', {
      jwt: 'admin-token',
      moduleName: 'plainspace',
      moduleType: 'core',
      name: 'Landing',
      lane: 'public',
      viewport: 'desktop',
      layout: [],
      previewPath: '/preview.png'
    });
  });
});
