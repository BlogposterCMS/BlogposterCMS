import {
  fetchModuleLists,
  fetchModuleUpdateStatuses,
  inspectModuleUpdate,
  installModuleUpdate,
  mergeModuleUpdateStatuses,
  moduleUpdateStatus,
  renderModuleMeta,
  type ModuleAccessRequest,
  type ModuleRecord,
  type ModuleUpdateInspection,
  type ModuleUpdateStatus
} from '../modulesListData.js';

type UpdateCenterEmitter = Window['meltdownEmit'];

export interface UpdateCenterRow {
  moduleName: string;
  currentVersion: string;
  latestVersion: string;
  meta: string;
  status: string;
  statusLabel: string;
  statusTone: 'neutral' | 'ok' | 'warning' | 'danger';
  available: boolean;
  record: ModuleRecord;
  updateStatus: ModuleUpdateStatus | null;
}

function moduleInfoFromRecord(moduleRecord: ModuleRecord) {
  return moduleRecord.module_info || moduleRecord.moduleInfo || {};
}

export function moduleNameFromRecord(moduleRecord: ModuleRecord): string {
  const info = moduleInfoFromRecord(moduleRecord);
  return info.moduleName || moduleRecord.module_name || '';
}

export function updateStatusLabel(status: ModuleUpdateStatus | null): string {
  if (!status) return 'Not checked';
  if (status.available) return status.latestVersion ? `Update v${status.latestVersion}` : 'Update available';
  if (status.status === 'current') return 'Current';
  if (status.status === 'not_configured') return 'No source';
  if (status.status === 'asset_missing') return 'No matching asset';
  if (status.status === 'error') return 'Check failed';
  return status.status || 'Not checked';
}

export function updateStatusTone(status: ModuleUpdateStatus | null): UpdateCenterRow['statusTone'] {
  if (!status) return 'neutral';
  if (status.available) return 'warning';
  if (status.status === 'current') return 'ok';
  if (status.status === 'error') return 'danger';
  return 'neutral';
}

export function toUpdateCenterRows(records: ModuleRecord[]): UpdateCenterRow[] {
  return records.map(record => {
    const info = moduleInfoFromRecord(record);
    const status = moduleUpdateStatus(record);
    return {
      moduleName: moduleNameFromRecord(record),
      currentVersion: status?.currentVersion || info.version || '',
      latestVersion: status?.latestVersion || '',
      meta: renderModuleMeta(info),
      status: status?.status || 'not_checked',
      statusLabel: updateStatusLabel(status),
      statusTone: updateStatusTone(status),
      available: status?.available === true,
      record,
      updateStatus: status
    };
  });
}

export function updateCenterRowLabel(row: UpdateCenterRow): string {
  return row.moduleName || 'Module';
}

export function updateInspectionLabel(
  inspection: ModuleUpdateInspection,
  fallback = 'module'
): string {
  return inspection.moduleName || inspection.moduleInfo?.moduleName || fallback;
}

export function updateInstallVersion(
  row: UpdateCenterRow,
  inspection: ModuleUpdateInspection
): string {
  return inspection.latestVersion || inspection.moduleInfo?.version || row.latestVersion || '';
}

export async function fetchUpdateCenterRows(
  emit: UpdateCenterEmitter,
  jwt: string | null | undefined
): Promise<UpdateCenterRow[]> {
  const [{ installed }, statuses] = await Promise.all([
    fetchModuleLists(emit, jwt),
    fetchModuleUpdateStatuses(emit, jwt)
  ]);
  return toUpdateCenterRows(mergeModuleUpdateStatuses(installed, statuses));
}

export async function inspectUpdateCenterModule(
  emit: UpdateCenterEmitter,
  jwt: string | null | undefined,
  moduleName: string
): Promise<ModuleUpdateInspection> {
  return inspectModuleUpdate(emit, jwt, moduleName);
}

export async function inspectUpdateCenterRow(
  emit: UpdateCenterEmitter,
  jwt: string | null | undefined,
  row: UpdateCenterRow
): Promise<ModuleUpdateInspection> {
  return inspectUpdateCenterModule(emit, jwt, row.moduleName);
}

export async function installUpdateCenterModule(
  emit: UpdateCenterEmitter,
  jwt: string | null | undefined,
  moduleName: string,
  approvedAccess: ModuleAccessRequest[] = []
): Promise<void> {
  await installModuleUpdate(emit, jwt, moduleName, approvedAccess);
}

export async function installUpdateCenterRow(
  emit: UpdateCenterEmitter,
  jwt: string | null | undefined,
  row: UpdateCenterRow,
  approvedAccess: ModuleAccessRequest[] = []
): Promise<void> {
  await installUpdateCenterModule(emit, jwt, row.moduleName, approvedAccess);
}

export function approvedAccessDescriptors(accessList: ModuleAccessRequest[] = []): ModuleAccessRequest[] {
  return accessList
    .filter(access => access.resource && access.action)
    .map(access => ({
      resource: access.resource,
      action: access.action
    }));
}
