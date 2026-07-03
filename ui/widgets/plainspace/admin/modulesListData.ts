import { emitRuntimeAdmin } from '../../../shared/api-client/runtimeFacade.js';

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
  hasModification?: boolean;
  modification?: ModuleModificationSummary;
  permissions?: ModulePermissionDeclaration[];
  requestedAccess?: ModuleAccessRequest[];
  trustedAccessGrants?: ModuleAccessGrant[];
  trustedUpdateSource?: ModuleUpdateSource;
  updateState?: Record<string, unknown>;
}

export interface ModuleModificationSummary {
  hasModification?: boolean;
  valid?: boolean;
  source?: string;
  path?: string;
  fileCount?: number;
  errorCode?: string;
  errorMessage?: string;
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

export interface ModuleUpdateSource {
  provider?: string;
  owner?: string;
  repo?: string;
  releaseChannel?: string;
  assetPattern?: string;
  sha256AssetPattern?: string;
  signatureAssetPattern?: string;
  publicKey?: string | null;
  enabled?: boolean;
}

export interface ModuleUpdateStatus {
  moduleName?: string;
  currentVersion?: string;
  latestVersion?: string;
  status?: string;
  available?: boolean;
  errorCode?: string;
  errorMessage?: string;
  release?: {
    id?: string | number;
    name?: string;
    tagName?: string;
    htmlUrl?: string;
    prerelease?: boolean;
  };
  asset?: {
    id?: string | number;
    name?: string;
    size?: number;
    browserDownloadUrl?: string;
  };
  source?: {
    provider?: string;
    owner?: string;
    repo?: string;
    releaseChannel?: string;
  };
  hash?: string;
  assetName?: string;
  newPermissions?: ModulePermissionDeclaration[];
  newRequestedAccess?: ModuleAccessRequest[];
  requiresAdminApproval?: boolean;
}

export interface ModuleZipInspection {
  moduleName?: string;
  moduleInfo?: ModuleInfo;
  permissions?: ModulePermissionDeclaration[];
  requestedAccess?: ModuleAccessRequest[];
}

export interface ModuleUpdateInspection extends ModuleZipInspection, ModuleUpdateStatus {}

export interface ModuleRecord {
  module_name?: string;
  module_info?: ModuleInfo;
  moduleInfo?: ModuleInfo;
  is_active?: boolean;
  has_modification?: boolean;
  hasModification?: boolean;
  modification?: ModuleModificationSummary;
  updateStatus?: ModuleUpdateStatus;
}

type ModulesEmitter = Window['meltdownEmit'];

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

export function toModuleUpdateStatuses(value: unknown): ModuleUpdateStatus[] {
  return toArray(value).filter((item): item is ModuleUpdateStatus => Boolean(item) && typeof item === 'object');
}

export function toModuleUpdateInspection(value: unknown): ModuleUpdateInspection {
  const source = value && typeof value === 'object' ? value as ModuleUpdateInspection : {};
  const inspection = toModuleZipInspection(source);
  return {
    ...source,
    moduleName: source.moduleName || inspection.moduleName,
    moduleInfo: inspection.moduleInfo,
    permissions: inspection.permissions,
    requestedAccess: inspection.requestedAccess,
    newPermissions: Array.isArray(source.newPermissions) ? source.newPermissions : [],
    newRequestedAccess: Array.isArray(source.newRequestedAccess) ? source.newRequestedAccess : [],
    requiresAdminApproval: source.requiresAdminApproval === true
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

export function moduleHasModification(moduleRecord: ModuleRecord | null | undefined): boolean {
  if (!moduleRecord) return false;
  const info = moduleRecord.module_info || moduleRecord.moduleInfo || {};
  return Boolean(
    moduleRecord.hasModification ||
    moduleRecord.has_modification ||
    moduleRecord.modification?.hasModification ||
    info.hasModification ||
    info.modification?.hasModification
  );
}

export function moduleUpdateStatus(moduleRecord: ModuleRecord | null | undefined): ModuleUpdateStatus | null {
  if (!moduleRecord) return null;
  return moduleRecord.updateStatus || null;
}

export function moduleHasUpdate(moduleRecord: ModuleRecord | null | undefined): boolean {
  return moduleUpdateStatus(moduleRecord)?.available === true;
}

function moduleRecordName(moduleRecord: ModuleRecord): string {
  const info = moduleRecord.module_info || moduleRecord.moduleInfo || {};
  return info.moduleName || moduleRecord.module_name || '';
}

export function mergeModuleUpdateStatuses(
  records: ModuleRecord[],
  statuses: ModuleUpdateStatus[]
): ModuleRecord[] {
  const byName = new Map(statuses
    .filter(status => status.moduleName)
    .map(status => [status.moduleName as string, status]));
  return records.map(record => {
    const status = byName.get(moduleRecordName(record));
    return status ? { ...record, updateStatus: status } : record;
  });
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
    emitRuntimeAdmin(meltdownEmit, jwt, 'modules', 'registry'),
    emitRuntimeAdmin(meltdownEmit, jwt, 'modules', 'system')
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
    targetModuleName: moduleRecord.module_name
  };
  if (Array.isArray(approvedAccess)) payload.approvedAccess = approvedAccess;
  await emitRuntimeAdmin(
    meltdownEmit,
    jwt,
    'modules',
    moduleRecord.is_active ? 'deactivate' : 'activate',
    payload
  );
  return nextActive;
}

export async function fetchModuleUpdateStatuses(
  emit: ModulesEmitter,
  jwt: string | null | undefined,
  targetModuleName?: string
): Promise<ModuleUpdateStatus[]> {
  const meltdownEmit = requireEmitter(emit);
  const params: Record<string, unknown> = {};
  if (targetModuleName) params.targetModuleName = targetModuleName;
  const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'modules', 'checkUpdates', params);
  return toModuleUpdateStatuses(res);
}

export async function inspectModuleZip(
  emit: ModulesEmitter,
  jwt: string | null | undefined,
  zipData: string
): Promise<ModuleZipInspection> {
  const meltdownEmit = requireEmitter(emit);
  const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'modules', 'inspectZip', { zipData });
  return toModuleZipInspection(res);
}

export async function inspectModuleUpdate(
  emit: ModulesEmitter,
  jwt: string | null | undefined,
  targetModuleName: string
): Promise<ModuleUpdateInspection> {
  const meltdownEmit = requireEmitter(emit);
  const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'modules', 'inspectUpdate', { targetModuleName });
  return toModuleUpdateInspection(res);
}

export async function installModuleZip(
  emit: ModulesEmitter,
  jwt: string | null | undefined,
  zipData: string,
  approvedAccess: ModuleAccessRequest[] | string[] = []
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await emitRuntimeAdmin(meltdownEmit, jwt, 'modules', 'installZip', {
    zipData,
    approvedAccess
  });
}

export async function installModuleUpdate(
  emit: ModulesEmitter,
  jwt: string | null | undefined,
  targetModuleName: string,
  approvedAccess: ModuleAccessRequest[] | string[] = []
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await emitRuntimeAdmin(meltdownEmit, jwt, 'modules', 'installUpdate', {
    targetModuleName,
    approvedAccess
  });
}

export async function setModuleUpdateSource(
  emit: ModulesEmitter,
  jwt: string | null | undefined,
  targetModuleName: string,
  trustedUpdateSource: ModuleUpdateSource
): Promise<void> {
  const meltdownEmit = requireEmitter(emit);
  await emitRuntimeAdmin(meltdownEmit, jwt, 'modules', 'setUpdateSource', {
    targetModuleName,
    trustedUpdateSource
  });
}
