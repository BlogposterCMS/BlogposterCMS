import {
  createMeltdownClient,
  type MeltdownClient
} from '../../shared/api-client/meltdownClient.js';

export type ShellPublicClient = Pick<MeltdownClient, 'emit'>;
export type PublicSettingKey = 'FIRST_INSTALL_DONE' | 'ALLOW_REGISTRATION';

function browserFetch(win: Window): typeof fetch {
  if (typeof win.fetchWithTimeout === 'function') {
    return ((resource: RequestInfo | URL, options?: RequestInit) =>
      win.fetchWithTimeout?.(resource, options) ?? Promise.reject(new Error('SHELL_PUBLIC_MELTDOWN_FETCH_UNAVAILABLE: fetchWithTimeout unavailable'))) as typeof fetch;
  }

  if (typeof win.fetch === 'function') {
    return win.fetch.bind(win);
  }

  throw new Error('SHELL_PUBLIC_MELTDOWN_FETCH_UNAVAILABLE: browser fetch unavailable');
}

export function resolveShellPublicClient(win: Window): ShellPublicClient {
  if (win.blogposterApi && typeof win.blogposterApi.emit === 'function') {
    return win.blogposterApi;
  }

  return createMeltdownClient({
    fetchImpl: browserFetch(win),
    throttleDelay: 0,
    debug: () => Boolean(win.DEBUG_MELTDOWN)
  });
}

export async function issueShellPublicToken(client: ShellPublicClient, purpose: string): Promise<unknown> {
  return client.emit('issuePublicToken', {
    purpose,
    moduleName: 'auth'
  });
}

export async function fetchShellPublicSetting(
  client: ShellPublicClient,
  publicToken: unknown,
  key: PublicSettingKey
): Promise<unknown> {
  return client.emit('getPublicSetting', {
    jwt: publicToken,
    moduleName: 'settingsManager',
    moduleType: 'core',
    key
  });
}

export function publicSettingEnabled(value: unknown): boolean {
  return String(value).toLowerCase() === 'true';
}
