import { resolveShellPublicClient } from '../data/publicMeltdownClient.js';
import { fetchFirstInstallState, fetchPublicUserCount } from './installData.js';

export async function checkFirstInstall(): Promise<void> {
  try {
    const client = resolveShellPublicClient(window);
    const { publicToken, firstInstallDone } = await fetchFirstInstallState(client);

    if (!firstInstallDone) {
      let userCount = 0;
      try {
        userCount = await fetchPublicUserCount(client, publicToken);
      } catch (err) {
        console.warn('[firstInstallCheck] Failed to fetch user count', err);
      }

      if (userCount === 0) {
        window.location.href = '/install';
      }
    }
  } catch (err) {
    console.error('[firstInstallCheck] Error checking setting', err);
    window.location.href = '/install';
  }
}

void checkFirstInstall();
