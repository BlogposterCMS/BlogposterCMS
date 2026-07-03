import { fetchModuleLists, fetchModuleUpdateStatuses, inspectModuleUpdate, installModuleUpdate, mergeModuleUpdateStatuses, moduleUpdateStatus, renderModuleMeta } from '../modulesListData.js';
function moduleInfoFromRecord(moduleRecord) {
    return moduleRecord.module_info || moduleRecord.moduleInfo || {};
}
export function moduleNameFromRecord(moduleRecord) {
    const info = moduleInfoFromRecord(moduleRecord);
    return info.moduleName || moduleRecord.module_name || '';
}
export function updateStatusLabel(status) {
    if (!status)
        return 'Not checked';
    if (status.available)
        return status.latestVersion ? `Update v${status.latestVersion}` : 'Update available';
    if (status.status === 'current')
        return 'Current';
    if (status.status === 'not_configured')
        return 'No source';
    if (status.status === 'asset_missing')
        return 'No matching asset';
    if (status.status === 'error')
        return 'Check failed';
    return status.status || 'Not checked';
}
export function updateStatusTone(status) {
    if (!status)
        return 'neutral';
    if (status.available)
        return 'warning';
    if (status.status === 'current')
        return 'ok';
    if (status.status === 'error')
        return 'danger';
    return 'neutral';
}
export function toUpdateCenterRows(records) {
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
export function updateCenterRowLabel(row) {
    return row.moduleName || 'Module';
}
export function updateInspectionLabel(inspection, fallback = 'module') {
    return inspection.moduleName || inspection.moduleInfo?.moduleName || fallback;
}
export function updateInstallVersion(row, inspection) {
    return inspection.latestVersion || inspection.moduleInfo?.version || row.latestVersion || '';
}
export async function fetchUpdateCenterRows(emit, jwt) {
    const [{ installed }, statuses] = await Promise.all([
        fetchModuleLists(emit, jwt),
        fetchModuleUpdateStatuses(emit, jwt)
    ]);
    return toUpdateCenterRows(mergeModuleUpdateStatuses(installed, statuses));
}
export async function inspectUpdateCenterModule(emit, jwt, moduleName) {
    return inspectModuleUpdate(emit, jwt, moduleName);
}
export async function inspectUpdateCenterRow(emit, jwt, row) {
    return inspectUpdateCenterModule(emit, jwt, row.moduleName);
}
export async function installUpdateCenterModule(emit, jwt, moduleName, approvedAccess = []) {
    await installModuleUpdate(emit, jwt, moduleName, approvedAccess);
}
export async function installUpdateCenterRow(emit, jwt, row, approvedAccess = []) {
    await installUpdateCenterModule(emit, jwt, row.moduleName, approvedAccess);
}
export function approvedAccessDescriptors(accessList = []) {
    return accessList
        .filter(access => access.resource && access.action)
        .map(access => ({
        resource: access.resource,
        action: access.action
    }));
}
