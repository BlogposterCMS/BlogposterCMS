/**
 * @jest-environment jsdom
 */

import {
  asBooleanSetting,
  createAgentAccessCode,
  errorMessage,
  fetchAccessSettings,
  listAgentAccessCodes,
  revokeAgentAccessCode,
  setAllowRegistration
} from '../ui/widgets/plainspace/admin/accessSettingsData';

describe('accessSettingsData', () => {
  it('normalizes boolean settings and error messages', () => {
    expect(asBooleanSetting('true')).toBe(true);
    expect(asBooleanSetting('TRUE')).toBe(true);
    expect(asBooleanSetting(true)).toBe(true);
    expect(asBooleanSetting('false')).toBe(false);
    expect(asBooleanSetting(undefined)).toBe(false);
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('nope')).toBe('nope');
  });

  it('fetches access settings through the settings manager', async () => {
    const emit = jest.fn(async (_eventName, payload: Record<string, unknown>) => (
      payload.key === 'ALLOW_REGISTRATION' ? 'true' : 'false'
    ));

    await expect(fetchAccessSettings(emit, 'admin-token')).resolves.toEqual({
      allowRegistration: true,
      firstInstallDone: false
    });
    expect(emit).toHaveBeenCalledWith('getSetting', {
      jwt: 'admin-token',
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'ALLOW_REGISTRATION'
    });
    expect(emit).toHaveBeenCalledWith('getSetting', {
      jwt: 'admin-token',
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'FIRST_INSTALL_DONE'
    });
  });

  it('saves the public registration flag through the settings manager', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await setAllowRegistration(emit, 'admin-token', true);
    await setAllowRegistration(emit, 'admin-token', false);

    expect(emit).toHaveBeenCalledWith('setSetting', {
      jwt: 'admin-token',
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'ALLOW_REGISTRATION',
      value: 'true'
    });
    expect(emit).toHaveBeenCalledWith('setSetting', {
      jwt: 'admin-token',
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'ALLOW_REGISTRATION',
      value: 'false'
    });
  });

  it('uses the agent access HTTP facade with admin auth and csrf headers', async () => {
    const fetchImpl = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => ({
      ok: true,
      json: async () => ({
        data: String(url).endsWith('/codes') && init?.method === 'GET'
          ? [{ codeId: 'abc', label: 'codex', scope: 'control', status: 'active' }]
          : { codeId: 'abc', code: 'bp_agent_abc_secret', status: 'active' }
      })
    })) as unknown as jest.MockedFunction<typeof fetch>;

    await expect(listAgentAccessCodes({
      adminToken: 'admin-token',
      csrfToken: 'csrf-token',
      fetchImpl
    })).resolves.toEqual([{ codeId: 'abc', label: 'codex', scope: 'control', status: 'active' }]);

    await expect(createAgentAccessCode({
      label: 'codex',
      scope: 'control',
      ttlSeconds: 900
    }, {
      adminToken: 'admin-token',
      csrfToken: 'csrf-token',
      fetchImpl
    })).resolves.toMatchObject({ code: 'bp_agent_abc_secret' });

    await expect(revokeAgentAccessCode('abc', {
      adminToken: 'admin-token',
      csrfToken: 'csrf-token',
      fetchImpl
    })).resolves.toMatchObject({ codeId: 'abc' });

    expect(fetchImpl).toHaveBeenCalledWith('/admin/api/agent-access/codes', expect.objectContaining({
      method: 'GET',
      credentials: 'same-origin',
      headers: expect.objectContaining({
        Authorization: 'Bearer admin-token',
        'X-CSRF-Token': 'csrf-token'
      })
    }));
    expect(fetchImpl).toHaveBeenCalledWith('/admin/api/agent-access/codes', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ label: 'codex', scope: 'control', ttlSeconds: 900 }),
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        Authorization: 'Bearer admin-token',
        'X-CSRF-Token': 'csrf-token'
      })
    }));
    expect(fetchImpl).toHaveBeenCalledWith('/admin/api/agent-access/codes/abc', expect.objectContaining({
      method: 'DELETE'
    }));
  });
});
