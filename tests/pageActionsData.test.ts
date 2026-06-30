/**
 * @jest-environment jsdom
 */

import {
  createPublicPage,
  errorMessage,
  savePublicLayoutTemplate
} from '../ui/shell/dashboard/pageActionsData';

describe('pageActionsData', () => {
  it('creates public pages through the runtime admin facade and returns the created id', async () => {
    const emit = jest.fn().mockResolvedValue({ pageId: 'page-1' });

    await expect(createPublicPage(emit, 'admin-token', 'Landing', 'landing'))
      .resolves.toBe('page-1');

    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'pages',
      action: 'create',
      params: {
        title: 'Landing',
        slug: 'landing',
        lane: 'public',
        status: 'published'
      }
    });
  });

  it('returns null when page creation does not include a page id', async () => {
    const emit = jest.fn().mockResolvedValue({});

    await expect(createPublicPage(emit, 'admin-token', 'Landing', 'landing'))
      .resolves.toBeNull();
  });

  it('saves public layout templates through the runtime admin facade', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await savePublicLayoutTemplate(emit, 'admin-token', '  Hero Layout  ');

    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'plainSpace',
      action: 'saveLayoutTemplate',
      params: {
        name: 'Hero Layout',
        lane: 'public',
        viewport: 'desktop',
        layout: [],
        previewPath: ''
      }
    });
  });

  it('fails with a searchable error code when the emitter is missing', async () => {
    await expect(createPublicPage(undefined as never, 'admin-token', 'Landing', 'landing'))
      .rejects.toThrow('SHELL_PAGE_ACTIONS_EMITTER_UNAVAILABLE');
    await expect(savePublicLayoutTemplate(undefined as never, 'admin-token', 'Layout'))
      .rejects.toThrow('SHELL_PAGE_ACTIONS_EMITTER_UNAVAILABLE');
  });

  it('formats unknown errors for dashboard alerts', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('bad')).toBe('bad');
  });
});
