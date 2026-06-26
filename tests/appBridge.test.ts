/**
 * @jest-environment jsdom
 */

import {
  APP_BRIDGE_REQUEST,
  APP_BRIDGE_RESPONSE,
  _resetAppBridgeForTests,
  installAppBridge
} from '../ui/shared/apps/appBridge';

function tick(): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, 0));
}

function dispatchParentMessage(parentWindow: Window, data: Record<string, unknown>): void {
  window.dispatchEvent(new MessageEvent('message', {
    data,
    origin: 'https://admin.example.com',
    source: parentWindow
  }));
}

describe('shared app bridge', () => {
  let originalParent: Window;
  let originalFetch: typeof window.fetch | undefined;

  beforeEach(() => {
    _resetAppBridgeForTests();
    jest.restoreAllMocks();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    delete window.meltdownEmit;
    delete window.meltdownEmitBatch;
    delete window.blogposterAgent;
    delete window.__blogposterAppBridgeFetchInstalled;
    delete (window as any).__BLOGPOSTER_APP_INIT_TOKENS__;
    (window as any).CSRF_TOKEN = undefined;
    (window as any).ADMIN_TOKEN = undefined;
    originalParent = window.parent;
    originalFetch = window.fetch;
  });

  afterEach(() => {
    _resetAppBridgeForTests();
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: originalParent
    });
    window.fetch = originalFetch as typeof window.fetch;
  });

  test('installs the generic bridge and auto-starts an opt-in agent surface', async () => {
    document.head.innerHTML = [
      '<meta name="agent-snapshot-interval" content="0">',
      '<meta name="agent-poll-interval" content="0">'
    ].join('');
    document.body.innerHTML = '<input data-agent-id="site-title" value="">';

    const parentWindow = {
      postMessage: jest.fn()
    } as unknown as Window;
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: parentWindow
    });

    installAppBridge();
    dispatchParentMessage(parentWindow, {
      type: 'init-tokens',
      appBridge: true,
      appName: 'settings',
      csrfToken: 'csrf-token',
      adminToken: null,
      agentSurface: {
        surfaceId: 'settings.main',
        title: 'Settings',
        surfaceType: 'settings-surface'
      },
      allowedOrigins: ['https://admin.example.com']
    });

    await tick();

    expect(typeof window.meltdownEmit).toBe('function');
    expect((window as any).CSRF_TOKEN).toBe('csrf-token');
    expect((window as any).ADMIN_TOKEN).toBeNull();
    expect((window as any).__BLOGPOSTER_APP_INIT_TOKENS__).toEqual(expect.objectContaining({
      type: 'init-tokens',
      appName: 'settings',
      csrfToken: 'csrf-token'
    }));
    expect(window.blogposterAgent?.appBridgeSurface).toBeTruthy();
    expect(parentWindow.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: APP_BRIDGE_REQUEST,
      eventName: 'agent.publishSurfaceSnapshot',
      payload: expect.objectContaining({
        appName: 'settings',
        surfaceId: 'settings.main',
        title: 'Settings',
        surfaceType: 'settings-surface',
        actions: expect.arrayContaining([
          expect.objectContaining({ action: 'dom.setValue' })
        ])
      })
    }), 'https://admin.example.com');

    const publishRequest = (parentWindow.postMessage as jest.Mock).mock.calls[0][0];
    dispatchParentMessage(parentWindow, {
      type: APP_BRIDGE_RESPONSE,
      requestId: publishRequest.requestId,
      ok: true,
      data: { ok: true }
    });
    await tick();

    expect(parentWindow.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: APP_BRIDGE_REQUEST,
      eventName: 'agent.pollSurfaceCommands',
      payload: expect.objectContaining({
        appName: 'settings',
        surfaceId: 'settings.main'
      })
    }), 'https://admin.example.com');

    const pollRequest = (parentWindow.postMessage as jest.Mock).mock.calls[1][0];
    dispatchParentMessage(parentWindow, {
      type: APP_BRIDGE_RESPONSE,
      requestId: pollRequest.requestId,
      ok: true,
      data: []
    });
    await tick();
  });

  test('does not start an agent surface without explicit opt-in', async () => {
    const parentWindow = {
      postMessage: jest.fn()
    } as unknown as Window;
    Object.defineProperty(window, 'parent', {
      configurable: true,
      value: parentWindow
    });

    installAppBridge();
    dispatchParentMessage(parentWindow, {
      type: 'init-tokens',
      appBridge: true,
      appName: 'plain-app'
    });
    await tick();

    expect(typeof window.meltdownEmit).toBe('function');
    expect(window.blogposterAgent?.appBridgeSurface).toBeUndefined();
    expect(parentWindow.postMessage).not.toHaveBeenCalled();
  });
});
