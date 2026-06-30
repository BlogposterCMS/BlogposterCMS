/**
 * @jest-environment jsdom
 */

import {
  errorMessage,
  fetchLoginStrategies,
  setLoginStrategyEnabled,
  toStrategies,
  visibleLoginStrategies
} from '../ui/widgets/plainspace/admin/loginStrategiesData';

describe('loginStrategiesData', () => {
  it('normalizes strategy payloads and filters admin-local strategies', () => {
    const strategies = toStrategies({
      data: [
        { name: 'adminLocal', scope: 'admin' },
        { name: 'github', scope: 'public', isEnabled: true },
        { name: 42 },
        null
      ]
    });

    expect(strategies).toEqual([
      { name: 'adminLocal', scope: 'admin' },
      { name: 'github', scope: 'public', isEnabled: true }
    ]);
    expect(visibleLoginStrategies(strategies)).toEqual([
      { name: 'github', scope: 'public', isEnabled: true }
    ]);
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('nope')).toBe('nope');
  });

  it('fetches visible login strategies through the runtime admin facade', async () => {
    const emit = jest.fn().mockResolvedValue({
      data: [
        { name: 'adminLocal' },
        { name: 'google', scope: 'public', description: 'Google Login' }
      ]
    });

    await expect(fetchLoginStrategies(emit, 'admin-token')).resolves.toEqual([
      { name: 'google', scope: 'public', description: 'Google Login' }
    ]);
    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'auth',
      action: 'loginStrategies',
      params: {}
    });
  });

  it('toggles login strategies through the runtime admin facade', async () => {
    const emit = jest.fn().mockResolvedValue(undefined);

    await setLoginStrategyEnabled(emit, 'admin-token', 'github', true);

    expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', {
      jwt: 'admin-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'auth',
      action: 'setStrategyEnabled',
      params: {
        strategyName: 'github',
        enabled: true
      }
    });
  });
});
