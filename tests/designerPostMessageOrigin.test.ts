/**
 * @jest-environment jsdom
 */

import crypto from 'crypto';
import { TextDecoder as NodeTextDecoder } from 'util';

const { webcrypto } = crypto;

jest.mock('../ui/designer/app/fetchPartial.js', () => ({
  fetchPartial: jest.fn(() => Promise.resolve('<div></div>'))
}));

jest.mock('../ui/designer/app/builderRenderer', () => ({
  initBuilder: jest.fn(() => Promise.resolve())
}));

jest.mock('../ui/designer/app/editor/editor.js', () => ({
  enableAutoEdit: jest.fn()
}));

jest.mock('/ui/shared/sanitize/sanitizer.js', () => ({
  sanitizeHtml: jest.fn((value: string) => value)
}));

jest.mock('../ui/designer/app/managers/panelManager.js', () => ({
  initBuilderPanel: jest.fn()
}));

jest.mock('/ui/shell/theme/userColor.js', () => ({
  applyThemeMode: jest.fn(() => 'system'),
  applyUserColor: jest.fn(() => Promise.resolve())
}));

const ALLOWED_ORIGINS = [
  'https://admin1.example.com',
  'https://admin2.example.com'
];

const base64UrlEncode = (buffer: Buffer): string =>
  buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

let originTokenPrivateKey: string;
let originTokenPublicKeyPem: string;

const createOriginToken = (origins: string[]): string => {
  const now = Date.now();
  const payload = {
    origins,
    issuedAt: now,
    expiresAt: now + Number(process.env.APP_FRAME_ORIGIN_TOKEN_TTL_SECONDS || 300) * 1000,
    nonce: crypto.randomBytes(16).toString('hex')
  };
  const payloadBuffer = Buffer.from(JSON.stringify(payload), 'utf8');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(payloadBuffer);
  signer.end();
  const signature = signer.sign(originTokenPrivateKey);
  return `${base64UrlEncode(payloadBuffer)}.${base64UrlEncode(signature)}`;
};

const loadDesignerApp = async (): Promise<void> => {
  const app = await import('../ui/designer/app/index');
  await app.readyOriginPolicy;
};

