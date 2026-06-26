/**
 * @jest-environment jsdom
 */

import {
  dispatchAppLifecycleMessage,
  dispatchAppMeltdownBatch,
  dispatchAppMeltdownRequest,
  objectPayload,
  unwrapAppEventResult
} from '../ui/shell/apps/appFrameLoaderData';

describe('appFrameLoaderData', () => {
  it('normalizes payloads and unwraps app event results', () => {
    expect(objectPayload({ id: 'design-1' })).toEqual({ id: 'design-1' });
    expect(objectPayload(['bad'])).toEqual({});
    expect(objectPayload(null)).toEqual({});
    expect(unwrapAppEventResult({ data: { ok: true } })).toEqual({ ok: true });
    expect(unwrapAppEventResult({ ok: true })).toEqual({ ok: true });
  });

  it('dispatches single bridge requests through appLoader', async () => {
    const emit = jest.fn().mockResolvedValue({ data: { id: 'design-1' } });

    await expect(dispatchAppMeltdownRequest(
      emit,
      'admin-token',
      'designer',
      'designer.getDesign',
      { id: 'design-1' }
    )).resolves.toEqual({ id: 'design-1' });

    expect(emit).toHaveBeenCalledWith('dispatchAppEvent', {
      jwt: 'admin-token',
      moduleName: 'appLoader',
      moduleType: 'core',
      appName: 'designer',
      event: 'cms-meltdown-request',
      data: {
        eventName: 'designer.getDesign',
        payload: { id: 'design-1' }
      }
    });
  });

  it('dispatches bridge batches through appLoader', async () => {
    const emit = jest.fn().mockResolvedValue({ data: [{ ok: true }] });
    const events = [{ eventName: 'designer.listDesigns' }];

    await expect(dispatchAppMeltdownBatch(emit, 'admin-token', 'designer', events))
      .resolves.toEqual([{ ok: true }]);
    expect(emit).toHaveBeenCalledWith('dispatchAppEvent', {
      jwt: 'admin-token',
      moduleName: 'appLoader',
      moduleType: 'core',
      appName: 'designer',
      event: 'cms-meltdown-batch-request',
      data: { events }
    });
  });

  it('dispatches lifecycle messages through appLoader', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await dispatchAppLifecycleMessage(emit, 'admin-token', 'designer', 'designer-ready', { ready: true });

    expect(emit).toHaveBeenCalledWith('dispatchAppEvent', {
      jwt: 'admin-token',
      moduleName: 'appLoader',
      moduleType: 'core',
      appName: 'designer',
      event: 'designer-ready',
      data: { ready: true }
    });
  });

  it('fails with searchable errors for missing emitters and event names', async () => {
    await expect(dispatchAppMeltdownRequest(undefined as never, 'admin-token', 'designer', 'event', {}))
      .rejects.toThrow('SHELL_APP_FRAME_EMITTER_UNAVAILABLE');
    await expect(dispatchAppMeltdownRequest(jest.fn(), 'admin-token', 'designer', ' ', {}))
      .rejects.toThrow('SHELL_APP_FRAME_EVENT_NAME_MISSING');
  });
});
