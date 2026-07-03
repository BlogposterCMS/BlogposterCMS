import { emitRuntimeAdmin } from '../../../shared/api-client/runtimeFacade.js';
export { fetchPendingModuleAccessRequests, moduleAccessErrorMessage, resolveModuleAccessRequest, toModuleAccessRuntimeRequests } from '../../../shared/module-access/moduleAccessConsentData.js';
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('PLAINSPACE_MODULES_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
function toArray(value) {
    if (Array.isArray(value))
        return value;
    if (value && typeof value === 'object' && Array.isArray(value.data)) {
        return value.data;
    }
    return [];
}
export function toModules(value) {
    return toArray(value).filter((item) => Boolean(item) && typeof item === 'object');
}
export function toModuleZipInspection(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        moduleName: source.moduleName || source.moduleInfo?.moduleName,
        moduleInfo: source.moduleInfo || {},
        permissions: Array.isArray(source.permissions) ? source.permissions : source.moduleInfo?.permissions || [],
        requestedAccess: Array.isArray(source.requestedAccess) ? source.requestedAccess : source.moduleInfo?.requestedAccess || []
    };
}
export function toModuleUpdateStatuses(value) {
    return toArray(value).filter((item) => Boolean(item) && typeof item === 'object');
}
export function toModuleUpdateInspection(value) {
    const source = value && typeof value === 'object' ? value : {};
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
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export function renderModuleMeta(info) {
    const pieces = [];
    if (info.version)
        pieces.push(`v${info.version}`);
    pieces.push(info.developer || 'Unknown Developer');
    if (info.description)
        pieces.push(info.description);
    return pieces.join(' \u2022 ');
}
export function moduleHasModification(moduleRecord) {
    if (!moduleRecord)
        return false;
    const info = moduleRecord.module_info || moduleRecord.moduleInfo || {};
    return Boolean(moduleRecord.hasModification ||
        moduleRecord.has_modification ||
        moduleRecord.modification?.hasModification ||
        info.hasModification ||
        info.modification?.hasModification);
}
export function moduleUpdateStatus(moduleRecord) {
    if (!moduleRecord)
        return null;
    return moduleRecord.updateStatus || null;
}
export function moduleHasUpdate(moduleRecord) {
    return moduleUpdateStatus(moduleRecord)?.available === true;
}
function moduleRecordName(moduleRecord) {
    const info = moduleRecord.module_info || moduleRecord.moduleInfo || {};
    return info.moduleName || moduleRecord.module_name || '';
}
export function mergeModuleUpdateStatuses(records, statuses) {
    const byName = new Map(statuses
        .filter(status => status.moduleName)
        .map(status => [status.moduleName, status]));
    return records.map(record => {
        const status = byName.get(moduleRecordName(record));
        return status ? { ...record, updateStatus: status } : record;
    });
}
export function zipDataFromDataUrl(value) {
    const raw = typeof value === 'string' ? value : '';
    const zipData = raw.includes(',') ? raw.split(',')[1] : '';
    if (!zipData) {
        throw new Error('PLAINSPACE_MODULES_ZIP_DATA_UNAVAILABLE: Could not read ZIP data');
    }
    return zipData;
}
export async function fetchModuleLists(emit, jwt) {
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
export async function toggleModuleRegistryActivation(emit, jwt, moduleRecord, approvedAccess) {
    const meltdownEmit = requireEmitter(emit);
    const nextActive = !moduleRecord.is_active;
    const payload = {
        targetModuleName: moduleRecord.module_name
    };
    if (Array.isArray(approvedAccess))
        payload.approvedAccess = approvedAccess;
    await emitRuntimeAdmin(meltdownEmit, jwt, 'modules', moduleRecord.is_active ? 'deactivate' : 'activate', payload);
    return nextActive;
}
export async function fetchModuleUpdateStatuses(emit, jwt, targetModuleName) {
    const meltdownEmit = requireEmitter(emit);
    const params = {};
    if (targetModuleName)
        params.targetModuleName = targetModuleName;
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'modules', 'checkUpdates', params);
    return toModuleUpdateStatuses(res);
}
export async function inspectModuleZip(emit, jwt, zipData) {
    const meltdownEmit = requireEmitter(emit);
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'modules', 'inspectZip', { zipData });
    return toModuleZipInspection(res);
}
export async function inspectModuleUpdate(emit, jwt, targetModuleName) {
    const meltdownEmit = requireEmitter(emit);
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'modules', 'inspectUpdate', { targetModuleName });
    return toModuleUpdateInspection(res);
}
export async function installModuleZip(emit, jwt, zipData, approvedAccess = []) {
    const meltdownEmit = requireEmitter(emit);
    await emitRuntimeAdmin(meltdownEmit, jwt, 'modules', 'installZip', {
        zipData,
        approvedAccess
    });
}
export async function installModuleUpdate(emit, jwt, targetModuleName, approvedAccess = []) {
    const meltdownEmit = requireEmitter(emit);
    await emitRuntimeAdmin(meltdownEmit, jwt, 'modules', 'installUpdate', {
        targetModuleName,
        approvedAccess
    });
}
export async function setModuleUpdateSource(emit, jwt, targetModuleName, trustedUpdateSource) {
    const meltdownEmit = requireEmitter(emit);
    await emitRuntimeAdmin(meltdownEmit, jwt, 'modules', 'setUpdateSource', {
        targetModuleName,
        trustedUpdateSource
    });
}
