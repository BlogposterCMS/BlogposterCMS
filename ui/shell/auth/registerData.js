import { fetchShellPublicSetting, issueShellPublicToken, publicSettingEnabled } from '../data/publicMeltdownClient.js';
import { runtimePublicPayload } from '../../shared/api-client/runtimeFacade.js';
export async function fetchRegistrationAvailability(client) {
    const publicToken = await issueShellPublicToken(client, 'firstInstallCheck');
    const firstInstallDone = publicSettingEnabled(await fetchShellPublicSetting(client, publicToken, 'FIRST_INSTALL_DONE'));
    if (!firstInstallDone) {
        return {
            firstInstallDone,
            registrationAllowed: true,
            registrationRole: 'admin'
        };
    }
    // The first account is the owner; later public signups must stay standard users.
    const registrationAllowed = publicSettingEnabled(await fetchShellPublicSetting(client, publicToken, 'ALLOW_REGISTRATION'));
    return {
        firstInstallDone,
        registrationAllowed,
        registrationRole: 'standard'
    };
}
export async function registerPublicUser(client, input) {
    const publicToken = await issueShellPublicToken(client, 'registration');
    await client.emit('cmsPublicRuntimeRequest', runtimePublicPayload(String(publicToken || ''), 'users', 'register', {
        username: input.username,
        password: input.password,
        role: input.role
    }));
}
