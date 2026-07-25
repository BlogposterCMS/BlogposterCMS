/**
 * @jest-environment jsdom
 */

import {
  getBuilderViewportState,
  hydrateBuilderViewportState,
  resetBuilderViewportStateForTests,
  setBuilderFitZoom,
  setBuilderViewportPreset,
  setBuilderViewportWidth,
  setBuilderZoom,
  subscribeBuilderViewport
} from '../ui/designer/app/renderer/viewportState';

describe('Designer viewport state', () => {
  beforeEach(() => {
    jest.useRealTimers();
    window.localStorage.clear();
    delete (window as any).__BLOGPOSTER_APP_INIT_TOKENS__;
    delete (window as any).meltdownEmit;
    resetBuilderViewportStateForTests();
  });

  it('uses one state for exact widths, presets and zoom', () => {
    const snapshots: ReturnType<typeof getBuilderViewportState>[] = [];
    const unsubscribe = subscribeBuilderViewport(snapshot => snapshots.push(snapshot));

    expect(setBuilderViewportPreset('tablet')).toMatchObject({
      width: 820,
      presetId: 'tablet'
    });
    expect(setBuilderViewportWidth(1000)).toMatchObject({
      width: 1000,
      presetId: 'custom'
    });
    expect(setBuilderZoom(135)).toMatchObject({ zoom: 135 });
    expect(getBuilderViewportState().zoomMode).toBe('manual');
    expect(setBuilderFitZoom(92)).toMatchObject({ zoom: 92, zoomMode: 'fit' });

    expect(snapshots.at(-1)).toEqual(getBuilderViewportState());
    expect(JSON.parse(window.localStorage.getItem('blogposter.designer.viewport.v1') || '{}')).toEqual(
      getBuilderViewportState()
    );
    unsubscribe();
  });

  it('clamps unsafe viewport and zoom values', () => {
    expect(setBuilderViewportWidth(10).width).toBe(320);
    expect(setBuilderViewportWidth(9999).width).toBe(3840);
    expect(setBuilderZoom(1).zoom).toBe(10);
    expect(setBuilderZoom(999).zoom).toBe(500);
  });

  it('hydrates and persists through the parent AppBridge when sandbox storage is unavailable', async () => {
    jest.useFakeTimers();
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw Object.assign(new Error('Opaque origin'), { name: 'SecurityError' });
    });
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Object.assign(new Error('Opaque origin'), { name: 'SecurityError' });
    });
    (window as any).__BLOGPOSTER_APP_INIT_TOKENS__ = { appBridge: true };
    (window as any).meltdownEmit = jest.fn(async (eventName: string) => {
      if (eventName === 'appPreference.get') {
        return { found: true, value: { width: 820, zoom: 125 } };
      }
      return { stored: true };
    });

    await expect(hydrateBuilderViewportState()).resolves.toMatchObject({
      width: 820,
      presetId: 'tablet',
      zoom: 125
    });
    setBuilderViewportWidth(940);
    jest.advanceTimersByTime(120);
    await Promise.resolve();

    expect((window as any).meltdownEmit).toHaveBeenCalledWith('appPreference.set', {
      key: 'viewport',
      value: {
        width: 940,
        presetId: 'custom',
        zoom: 125,
        zoomMode: 'fit'
      }
    });
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
