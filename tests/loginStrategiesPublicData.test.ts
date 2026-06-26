/**
 * @jest-environment jsdom
 */

import {
  fetchPublicLoginStrategies,
  issueLoginPublicToken,
  publicStrategies,
  strategyList
} from '../ui/shell/auth/loginStrategiesPublicData';

describe('loginStrategiesPublicData', () => {
  it('normalizes and filters public login strategies', () => {
    expect(strategyList({ data: [{ name: 'github', scope: 'public' }, null] }))
      .toEqual([{ name: 'github', scope: 'public' }]);
    expect(strategyList([{ name: 'google', scope: 'global' }]))
      .toEqual([{ name: 'google', scope: 'global' }]);
    expect(publicStrategies({
      data: [
        { name: 'adminLocal', scope: 'global' },
        { name: 'github', scope: 'public' },
        { name: 'saml', scope: 'admin' }
      ]
    })).toEqual([{ name: 'github', scope: 'public' }]);
  });

  it('issues a login public token through auth', async () => {
    const emit = jest.fn().mockResolvedValue('public-token');

    await expect(issueLoginPublicToken(emit)).resolves.toBe('public-token');
    expect(emit).toHaveBeenCalledWith('issuePublicToken', {
      purpose: 'login',
      moduleName: 'auth'
    });
  });

  it('loads active public login strategies through auth', async () => {
    const emit = jest.fn(async eventName => {
      if (eventName === 'issuePublicToken') return 'public-token';
      return {
        data: [
          { name: 'adminLocal', scope: 'global' },
          { name: 'github', scope: 'public' }
        ]
      };
    });

    await expect(fetchPublicLoginStrategies(emit)).resolves.toEqual([
      { name: 'github', scope: 'public' }
    ]);
    expect(emit).toHaveBeenCalledWith('listActiveLoginStrategies', {
      jwt: 'public-token',
      moduleName: 'auth',
      moduleType: 'core'
    });
  });

  it('fails with a searchable error code when the emitter is missing', async () => {
    await expect(fetchPublicLoginStrategies(undefined as never))
      .rejects.toThrow('SHELL_LOGIN_STRATEGIES_EMITTER_UNAVAILABLE');
  });
});
