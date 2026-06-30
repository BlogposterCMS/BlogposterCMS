/**
 * @jest-environment jsdom
 */

import {
  buildDefaultDesignTitle,
  buildDraftDesignRecord,
  createDraftDesign,
  decodeAdminId,
  designIdFromResult,
  fetchContentDesigns,
  fetchUploadedContentPages,
  toDesigns,
  toPages,
  uploadedContentPages
} from '../ui/widgets/plainspace/admin/defaultwidgets/contentSummaryData';

describe('contentSummaryData', () => {
  it('normalizes design and page responses', () => {
    expect(toDesigns({ designs: [{ id: 'd1' }, null, 'bad'] })).toEqual([{ id: 'd1' }]);
    expect(toPages({ data: [{ slug: 'home' }, 42] })).toEqual([{ slug: 'home' }]);
    expect(uploadedContentPages({
      data: [
        { slug: 'upload', is_content: true, lane: 'public', meta: {} },
        { slug: 'layout', is_content: true, lane: 'public', meta: { layoutTemplate: 'x' } },
        { slug: 'admin', is_content: true, lane: 'admin', meta: {} }
      ]
    })).toEqual([{ slug: 'upload', is_content: true, lane: 'public', meta: {} }]);
  });

  it('decodes admin ids from supported token payload shapes', () => {
    const encode = (payload: object) => `header.${Buffer.from(JSON.stringify(payload)).toString('base64')}.sig`;

    expect(decodeAdminId(encode({ userId: 'u1' }), value => Buffer.from(value, 'base64').toString('utf8'))).toBe('u1');
    expect(decodeAdminId(encode({ user: { id: 42 } }), value => Buffer.from(value, 'base64').toString('utf8'))).toBe(42);
    expect(decodeAdminId('bad.token', value => Buffer.from(value, 'base64').toString('utf8'))).toBeNull();
  });

  it('builds draft design payloads and reads save results', () => {
    expect(buildDefaultDesignTitle(new Date('2026-06-17T10:30:00.000Z'), 'en-US'))
      .toContain('New Design');
    expect(buildDraftDesignRecord('owner-1', 'New Design')).toEqual({
      id: null,
      title: 'New Design',
      description: '',
      thumbnail: '',
      ownerId: 'owner-1',
      bgColor: '',
      bgMediaId: '',
      bgMediaUrl: '',
      version: 0,
      isLayout: false,
      isGlobal: false,
      isDraft: true
    });
    expect(designIdFromResult({ designId: 'd2' })).toBe('d2');
    expect(designIdFromResult({})).toBeNull();
  });

  it('fetches content designs and uploaded content pages', async () => {
    const emit = jest.fn(async (_eventName, payload) => {
      const route = `${payload.resource}.${payload.action}`;
      if (route === 'designer.list') return { designs: [{ id: 'd1' }] };
      if (route === 'pages.list') return { data: [{ slug: 'upload', is_content: true, lane: 'public', meta: {} }] };
      return undefined;
    });

    await expect(fetchContentDesigns(emit, 'admin-token')).resolves.toEqual([{ id: 'd1' }]);
    await expect(fetchUploadedContentPages(emit, 'admin-token'))
      .resolves.toEqual([{ slug: 'upload', is_content: true, lane: 'public', meta: {} }]);
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
      resource: 'pages',
      action: 'list',
      params: {}
    });
  });

  it('creates draft designs through the Designer contract', async () => {
    const emit = jest.fn().mockResolvedValue({ id: 'new-design' });

    await expect(createDraftDesign(emit, 'admin-token', 'owner-1', new Date('2026-06-17T10:30:00.000Z')))
      .resolves.toBe('new-design');
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', expect.objectContaining({
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'designer',
      action: 'save',
      params: expect.objectContaining({
        design: expect.objectContaining({
          id: null,
          ownerId: 'owner-1',
          isDraft: true
        }),
        widgets: [],
        layout: null
      })
    }), 20000);
  });

  it('fails with a searchable error code when the emitter is missing', async () => {
    await expect(fetchContentDesigns(undefined as never, 'admin-token'))
      .rejects.toThrow('PLAINSPACE_CONTENT_SUMMARY_EMITTER_UNAVAILABLE');
  });
});
