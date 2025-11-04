/**
 * @jest-environment jsdom
 */

const path = require('path');

describe('appFrameLoader postMessage security', () => {
  beforeEach(() => {
    jest.resetModules();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    window.CSRF_TOKEN = null;
    window.ADMIN_TOKEN = null;
    window.meltdownEmit = jest.fn(() => Promise.resolve());
  });

  test('ignores messages coming from untrusted origins', async () => {
    document.head.innerHTML = [
      '<meta name="csrf-token" content="csrf123">',
      '<meta name="admin-token" content="admin456">',
      '<meta name="app-name" content="designer">',
      '<meta name="app-frame-allowed-origins" content="https://admin.example.com">'
    ].join('');

    const frame = document.createElement('iframe');
    frame.id = 'app-frame';
    frame.setAttribute('src', 'https://designer.example.com/index.html');
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
      adminToken: 'admin456',
      allowedOrigins: ['https://admin.example.com']
    }, 'https://designer.example.com');

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

    expect(window.meltdownEmit).not.toHaveBeenCalled();

    const trustedEvent = new window.MessageEvent('message', {
      data: { type: 'designer-ready' },
      origin: 'https://admin.example.com',
      source: frame.contentWindow
    });
    window.dispatchEvent(trustedEvent);
    await Promise.resolve();

    expect(window.meltdownEmit).toHaveBeenCalledWith('dispatchAppEvent', expect.objectContaining({
      event: 'designer-ready'
    }));
  });
});
