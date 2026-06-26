import {
  fetchRegistrationAvailability,
  registerPublicUser
} from '../ui/shell/auth/registerData';

describe('registerData', () => {
  it('keeps the first install registration as an admin owner flow', async () => {
    const emit = jest.fn(async (eventName, payload) => {
      if (eventName === 'issuePublicToken') return 'public-token';
      if (payload.key === 'FIRST_INSTALL_DONE') return 'false';
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
    expect(emit).toHaveBeenCalledWith('getPublicSetting', {
      jwt: 'public-token',
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'FIRST_INSTALL_DONE'
    });
  });

  it('loads public registration availability for completed installs', async () => {
    const emit = jest.fn(async (eventName, payload) => {
      if (eventName === 'issuePublicToken') return 'public-token';
      if (payload.key === 'FIRST_INSTALL_DONE') return 'true';
      if (payload.key === 'ALLOW_REGISTRATION') return 'false';
      return null;
    });

    await expect(fetchRegistrationAvailability({ emit })).resolves.toEqual({
      firstInstallDone: true,
      registrationAllowed: false,
      registrationRole: 'standard'
    });
    expect(emit).toHaveBeenCalledWith('getPublicSetting', {
      jwt: 'public-token',
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'ALLOW_REGISTRATION'
    });
  });

  it('submits public registration through the userManagement payload contract', async () => {
    const emit = jest.fn(async eventName => (eventName === 'issuePublicToken' ? 'public-token' : undefined));

    await registerPublicUser({ emit }, {
      username: 'matteo',
      password: 'SecretPassword123',
      role: 'standard'
    });

    expect(emit).toHaveBeenCalledWith('publicRegister', {
      jwt: 'public-token',
      moduleName: 'userManagement',
      moduleType: 'core',
      username: 'matteo',
      password: 'SecretPassword123',
      role: 'standard'
    });
  });
});
