import {
  fetchShellPublicSetting,
  issueShellPublicToken,
  publicSettingEnabled,
  type ShellPublicClient
} from '../data/publicMeltdownClient.js';

export interface InstallData {
  username?: string;
  password?: string;
  email?: string;
  favoriteColor: string;
  projectName?: string;
}

export interface FirstInstallState {
  publicToken: unknown;
  firstInstallDone: boolean;
}

function installFetch(win: Window): (resource: RequestInfo | URL, options?: RequestInit) => Promise<Response> {
  if (typeof win.fetchWithTimeout === 'function') {
    return (resource, options) => win.fetchWithTimeout?.(resource, options) ?? Promise.reject(new Error('SHELL_INSTALL_FETCH_UNAVAILABLE: fetchWithTimeout unavailable'));
  }

  if (typeof win.fetch === 'function') {
    return win.fetch.bind(win);
  }

  throw new Error('SHELL_INSTALL_FETCH_UNAVAILABLE: browser fetch unavailable');
}

export async function fetchFirstInstallState(client: ShellPublicClient): Promise<FirstInstallState> {
  const publicToken = await issueShellPublicToken(client, 'firstInstallCheck');
  const firstInstallDone = publicSettingEnabled(
    await fetchShellPublicSetting(client, publicToken, 'FIRST_INSTALL_DONE')
  );

  return {
    publicToken,
    firstInstallDone
  };
}

export async function fetchPublicUserCount(client: ShellPublicClient, publicToken: unknown): Promise<number> {
  const result = await client.emit('getUserCount', {
    jwt: publicToken,
    moduleName: 'userManagement',
    moduleType: 'core'
  });
  return typeof result === 'number' ? result : 0;
}

export async function submitInstallRequest(
  win: Window,
  csrfToken: string,
  data: InstallData
): Promise<void> {
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
