import { fetchShellPublicSetting, issueShellPublicToken, publicSettingEnabled } from '../data/publicMeltdownClient.js';
import { runtimePublicPayload, unwrapRuntimeFacadeData } from '../../shared/api-client/runtimeFacade.js';
export function isAlreadyInstalledSubmitError(err) {
    const message = err instanceof Error ? err.message : String(err);
    // The install POST intentionally returns a tiny plain-text boundary error.
    return message.includes('SHELL_INSTALL_SUBMIT_FAILED') && /\bAlready installed\b/i.test(message);
}
function installFetch(win) {
    if (typeof win.fetchWithTimeout === 'function') {
        return (resource, options) => win.fetchWithTimeout?.(resource, options) ?? Promise.reject(new Error('SHELL_INSTALL_FETCH_UNAVAILABLE: fetchWithTimeout unavailable'));
    }
    if (typeof win.fetch === 'function') {
        return win.fetch.bind(win);
    }
    throw new Error('SHELL_INSTALL_FETCH_UNAVAILABLE: browser fetch unavailable');
}
export async function fetchFirstInstallState(client) {
    const publicToken = await issueShellPublicToken(client, 'firstInstallCheck');
    const firstInstallDone = publicSettingEnabled(await fetchShellPublicSetting(client, publicToken, 'FIRST_INSTALL_DONE'));
    return {
        publicToken,
        firstInstallDone
    };
}
export async function fetchPublicUserCount(client, publicToken) {
    const result = unwrapRuntimeFacadeData(await client.emit('cmsPublicRuntimeRequest', runtimePublicPayload(String(publicToken || ''), 'users', 'count')));
    return typeof result === 'number' ? result : 0;
}
export async function submitInstallRequest(win, csrfToken, data) {
    const response = await installFetch(win)('/install', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({
            username: data.username,
            email: data.email,
            password: data.password,
            favoriteColor: data.favoriteColor,
            siteName: data.projectName
        })
    });
    if (!response.ok) {
        const message = await response.text();
        throw new Error(`SHELL_INSTALL_SUBMIT_FAILED: ${message || response.statusText}`);
    }
}
