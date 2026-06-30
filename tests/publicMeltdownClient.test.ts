/**
 * @jest-environment jsdom
 */

import {
  fetchShellPublicSetting,
  issueShellPublicToken,
  publicSettingEnabled,
  resolveShellPublicClient
} from '../ui/shell/data/publicMeltdownClient';

function jsonResponse(body: unknown) {
  const raw = JSON.stringify(body);
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {
      entries: () => [][Symbol.iterator]()
    },
    clone: () => ({
      text: async () => raw
    })
  } as unknown as Response;
}

describe('publicMeltdownClient', () => {
  afterEach(() => {
    delete window.blogposterApi;
    delete window.fetchWithTimeout;
  });

  it('reuses the shared browser meltdown client when it is available', async () => {
    const emit = jest.fn().mockResolvedValue('ok');
    window.blogposterApi = { emit, emitBatch: jest.fn() };

    await expect(resolveShellPublicClient(window).emit('ping')).resolves.toBe('ok');
    expect(emit).toHaveBeenCalledWith('ping');
  });

  it('creates a public client fallback over fetchWithTimeout', async () => {
    const fetchWithTimeout = jest.fn().mockResolvedValue(jsonResponse({ data: 'public-token' }));
    window.fetchWithTimeout = fetchWithTimeout;

    const client = resolveShellPublicClient(window);
    await expect(issueShellPublicToken(client, 'registration')).resolves.toBe('public-token');

    expect(fetchWithTimeout).toHaveBeenCalledWith('/api/meltdown', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        eventName: 'issuePublicToken',
        payload: {
          purpose: 'registration',
          moduleName: 'auth'
        }
      })
    }));
  });

  it('builds public setting payloads and normalizes boolean settings', async () => {
    const emit = jest.fn().mockResolvedValue({
      resource: 'settings',
      action: 'public',
      data: { FIRST_INSTALL_DONE: 'true' }
    });

    await expect(fetchShellPublicSetting({ emit }, 'token', 'FIRST_INSTALL_DONE')).resolves.toBe('true');
    expect(emit).toHaveBeenCalledWith('cmsPublicRuntimeRequest', {
      jwt: 'token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'settings',
      action: 'public',
      params: { keys: ['FIRST_INSTALL_DONE'] }
    });
    expect(publicSettingEnabled('true')).toBe(true);
    expect(publicSettingEnabled('FALSE')).toBe(false);
  });
});
