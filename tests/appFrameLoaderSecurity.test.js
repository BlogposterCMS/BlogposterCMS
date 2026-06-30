/**
 * @jest-environment jsdom
 */

const path = require('path');

describe('appFrameLoader postMessage security', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useRealTimers();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    window.CSRF_TOKEN = null;
    window.ADMIN_TOKEN = null;
    window.meltdownEmit = jest.fn(() => Promise.resolve());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('keeps admin token parent-side and filters message origins', async () => {
    document.head.innerHTML = [
      '<meta name="csrf-token" content="csrf123">',
      '<meta name="admin-token" content="admin456">',
      '<meta name="app-name" content="designer">',
      '<meta name="app-frame-allowed-origins" content="https://admin.example.com">'
    ].join('');

    const frame = document.createElement('iframe');
    frame.id = 'app-frame';
    frame.setAttribute('src', 'https://designer.example.com/index.html');
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-downloads allow-popups allow-modals');
    frame.dataset.allowedOrigins = 'https://admin.example.com';
    Object.defineProperty(frame, 'contentWindow', {
      configurable: true,
      value: {
        postMessage: jest.fn(),
        close: jest.fn()
      }
    });
    document.body.appendChild(frame);

    require(path.join(__dirname, '..', 'public', 'assets', 'js', 'appFrameLoader.js'));

    frame.dispatchEvent(new window.Event('load'));

    expect(frame.contentWindow.postMessage).toHaveBeenCalledWith({
      type: 'init-tokens',
      csrfToken: 'csrf123',
      adminToken: null,
      appBridge: true,
      appName: 'designer',
      allowedOrigins: ['https://admin.example.com']
    }, '*');
    frame.contentWindow.postMessage.mockClear();

    const untrustedEvent = new window.MessageEvent('message', {
      data: { type: 'designer-ready' },
      origin: 'https://evil.example.com',
      source: frame.contentWindow
    });
    window.dispatchEvent(untrustedEvent);
    await Promise.resolve();

    const nullOriginEvent = new window.MessageEvent('message', {
      data: { type: 'designer-ready' },
      origin: 'null',
      source: frame.contentWindow
    });
    window.dispatchEvent(nullOriginEvent);
    await Promise.resolve();

    expect(window.meltdownEmit).toHaveBeenCalledTimes(1);
    expect(window.meltdownEmit).toHaveBeenLastCalledWith('dispatchAppEvent', expect.objectContaining({
      event: 'designer-ready',
      jwt: 'admin456'
    }));

    const trustedEvent = new window.MessageEvent('message', {
      data: { type: 'designer-ready' },
      origin: 'https://admin.example.com',
      source: frame.contentWindow
    });
    window.dispatchEvent(trustedEvent);
    await Promise.resolve();

    expect(window.meltdownEmit).toHaveBeenCalledTimes(2);
    expect(window.meltdownEmit).toHaveBeenLastCalledWith('dispatchAppEvent', expect.objectContaining({
      event: 'designer-ready',
      jwt: 'admin456'
    }));
    window.meltdownEmit.mockClear();

    window.meltdownEmit.mockResolvedValueOnce({ data: { id: 'design-1' } });
    const bridgeEvent = new window.MessageEvent('message', {
      data: {
        type: 'cms-app-runtime-request',
        requestId: 17,
        eventName: 'designer.getDesign',
        payload: { id: 'design-1' }
      },
      origin: 'null',
      source: frame.contentWindow
    });
    window.dispatchEvent(bridgeEvent);
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(window.meltdownEmit).toHaveBeenCalledWith('dispatchAppEvent', expect.objectContaining({
      jwt: 'admin456',
      moduleName: 'appLoader',
      moduleType: 'core',
      appName: 'designer',
      event: 'cms-app-runtime-request',
      data: {
        eventName: 'designer.getDesign',
        payload: { id: 'design-1' }
      }
    }));
    expect(frame.contentWindow.postMessage).toHaveBeenCalledWith({
      type: 'cms-app-runtime-response',
      requestId: 17,
      ok: true,
      data: { id: 'design-1' }
    }, '*');
  });

  test('passes manifest agentSurface config to app iframes', () => {
    document.head.innerHTML = [
      '<meta name="csrf-token" content="csrf123">',
      '<meta name="admin-token" content="admin456">',
      '<meta name="app-name" content="settings">',
      '<meta name="app-agent-surface" content="{&quot;surfaceId&quot;:&quot;settings.main&quot;,&quot;title&quot;:&quot;Settings&quot;}">'
    ].join('');

    const frame = document.createElement('iframe');
    frame.id = 'app-frame';
    frame.setAttribute('src', '/apps/settings/index.html');
    Object.defineProperty(frame, 'contentWindow', {
      configurable: true,
      value: {
        postMessage: jest.fn(),
        close: jest.fn()
      }
    });
    document.body.appendChild(frame);

    require(path.join(__dirname, '..', 'public', 'assets', 'js', 'appFrameLoader.js'));

    frame.dispatchEvent(new window.Event('load'));

    expect(frame.contentWindow.postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'init-tokens',
      appBridge: true,
      appName: 'settings',
      agentSurface: {
        surfaceId: 'settings.main',
        title: 'Settings'
      }
    }), window.location.origin);
  });

  test('retries init tokens when the iframe load event was already missed', () => {
    jest.useFakeTimers();
    document.head.innerHTML = [
      '<meta name="csrf-token" content="csrf123">',
      '<meta name="admin-token" content="admin456">',
      '<meta name="app-name" content="designer">',
      '<meta name="app-frame-allowed-origins" content="https://admin.example.com">'
    ].join('');

    const frame = document.createElement('iframe');
    frame.id = 'app-frame';
    frame.setAttribute('src', '/apps/designer/index.html');
    frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-downloads allow-popups allow-modals');
    frame.dataset.allowedOrigins = 'https://admin.example.com';
    Object.defineProperty(frame, 'contentWindow', {
      configurable: true,
      value: {
        postMessage: jest.fn(),
        close: jest.fn()
      }
    });
    document.body.appendChild(frame);

    require(path.join(__dirname, '..', 'public', 'assets', 'js', 'appFrameLoader.js'));

    expect(frame.contentWindow.postMessage).not.toHaveBeenCalled();

    jest.advanceTimersByTime(0);
    expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(1);
    expect(frame.contentWindow.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'init-tokens',
      csrfToken: 'csrf123',
      adminToken: null,
      appBridge: true,
      appName: 'designer',
      allowedOrigins: ['https://admin.example.com']
    }), '*');

    jest.advanceTimersByTime(150);
    expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(600);
    expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(3);

    jest.advanceTimersByTime(750);
    expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(4);

    jest.advanceTimersByTime(1500);
    expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(5);

    jest.advanceTimersByTime(3000);
    expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(6);
  });
});
