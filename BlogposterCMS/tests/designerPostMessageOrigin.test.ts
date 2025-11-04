/**
 * @jest-environment jsdom
 */

import crypto from 'crypto';
import { TextDecoder as NodeTextDecoder } from 'util';

const { webcrypto } = crypto;

jest.mock('../apps/designer/fetchPartial.js', () => ({
  fetchPartial: jest.fn(() => Promise.resolve('<div></div>'))
}));

jest.mock('../apps/designer/builderRenderer', () => ({
  initBuilder: jest.fn(() => Promise.resolve())
}));

jest.mock('../apps/designer/editor/editor.js', () => ({
  enableAutoEdit: jest.fn()
}));

jest.mock('../public/plainspace/sanitizer.js', () => ({
  sanitizeHtml: jest.fn((value: string) => value)
}));

jest.mock('../apps/designer/managers/panelManager.js', () => ({
  initBuilderPanel: jest.fn()
}));

jest.mock('../public/assets/js/userColor.js', () => ({
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
  await import('../apps/designer/index');
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
        adminToken: 'admin-token',
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
        adminToken: 'admin-token',
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
        adminToken: 'admin-token',
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
