import { createRoleRecord, deleteRoleRecord, errorMessage, fetchRoles, permissionsPromptDefault, updateRoleRecord } from './usersListData.js';
export { createRoleRecord, deleteRoleRecord, errorMessage, fetchRoles, permissionsPromptDefault, updateRoleRecord };
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('meltdownEmit unavailable');
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
export function toPermissions(value) {
    return toArray(value).filter((item) => Boolean(item) && typeof item === 'object');
}
export async function fetchPermissions(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await meltdownEmit('getAllPermissions', {
        jwt,
        moduleName: 'userManagement',
        moduleType: 'core'
    });
    return toPermissions(res);
}
export async function fetchPermissionsState(emit, jwt) {
    const [permissions, roles] = await Promise.all([
        fetchPermissions(emit, jwt),
        fetchRoles(emit, jwt)
    ]);
    return { permissions, roles };
}
export async function createPermissionRecord(emit, jwt, permission) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('createPermission', {
        jwt,
        moduleName: 'userManagement',
        moduleType: 'core',
        permissionKey: permission.permissionKey,
        description: permission.description
    });
}
