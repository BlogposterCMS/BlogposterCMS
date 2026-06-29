export interface ModuleAccessRuntimeRequest {
  id: string;
  moduleName: string;
  event: string;
  resource: string;
  action: string;
  targetModuleName?: string;
  targetModuleType?: string;
  permission?: string;
  reason?: string;
  risk?: string;
  protected?: boolean;
  allowPermanent?: boolean;
  payloadSummary?: Record<string, unknown>;
  createdAt?: string;
  expiresAt?: string;
  status?: string;
}

type ModuleAccessEmitter = Window['meltdownEmit'];

const MODULE_LOADER_MODULE = {
  moduleName: 'moduleLoader',
  moduleType: 'core'
} as const;

function requireEmitter(emit: ModuleAccessEmitter): NonNullable<ModuleAccessEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('MODULE_ACCESS_CONSENT_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
  }
  return emit;
}

function toArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
    return (value as { data: unknown[] }).data;
  }
  return [];
}

export function toModuleAccessRuntimeRequests(value: unknown): ModuleAccessRuntimeRequest[] {
  return toArray(value)
    .filter((item): item is ModuleAccessRuntimeRequest => Boolean(item) && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string');
}

export function moduleAccessErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function fetchPendingModuleAccessRequests(
  emit: ModuleAccessEmitter,
  jwt: string | null | undefined,
  targetModuleName?: string
): Promise<ModuleAccessRuntimeRequest[]> {
  const meltdownEmit = requireEmitter(emit);
  const payload: Record<string, unknown> = {
    jwt,
    ...MODULE_LOADER_MODULE
  };
  if (targetModuleName) payload.targetModuleName = targetModuleName;
  const res = await meltdownEmit('listPendingModuleAccessRequests', payload);
  return toModuleAccessRuntimeRequests(res);
}

export async function resolveModuleAccessRequest(
  emit: ModuleAccessEmitter,
  jwt: string | null | undefined,
  requestId: string,
  decision: 'approve' | 'deny',
  mode: 'once' | 'always' = 'once'
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await meltdownEmit('resolveModuleAccessRequest', {
    jwt,
    ...MODULE_LOADER_MODULE,
    requestId,
    decision,
    mode
  });
}
