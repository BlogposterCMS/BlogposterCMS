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
    delete (window as any).ADMIN_TOKEN;
    if (originalParent) {
      Object.defineProperty(window, 'parent', originalParent);
    }
  });

  test('waits for app bridge init tokens before loading fonts in sandboxed app frames', async () => {
    const emit = jest.fn(async (eventName: string, payload?: Record<string, unknown>) => {
      if (eventName === 'cmsAdminApiRequest' && payload?.action === 'list') {
        return {
          resource: 'fonts',
          action: 'list',
          data: [{ name: 'Work Sans', url: 'https://fonts.example/work-sans.css' }]
        };
      }
      if (eventName === 'cmsAdminApiRequest' && payload?.action === 'listProviders') {
        return {
          resource: 'fonts',
          action: 'listProviders',
          data: [{ name: 'googleFonts' }]
        };
      }
      return [];
    });
    (window as any).meltdownEmit = emit;
    const fontsUpdated = jest.fn();
    document.addEventListener('fontsUpdated', fontsUpdated);

    expect(document.querySelector('script[src*="/build/appBridge.js"], script[src$="appBridge.js"]')).not.toBeNull();

    await import('../ui/shared/loaders/fontsLoader');

    expect(emit).not.toHaveBeenCalled();

    (window as any).__BLOGPOSTER_APP_INIT_TOKENS__ = {
      type: 'init-tokens',
      adminToken: 'admin-token'
    };
    (window as any).ADMIN_TOKEN = 'admin-token';
    await jest.advanceTimersByTimeAsync(50);
    await Promise.resolve();

    expect(emit).not.toHaveBeenCalledWith('issuePublicToken', expect.anything());
    expect(emit).toHaveBeenNthCalledWith(1, 'cmsAdminApiRequest', expect.objectContaining({
      jwt: 'admin-token',
      resource: 'fonts',
      action: 'list'
    }));
    expect(emit).toHaveBeenNthCalledWith(2, 'cmsAdminApiRequest', expect.objectContaining({
      jwt: 'admin-token',
      resource: 'fonts',
      action: 'listProviders'
    }));
    expect((window as any).AVAILABLE_FONTS).toEqual(['Work Sans']);
    expect((window as any).FONT_SOURCES).toEqual({
      'Work Sans': 'https://fonts.example/work-sans.css'
    });
    expect(fontsUpdated).toHaveBeenCalledWith(expect.objectContaining({
      detail: { fonts: ['Work Sans'] }
    }));
  });
});
