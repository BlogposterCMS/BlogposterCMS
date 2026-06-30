/**
 * @jest-environment jsdom
 */

import {
  createDebouncedEmitter,
  registerRuntimeWidgetEvents
} from '../ui/runtime/main/runtimeWidgetEvents';

describe('runtimeWidgetEvents', () => {
  beforeEach(() => {
    delete window.ADMIN_TOKEN;
    delete window.PUBLIC_TOKEN;
    delete window.meltdownEmit;
    delete window.meltdownEmitBatch;
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete window.ADMIN_TOKEN;
    delete window.PUBLIC_TOKEN;
    delete window.meltdownEmit;
    delete window.meltdownEmitBatch;
  });

  it('batches debounced widget instance events through meltdownEmitBatch', async () => {
    jest.useFakeTimers();
    window.meltdownEmitBatch = jest.fn().mockResolvedValue(['first', 'second']);
    const emit = createDebouncedEmitter(25);

    const first = emit('getWidgetInstance', { instanceId: 'a' });
    const second = emit('getWidgetInstance', { instanceId: 'b' });

    await jest.advanceTimersByTimeAsync(25);

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(window.meltdownEmitBatch).toHaveBeenCalledTimes(1);
    expect(window.meltdownEmitBatch).toHaveBeenCalledWith([
      { eventName: 'getWidgetInstance', payload: { instanceId: 'a' } },
      { eventName: 'getWidgetInstance', payload: { instanceId: 'b' } }
    ]);
  });

  it('registers sanitized widget API actions with lane auth', async () => {
    window.ADMIN_TOKEN = 'admin-token';
    window.meltdownEmit = jest.fn().mockResolvedValue(undefined);

    await registerRuntimeWidgetEvents(
      {
        id: 'hero',
        metadata: {
          apiActions: [
            { resource: 'content', action: 'list' },
            { resource: 'bad event', action: 'list' },
            { resource: 'content', action: 'a'.repeat(65) },
            { resource: 'widgets', action: 'registerUsage' }
          ]
        }
      },
      'admin'
    );

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

  it('skips widget API registration without a token or valid actions', async () => {
    window.PUBLIC_TOKEN = 'public-token';
    window.meltdownEmit = jest.fn().mockResolvedValue(undefined);

    await registerRuntimeWidgetEvents(
      { id: 'empty', metadata: { apiActions: [{ resource: 'bad event', action: 'list' }] } },
      'public'
    );
    expect(window.meltdownEmit).not.toHaveBeenCalled();

    delete window.PUBLIC_TOKEN;
    await registerRuntimeWidgetEvents(
      { id: 'valid', metadata: { apiActions: [{ resource: 'content', action: 'list' }] } },
      'public'
    );
    expect(window.meltdownEmit).not.toHaveBeenCalled();
  });
});
