/**
 * @jest-environment jsdom
 */

import {
  createDebouncedEmitter
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

});
