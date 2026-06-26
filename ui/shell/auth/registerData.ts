import {
  fetchShellPublicSetting,
  issueShellPublicToken,
  publicSettingEnabled,
  type ShellPublicClient
} from '../data/publicMeltdownClient.js';

export type RegistrationRole = 'admin' | 'standard';

export interface RegistrationAvailability {
  firstInstallDone: boolean;
  registrationAllowed: boolean;
  registrationRole: RegistrationRole;
}

export interface PublicRegistrationInput {
  username: string;
  password: string;
  role: RegistrationRole;
}

export async function fetchRegistrationAvailability(client: ShellPublicClient): Promise<RegistrationAvailability> {
  const publicToken = await issueShellPublicToken(client, 'firstInstallCheck');
  const firstInstallDone = publicSettingEnabled(
    await fetchShellPublicSetting(client, publicToken, 'FIRST_INSTALL_DONE')
  );

  if (!firstInstallDone) {
    return {
      firstInstallDone,
      registrationAllowed: true,
      registrationRole: 'admin'
    };
  }

  // The first account is the owner; later public signups must stay standard users.
  const registrationAllowed = publicSettingEnabled(
    await fetchShellPublicSetting(client, publicToken, 'ALLOW_REGISTRATION')
  );
  return {
    firstInstallDone,
    registrationAllowed,
    registrationRole: 'standard'
  };
}

export async function registerPublicUser(
  client: ShellPublicClient,
  input: PublicRegistrationInput
): Promise<void> {
  const publicToken = await issueShellPublicToken(client, 'registration');
  await client.emit('publicRegister', {
    jwt: publicToken,
    moduleName: 'userManagement',
    moduleType: 'core',
    username: input.username,
    password: input.password,
    role: input.role
  });
}
