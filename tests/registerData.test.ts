import {
  fetchRegistrationAvailability,
  registerPublicUser
} from '../ui/shell/auth/registerData';

describe('registerData', () => {
  it('keeps the first install registration as an admin owner flow', async () => {
    const emit = jest.fn(async (eventName, payload) => {
      if (eventName === 'issuePublicToken') return 'public-token';
      if (payload.resource === 'settings' && payload.action === 'public') {
        return {
          resource: 'settings',
          action: 'public',
          data: { FIRST_INSTALL_DONE: 'false' }
        };
      }
      return null;
    });

    await expect(fetchRegistrationAvailability({ emit })).resolves.toEqual({
      firstInstallDone: false,
      registrationAllowed: true,
      registrationRole: 'admin'
    });
    expect(emit).toHaveBeenCalledWith('issuePublicToken', {
      purpose: 'firstInstallCheck',
      moduleName: 'auth'
    });
    expect(emit).toHaveBeenCalledWith('cmsPublicRuntimeRequest', {
      jwt: 'public-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'settings',
      action: 'public',
      params: { keys: ['FIRST_INSTALL_DONE'] }
    });
  });

  it('loads public registration availability for completed installs', async () => {
    const emit = jest.fn(async (eventName, payload) => {
      if (eventName === 'issuePublicToken') return 'public-token';
      if (payload.resource === 'settings' && payload.action === 'public') {
        return {
          resource: 'settings',
          action: 'public',
          data: payload.params.keys.includes('FIRST_INSTALL_DONE')
            ? { FIRST_INSTALL_DONE: 'true' }
            : { ALLOW_REGISTRATION: 'false' }
        };
      }
      return null;
    });

    await expect(fetchRegistrationAvailability({ emit })).resolves.toEqual({
      firstInstallDone: true,
      registrationAllowed: false,
      registrationRole: 'standard'
    });
    expect(emit).toHaveBeenCalledWith('cmsPublicRuntimeRequest', {
      jwt: 'public-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'settings',
      action: 'public',
      params: { keys: ['ALLOW_REGISTRATION'] }
    });
  });

  it('submits public registration through the userManagement payload contract', async () => {
    const emit = jest.fn(async eventName => (eventName === 'issuePublicToken' ? 'public-token' : undefined));

    await registerPublicUser({ emit }, {
      username: 'matteo',
      password: 'SecretPassword123',
      role: 'standard'
    });

    expect(emit).toHaveBeenCalledWith('cmsPublicRuntimeRequest', {
      jwt: 'public-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'users',
      action: 'register',
      params: {
        username: 'matteo',
        password: 'SecretPassword123',
        role: 'standard'
      }
    });
  });
});
