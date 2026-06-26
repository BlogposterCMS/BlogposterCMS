/**
 * @jest-environment jsdom
 */

describe('fonts loader app bridge startup', () => {
  const originalParent = Object.getOwnPropertyDescriptor(window, 'parent');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetModules();
    document.body.innerHTML = '';
    const bridgeScript = document.createElement('script');
    bridgeScript.src = '/build/appBridge.js';
    document.body.appendChild(bridgeScript);
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'complete'
    });
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: {}
    });
    delete (window as any).__BLOGPOSTER_APP_INIT_TOKENS__;
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (window as any).meltdownEmit;
    delete (window as any).__BLOGPOSTER_APP_INIT_TOKENS__;
    if (originalParent) {
      Object.defineProperty(window, 'parent', originalParent);
    }
  });

  test('waits for app bridge init tokens before loading fonts in sandboxed app frames', async () => {
    const emit = jest.fn(async (eventName: string) => {
      if (eventName === 'issuePublicToken') return 'public-token';
      if (eventName === 'listFonts') return { data: [] };
      if (eventName === 'listFontProviders') return { data: [] };
      return [];
    });
    (window as any).meltdownEmit = emit;
    const fontsUpdated = jest.fn();
    document.addEventListener('fontsUpdated', fontsUpdated);

    expect(document.querySelector('script[src*="/build/appBridge.js"], script[src$="appBridge.js"]')).not.toBeNull();

    await import('../ui/shared/loaders/fontsLoader');

    expect(emit).not.toHaveBeenCalled();

    (window as any).__BLOGPOSTER_APP_INIT_TOKENS__ = { type: 'init-tokens' };
    await jest.advanceTimersByTimeAsync(50);
    await Promise.resolve();

    expect(emit).not.toHaveBeenCalledWith('issuePublicToken', expect.anything());
    expect(emit).not.toHaveBeenCalledWith('listFonts', expect.anything());
    expect(emit).not.toHaveBeenCalledWith('listFontProviders', expect.anything());
    expect((window as any).AVAILABLE_FONTS).toEqual([]);
    expect(fontsUpdated).toHaveBeenCalledWith(expect.objectContaining({
      detail: { fonts: [] }
    }));
  });
});
