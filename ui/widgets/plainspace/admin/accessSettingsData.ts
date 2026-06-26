export interface AccessSettingsState {
  allowRegistration: boolean;
  firstInstallDone: boolean;
}

export interface AgentAccessCodeRecord {
  codeId: string;
  label: string;
  scope: 'view' | 'control';
  status: 'active' | 'expired' | 'used' | 'revoked';
  createdAt: string;
  expiresAt: string;
  usedAt?: string | null;
  revokedAt?: string | null;
  tokenTtlSeconds: number;
}

export interface AgentAccessCodeCreateOptions {
  label?: string;
  scope?: 'view' | 'control';
  ttlSeconds?: number;
  tokenTtlSeconds?: number;
}

export interface AgentAccessCodeCreateResult extends AgentAccessCodeRecord {
  code: string;
}

export interface AgentAccessRequestOptions {
  adminToken?: string | null;
  csrfToken?: string | null;
  fetchImpl?: typeof fetch;
  basePath?: string;
}

type AccessSettingsEmitter = Window['meltdownEmit'];
type AgentAccessEnvelope<T> = { data?: T; error?: string; code?: string };

function requireEmitter(emit: AccessSettingsEmitter): NonNullable<AccessSettingsEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('meltdownEmit unavailable');
  }
  return emit;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function asBooleanSetting(value: unknown): boolean {
  return String(value).toLowerCase() === 'true';
}

function agentAccessEndpoint(path: string, basePath = '/admin/api/agent-access'): string {
  return `${basePath.replace(/\/+$/g, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

function fetchImplFromOptions(options: AgentAccessRequestOptions = {}): typeof fetch {
  if (options.fetchImpl) return options.fetchImpl;
  if (typeof window.fetchWithTimeout === 'function') return window.fetchWithTimeout as typeof fetch;
  return fetch.bind(globalThis);
}

async function parseAgentAccessResponse<T>(response: Response): Promise<T> {
  let payload: AgentAccessEnvelope<T>;
  try {
    payload = await response.json();
  } catch {
    throw new Error('AGENT_ACCESS_INVALID_RESPONSE');
  }
  if (!response.ok || payload.error) {
    throw new Error(payload.code ? `${payload.code}: ${payload.error}` : payload.error || 'AGENT_ACCESS_REQUEST_FAILED');
  }
  return payload.data as T;
}

async function requestAgentAccess<T>(
  path: string,
  init: RequestInit,
  options: AgentAccessRequestOptions = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined)
  };
  if (options.csrfToken) headers['X-CSRF-Token'] = options.csrfToken;
  if (options.adminToken) headers.Authorization = `Bearer ${options.adminToken}`;
  const response = await fetchImplFromOptions(options)(agentAccessEndpoint(path, options.basePath), {
    credentials: 'same-origin',
    ...init,
    headers
  });
  return parseAgentAccessResponse<T>(response);
}

export async function fetchAccessSettings(
  emit: AccessSettingsEmitter,
  jwt: string | null | undefined
): Promise<AccessSettingsState> {
  const meltdownEmit = requireEmitter(emit);
  const [allowRegistrationRaw, firstInstallRaw] = await Promise.all([
    meltdownEmit('getSetting', {
      jwt,
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'ALLOW_REGISTRATION'
    }),
    meltdownEmit('getSetting', {
      jwt,
      moduleName: 'settingsManager',
      moduleType: 'core',
      key: 'FIRST_INSTALL_DONE'
    })
  ]);

  return {
    allowRegistration: asBooleanSetting(allowRegistrationRaw),
    firstInstallDone: asBooleanSetting(firstInstallRaw)
  };
}

export async function setAllowRegistration(
  emit: AccessSettingsEmitter,
  jwt: string | null | undefined,
  allowed: boolean
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await meltdownEmit('setSetting', {
    jwt,
    moduleName: 'settingsManager',
    moduleType: 'core',
    key: 'ALLOW_REGISTRATION',
    value: allowed ? 'true' : 'false'
  });
}

export async function listAgentAccessCodes(
  options: AgentAccessRequestOptions = {}
): Promise<AgentAccessCodeRecord[]> {
  return requestAgentAccess<AgentAccessCodeRecord[]>('/codes', { method: 'GET' }, options);
}

export async function createAgentAccessCode(
  payload: AgentAccessCodeCreateOptions,
  options: AgentAccessRequestOptions = {}
): Promise<AgentAccessCodeCreateResult> {
  return requestAgentAccess<AgentAccessCodeCreateResult>('/codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, options);
}

export async function revokeAgentAccessCode(
  codeId: string,
  options: AgentAccessRequestOptions = {}
): Promise<AgentAccessCodeRecord> {
  return requestAgentAccess<AgentAccessCodeRecord>(`/codes/${encodeURIComponent(codeId)}`, {
    method: 'DELETE'
  }, options);
}
