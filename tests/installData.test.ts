/**
 * @jest-environment jsdom
 */

import {
  fetchFirstInstallState,
  fetchPublicUserCount,
  submitInstallRequest
} from '../ui/shell/install/installData';

function textResponse(text: string, init: ResponseInit = {}) {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? 'OK',
    text: async () => text
  } as unknown as Response;
}

describe('installData', () => {
  afterEach(() => {
    delete window.fetchWithTimeout;
  });

  it('loads the first-install completion state through public settings', async () => {
    const emit = jest.fn(async (eventName, payload) => {
      if (eventName === 'issuePublicToken') return 'public-token';
      if (payload.key === 'FIRST_INSTALL_DONE') return 'true';
      return null;
    });

    await expect(fetchFirstInstallState({ emit })).resolves.toEqual({
      publicToken: 'public-token',
      firstInstallDone: true
    });
    expect(emit).toHaveBeenCalledWith('getPublicSetting', {
      jwt: 'public-token',
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'FIRST_INSTALL_DONE'
    });
  });

  it('normalizes public user-count results', async () => {
    const emit = jest.fn().mockResolvedValueOnce(2).mockResolvedValueOnce('unexpected');

    await expect(fetchPublicUserCount({ emit }, 'public-token')).resolves.toBe(2);
    await expect(fetchPublicUserCount({ emit }, 'public-token')).resolves.toBe(0);
    expect(emit).toHaveBeenCalledWith('getUserCount', {
      jwt: 'public-token',
      moduleName: 'userManagement',
      moduleType: 'core'
    });
  });

  it('posts install data with the CSRF header and install payload shape', async () => {
    const fetchWithTimeout = jest.fn().mockResolvedValue(textResponse('', { status: 204 }));
    window.fetchWithTimeout = fetchWithTimeout;

    await submitInstallRequest(window, 'csrf-token', {
      username: 'matteo',
      email: 'm@example.test',
      password: 'SecretPassword123',
      favoriteColor: '#008080',
      projectName: 'Blogposter'
    });

    expect(fetchWithTimeout).toHaveBeenCalledWith('/install', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'csrf-token'
      },
      body: JSON.stringify({
        username: 'matteo',
        email: 'm@example.test',
        password: 'SecretPassword123',
        favoriteColor: '#008080',
        siteName: 'Blogposter'
      })
    });
  });

  it('returns a searchable install submit error code on failed POSTs', async () => {
    window.fetchWithTimeout = jest.fn().mockResolvedValue(textResponse('bad setup', {
      status: 400,
      statusText: 'Bad Request'
    }));

    await expect(submitInstallRequest(window, 'csrf-token', {
      favoriteColor: '#008080'
    })).rejects.toThrow('SHELL_INSTALL_SUBMIT_FAILED: bad setup');
  });
});