describe('designer iframe origin handling', () => {
  beforeAll(() => {
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    originTokenPrivateKey = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    originTokenPublicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    process.env.APP_FRAME_ORIGIN_TOKEN_TTL_SECONDS = '300';
    (globalThis as unknown as { TextDecoder?: typeof NodeTextDecoder }).TextDecoder = NodeTextDecoder as unknown as typeof TextDecoder;
    Object.defineProperty(window, 'crypto', {
      configurable: true,
      value: webcrypto
    });
  });

  afterAll(() => {
    delete process.env.APP_FRAME_ORIGIN_TOKEN_TTL_SECONDS;
  });

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    document.body.innerHTML = '';
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'complete'
    });
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: 'https://admin2.example.com/admin/app/designer'
    });
    (window as any).CSRF_TOKEN = undefined;
    (window as any).ADMIN_TOKEN = undefined;
    delete (window as any).__BLOGPOSTER_APP_INIT_TOKENS__;
    window.parent.postMessage = jest.fn();
    const token = createOriginToken(ALLOWED_ORIGINS);
    Object.defineProperty(window, 'fetch', {
      configurable: true,
      value: jest.fn(async () => ({
        ok: true,
        json: async () => ({ publicKey: originTokenPublicKeyPem })
      }))
    });
    window.history.replaceState(null, '', `?originToken=${token}`);
  });

  test('designer-ready reply targets the origin that delivered init tokens', async () => {
    document.body.innerHTML = `
      <div id="builderRow">
        <div id="sidebar"></div>
        <div id="content"></div>
        <div id="builderMain"></div>
      </div>
    `;

    await loadDesignerApp();
    (window.parent.postMessage as jest.Mock).mockClear();

    const currentToken = window.location.search.replace('?originToken=', '');
    const initEvent = new window.MessageEvent('message', {
      data: {
        type: 'init-tokens',
        csrfToken: 'csrf-token',
        adminToken: null,
        appBridge: true,
        originToken: currentToken
      },
      origin: 'https://admin2.example.com'
    });
    Object.defineProperty(initEvent, 'source', { value: window.parent });

    window.dispatchEvent(initEvent);

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(window.parent.postMessage).toHaveBeenCalledWith(
      { type: 'designer-ready' },
      'https://admin2.example.com'
    );
  });

  test('loads the origin public key through CORS for sandboxed app frames', async () => {
    document.body.innerHTML = `
      <div id="builderRow">
        <div id="sidebar"></div>
        <div id="content"></div>
        <div id="builderMain"></div>
      </div>
    `;

    await loadDesignerApp();

    expect(window.fetch).toHaveBeenCalledWith(
      '/apps/designer/origin-public-key.json',
      expect.objectContaining({
        credentials: 'omit',
        mode: 'cors',
        cache: 'no-store',
        redirect: 'error'
      })
    );
  });

  test('uses cached app-bridge init tokens when the Designer chunk loads late', async () => {
    document.body.innerHTML = `
      <div id="builderRow">
        <div id="sidebar"></div>
        <div id="content"></div>
        <div id="builderMain"></div>
      </div>
    `;

    const currentToken = window.location.search.replace('?originToken=', '');
    (window as any).__BLOGPOSTER_APP_INIT_TOKENS__ = {
      type: 'init-tokens',
      csrfToken: 'cached-csrf-token',
      adminToken: null,
      appBridge: true,
      originToken: currentToken,
      allowedOrigins: ALLOWED_ORIGINS
    };

    await loadDesignerApp();

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect((window as any).CSRF_TOKEN).toBe('cached-csrf-token');
    expect((window as any).ADMIN_TOKEN).toBeNull();
    expect(window.parent.postMessage).toHaveBeenCalledWith(
      { type: 'designer-ready' },
      'https://admin2.example.com'
    );
  });

  test('ignores init messages sent from a null origin', async () => {
    document.body.innerHTML = `
      <div id="builderRow">
        <div id="sidebar"></div>
        <div id="content"></div>
        <div id="builderMain"></div>
      </div>
    `;

    await loadDesignerApp();
    (window.parent.postMessage as jest.Mock).mockClear();

    const currentToken = window.location.search.replace('?originToken=', '');
    const nullOriginEvent = new window.MessageEvent('message', {
      data: {
        type: 'init-tokens',
        csrfToken: 'csrf-token',
        adminToken: null,
        appBridge: true,
        originToken: currentToken
      },
      origin: 'null'
    });
    Object.defineProperty(nullOriginEvent, 'source', { value: window.parent });

    window.dispatchEvent(nullOriginEvent);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(window.parent.postMessage).not.toHaveBeenCalled();
    expect((window as any).CSRF_TOKEN).toBeUndefined();
    expect((window as any).ADMIN_TOKEN).toBeUndefined();
  });

  test('bootstraps when referrer is missing by falling back to allowed origins', async () => {
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      value: ''
    });

    document.body.innerHTML = `
      <div id="builderRow">
        <div id="sidebar"></div>
        <div id="content"></div>
        <div id="builderMain"></div>
      </div>
    `;

    await loadDesignerApp();
    (window.parent.postMessage as jest.Mock).mockClear();

    const currentToken = window.location.search.replace('?originToken=', '');
    const initEvent = new window.MessageEvent('message', {
      data: {
        type: 'init-tokens',
        csrfToken: 'csrf-token',
        adminToken: null,
        appBridge: true,
        originToken: currentToken
      },
      origin: 'https://admin2.example.com'
    });
    Object.defineProperty(initEvent, 'source', { value: window.parent });

    window.dispatchEvent(initEvent);

    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(window.parent.postMessage).toHaveBeenCalledWith(
      { type: 'designer-ready' },
      'https://admin2.example.com'
    );
    expect((window as any).CSRF_TOKEN).toBe('csrf-token');
    expect((window as any).ADMIN_TOKEN).toBeNull();
  });

  test('rejects tampered origin token payload even with trusted message origin', async () => {
    const originalToken = window.location.search.replace('?originToken=', '');
    const validTokenParts = originalToken.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({
      origins: [...ALLOWED_ORIGINS, 'https://evil.example.com'],
      issuedAt: Date.now(),
      expiresAt: Date.now() + 300000,
      nonce: 'tampered'
    }), 'utf8');
    const tamperedToken = `${base64UrlEncode(tamperedPayload)}.${validTokenParts[1]}`;
    (window.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ publicKey: originTokenPublicKeyPem })
    });
    window.history.replaceState(null, '', `?originToken=${tamperedToken}`);

    document.body.innerHTML = `
      <div id="builderRow">
        <div id="sidebar"></div>
        <div id="content"></div>
        <div id="builderMain"></div>
      </div>
    `;

    await loadDesignerApp();
    (window.parent.postMessage as jest.Mock).mockClear();

    const initEvent = new window.MessageEvent('message', {
      data: {
        type: 'init-tokens',
        csrfToken: 'csrf-token',
        adminToken: null,
        appBridge: true,
        originToken: originalToken
      },
      origin: 'https://admin2.example.com'
    });
    Object.defineProperty(initEvent, 'source', { value: window.parent });

    window.dispatchEvent(initEvent);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(window.parent.postMessage).not.toHaveBeenCalled();
    expect((window as any).CSRF_TOKEN).toBeUndefined();
    expect((window as any).ADMIN_TOKEN).toBeUndefined();
  });

});
