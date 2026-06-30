export type MeltdownEmitter = Window['meltdownEmit'];

const RUNTIME_MANAGER_MODULE = {
  moduleName: 'runtimeManager',
  moduleType: 'core'
} as const;

function objectParams(value: Record<string, unknown> = {}): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function unwrapRuntimeFacadeData<T = unknown>(value: unknown): T {
  if (
    value &&
    typeof value === 'object' &&
    'resource' in value &&
    'action' in value &&
    'data' in value
  ) {
    return (value as { data?: T }).data as T;
  }
  return value as T;
}

export function runtimeAdminPayload(
  jwt: string | null | undefined,
  resource: string,
  action: string,
  params: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    jwt,
    ...RUNTIME_MANAGER_MODULE,
    resource,
    action,
    params: objectParams(params)
  };
}

export function runtimePublicPayload(
  jwt: string | null | undefined,
  resource: string,
  action: string,
  params: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    jwt,
    ...RUNTIME_MANAGER_MODULE,
    resource,
    action,
    params: objectParams(params)
  };
}

export async function emitRuntimeAdmin<T = unknown>(
  emit: NonNullable<MeltdownEmitter>,
  jwt: string | null | undefined,
  resource: string,
  action: string,
  params: Record<string, unknown> = {},
  timeoutMs?: number
): Promise<T> {
  const payload = runtimeAdminPayload(jwt, resource, action, params);
  const result = timeoutMs === undefined
    ? await emit('cmsAdminApiRequest', payload)
    : await emit('cmsAdminApiRequest', payload, timeoutMs);
  return unwrapRuntimeFacadeData<T>(result);
}

export async function emitRuntimePublic<T = unknown>(
  emit: NonNullable<MeltdownEmitter>,
  jwt: string | null | undefined,
  resource: string,
  action: string,
  params: Record<string, unknown> = {},
  timeoutMs?: number
): Promise<T> {
  const payload = runtimePublicPayload(jwt, resource, action, params);
  const result = timeoutMs === undefined
    ? await emit('cmsPublicRuntimeRequest', payload)
    : await emit('cmsPublicRuntimeRequest', payload, timeoutMs);
  return unwrapRuntimeFacadeData<T>(result);
}
