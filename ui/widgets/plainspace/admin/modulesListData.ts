export {
  fetchPendingModuleAccessRequests,
  moduleAccessErrorMessage,
  resolveModuleAccessRequest,
  toModuleAccessRuntimeRequests,
  type ModuleAccessRuntimeRequest
} from '../../../shared/module-access/moduleAccessConsentData.js';

export interface ModuleInfo {
  moduleName?: string;
  version?: string;
  developer?: string;
  description?: string;
  permissions?: ModulePermissionDeclaration[];
  requestedAccess?: ModuleAccessRequest[];
  trustedAccessGrants?: ModuleAccessGrant[];
}

export interface ModulePermissionDeclaration {
  key?: string;
  permission_key?: string;
  description?: string;
  category?: string;
  ownerModule?: string;
}

export interface ModuleAccessRequest {
  event?: string;
  resource?: string;
  action?: string;
  protected?: boolean;
  allowPermanent?: boolean;
  reason?: string;
  risk?: string;
}

export interface ModuleAccessGrant extends ModuleAccessRequest {
  granted?: boolean;
  grantedAt?: string;
  grantedBy?: string | null;
}

export interface ModuleZipInspection {
  moduleName?: string;
  moduleInfo?: ModuleInfo;
  permissions?: ModulePermissionDeclaration[];
  requestedAccess?: ModuleAccessRequest[];
}

export interface ModuleRecord {
  module_name?: string;
  module_info?: ModuleInfo;
  moduleInfo?: ModuleInfo;
  is_active?: boolean;
}

type ModulesEmitter = Window['meltdownEmit'];

const MODULE_LOADER_MODULE = {
  moduleName: 'moduleLoader',
  moduleType: 'core'
} as const;

function requireEmitter(emit: ModulesEmitter): NonNullable<ModulesEmitter> {
  if (typeof emit !== 'function') {
    throw new Error('PLAINSPACE_MODULES_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
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

export function toModules(value: unknown): ModuleRecord[] {
  return toArray(value).filter((item): item is ModuleRecord => Boolean(item) && typeof item === 'object');
}

export function toModuleZipInspection(value: unknown): ModuleZipInspection {
  const source = value && typeof value === 'object' ? value as ModuleZipInspection : {};
  return {
    moduleName: source.moduleName || source.moduleInfo?.moduleName,
    moduleInfo: source.moduleInfo || {},
    permissions: Array.isArray(source.permissions) ? source.permissions : source.moduleInfo?.permissions || [],
    requestedAccess: Array.isArray(source.requestedAccess) ? source.requestedAccess : source.moduleInfo?.requestedAccess || []
  };
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function renderModuleMeta(info: ModuleInfo): string {
  const pieces: string[] = [];
  if (info.version) pieces.push(`v${info.version}`);
  pieces.push(info.developer || 'Unknown Developer');
  if (info.description) pieces.push(info.description);
  return pieces.join(' \u2022 ');
}

export function zipDataFromDataUrl(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  const zipData = raw.includes(',') ? raw.split(',')[1] : '';
  if (!zipData) {
    throw new Error('PLAINSPACE_MODULES_ZIP_DATA_UNAVAILABLE: Could not read ZIP data');
  }
  return zipData;
}

export async function fetchModuleLists(
  emit: ModulesEmitter,
  jwt: string | null | undefined
): Promise<{ installed: ModuleRecord[]; system: ModuleRecord[] }> {
  const meltdownEmit = requireEmitter(emit);
  const [installedRes, systemRes] = await Promise.all([
    meltdownEmit('getModuleRegistry', {
      jwt,
      ...MODULE_LOADER_MODULE
    }),
    meltdownEmit('listSystemModules', {
      jwt,
      ...MODULE_LOADER_MODULE
    })
  ]);

  return {
    installed: toModules(installedRes),
    system: toModules(systemRes)
  };
}

export async function toggleModuleRegistryActivation(
  emit: ModulesEmitter,
  jwt: string | null | undefined,
  moduleRecord: ModuleRecord,
  approvedAccess?: ModuleAccessRequest[] | string[]
): Promise<boolean> {
  const meltdownEmit = requireEmitter(emit);
  const nextActive = !moduleRecord.is_active;
  const payload: Record<string, unknown> = {
    jwt,
    ...MODULE_LOADER_MODULE,
    targetModuleName: moduleRecord.module_name
  };
  if (Array.isArray(approvedAccess)) payload.approvedAccess = approvedAccess;
  await meltdownEmit(moduleRecord.is_active ? 'deactivateModuleInRegistry' : 'activateModuleInRegistry', payload);
  return nextActive;
}

export async function inspectModuleZip(
  emit: ModulesEmitter,
  jwt: string | null | undefined,
  zipData: string
): Promise<ModuleZipInspection> {
  const meltdownEmit = requireEmitter(emit);
  const res = await meltdownEmit('inspectModuleZipAccess', {
    jwt,
    ...MODULE_LOADER_MODULE,
    zipData
  });
  return toModuleZipInspection(res);
}

export async function installModuleZip(
  emit: ModulesEmitter,
  jwt: string | null | undefined,
  zipData: string,
  approvedAccess: ModuleAccessRequest[] | string[] = []
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await meltdownEmit('installModuleFromZip', {
    jwt,
    ...MODULE_LOADER_MODULE,
    zipData,
    approvedAccess
  });
}
