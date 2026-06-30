/**
 * @jest-environment jsdom
 */

import { registerWidgetEvents } from '../ui/widgets/rendering/widgetEvents';

describe('widgetEvents', () => {
  beforeEach(() => {
    window.ADMIN_TOKEN = 'admin-token';
    window.PUBLIC_TOKEN = 'public-token';
    window.meltdownEmit = jest.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.ADMIN_TOKEN;
    delete window.PUBLIC_TOKEN;
    delete window.meltdownEmit;
  });

  it('registers valid widget API actions with the active token', async () => {
    await registerWidgetEvents({
      id: 'hero',
      metadata: {
        apiActions: [
          { resource: 'content', action: 'list' },
          { resource: 'bad event', action: 'list' },
          { resource: 'widgets', action: 'registerUsage' },
          { resource: 'content', action: 'list' }
        ]
      }
    });

    expect(window.meltdownEmit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'widgets',
      action: 'registerUsage',
      params: {
        actions: [
          { resource: 'content', action: 'list' },
          { resource: 'widgets', action: 'registerUsage' }
        ]
      }
    });
  });

  it('skips registration without actions, emitter, or token', async () => {
    await registerWidgetEvents({ id: 'empty', metadata: {} });
    expect(window.meltdownEmit).not.toHaveBeenCalled();

    delete window.ADMIN_TOKEN;
    delete window.PUBLIC_TOKEN;
    await registerWidgetEvents({
      id: 'no-token',
      metadata: { apiActions: [{ resource: 'content', action: 'list' }] }
    });
    expect(window.meltdownEmit).not.toHaveBeenCalled();

    delete window.meltdownEmit;
    await expect(
      registerWidgetEvents({
        id: 'no-emitter',
        metadata: { apiActions: [{ resource: 'content', action: 'list' }] }
      })
    ).resolves.toBeUndefined();
  });

  it('logs registration failures with widget context', async () => {
    const error = new Error('boom');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    window.meltdownEmit = jest.fn().mockRejectedValue(error);

    await registerWidgetEvents({
      id: 'broken',
      metadata: { apiActions: [{ resource: 'content', action: 'list' }] }
    });

    expect(warn).toHaveBeenCalledWith(
      '[Widgets] registerWidgetUsage failed for',
      'broken',
      error
    );
  });
});
