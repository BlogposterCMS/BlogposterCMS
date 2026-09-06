import { resolveShellPublicClient } from '../data/publicMeltdownClient.js';
import { fetchFirstInstallState, fetchPublicUserCount } from './installData.js';
export async function checkFirstInstall() {
    try {
        const client = resolveShellPublicClient(window);
        const { publicToken, firstInstallDone } = await fetchFirstInstallState(client);
        if (!firstInstallDone) {
            const userCount = await fetchPublicUserCount(client, publicToken);
            if (userCount === 0) {
                window.location.href = '/install';
            }
        }
    }
    catch (err) {
        // An unavailable check is not evidence that installation is required.
        console.error('[firstInstallCheck] SHELL_INSTALL_CHECK_FAILED: installation state unavailable', err);
    }
}
void checkFirstInstall();
