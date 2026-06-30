/**
 * @jest-environment jsdom
 */

import {
  asSetting,
  buildLoginStrategySettingPayloads,
  errorMessage,
  fetchLoginStrategySettings,
  normalizeScope,
  saveLoginStrategySettings,
  strategySettingKey
} from '../ui/widgets/plainspace/admin/loginStrategyEditData';

describe('loginStrategyEditData', () => {
  it('normalizes settings values and strategy scope', () => {
    expect(asSetting(null)).toBe('');
    expect(asSetting(undefined, 'fallback')).toBe('fallback');
    expect(asSetting(42)).toBe('42');
    expect(normalizeScope('public')).toBe('public');
    expect(normalizeScope('both')).toBe('both');
    expect(normalizeScope('bad')).toBe('admin');
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('nope')).toBe('nope');
  });

  it('builds stable settings keys and save payloads', () => {
    expect(strategySettingKey('github', 'CLIENT_ID')).toBe('GITHUB_CLIENT_ID');
    expect(buildLoginStrategySettingPayloads('admin-token', 'github', {
      clientId: 'id-1',
      clientSecret: 'secret-1',
      scope: 'both'
    })).toEqual([
      {
        jwt: 'admin-token',
        moduleName: 'runtimeManager',
        moduleType: 'core',
        resource: 'settings',
        action: 'set',
        params: {
          key: 'GITHUB_CLIENT_ID',
          value: 'id-1'
        }
      },
      {
        jwt: 'admin-token',
        moduleName: 'runtimeManager',
        moduleType: 'core',
        resource: 'settings',
        action: 'set',
        params: {
          key: 'GITHUB_CLIENT_SECRET',
          value: 'secret-1'
        }
      },
      {
        jwt: 'admin-token',
        moduleName: 'runtimeManager',
        moduleType: 'core',
        resource: 'settings',
        action: 'set',
        params: {
          key: 'GITHUB_SCOPE',
          value: 'both'
        }
      }
    ]);
  });

  it('fetches login strategy settings through the runtime admin facade', async () => {
    const emit = jest.fn(async (_eventName, payload) => {
      if (payload.params.key === 'GITHUB_CLIENT_ID') return 'id-1';
      if (payload.params.key === 'GITHUB_CLIENT_SECRET') return 'secret-1';
      return 'invalid';
    });

    await expect(fetchLoginStrategySettings(emit, 'admin-token', 'github')).resolves.toEqual({
      clientId: 'id-1',
      clientSecret: 'secret-1',
      scope: 'admin'
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'settings',
      action: 'get',
      params: { key: 'GITHUB_CLIENT_ID' }
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'settings',
      action: 'get',
      params: { key: 'GITHUB_CLIENT_SECRET' }
    });
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'settings',
      action: 'get',
      params: { key: 'GITHUB_SCOPE' }
    });
  });

  it('saves login strategy settings through the runtime admin facade', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await saveLoginStrategySettings(emit, 'admin-token', 'github', {
      clientId: 'id-1',
      clientSecret: 'secret-1',
      scope: 'public'
    });

    expect(emit).toHaveBeenNthCalledWith(1, 'cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'settings',
      action: 'set',
      params: {
        key: 'GITHUB_CLIENT_ID',
        value: 'id-1'
      }
    });
    expect(emit).toHaveBeenNthCalledWith(2, 'cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'settings',
      action: 'set',
      params: {
        key: 'GITHUB_CLIENT_SECRET',
        value: 'secret-1'
      }
    });
    expect(emit).toHaveBeenNthCalledWith(3, 'cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'settings',
      action: 'set',
      params: {
        key: 'GITHUB_SCOPE',
        value: 'public'
      }
    });
  });
});
