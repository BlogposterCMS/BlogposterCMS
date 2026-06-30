import { emitRuntimeAdmin } from '../../../shared/api-client/runtimeFacade.js';
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
export function toUsers(value) {
    return toArray(value).filter((item) => Boolean(item) && typeof item === 'object');
}
export function toRoles(value) {
    return toArray(value).filter((item) => Boolean(item) && typeof item === 'object');
}
export function toPermissions(value) {
    return toArray(value).filter((item) => Boolean(item) && typeof item === 'object');
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export function permissionsPromptDefault(value) {
    return typeof value === 'string' ? value : JSON.stringify(value || {});
}
export function isManagedDirectRole(role) {
    return String(role.role_name || '').startsWith('__user_direct_');
}
export function visiblePermissionGroups(roles) {
    return roles.filter(role => !isManagedDirectRole(role));
}
function setPermissionPath(target, parts) {
    let cursor = target;
    parts.forEach((part, index) => {
        if (index === parts.length - 1) {
            cursor[part] = true;
            return;
        }
        const next = cursor[part];
        if (!next || typeof next !== 'object' || Array.isArray(next)) {
            cursor[part] = {};
        }
        cursor = cursor[part];
    });
}
export function permissionBlobFromKeys(keys) {
    const blob = {};
    Array.from(new Set(keys.map(key => key.trim()).filter(Boolean))).sort().forEach(key => {
        setPermissionPath(blob, key.split('.').filter(Boolean));
    });
    return blob;
}
export function permissionKeysFromBlob(blob, prefix = '') {
    if (!blob || typeof blob !== 'object' || Array.isArray(blob))
        return [];
    const result = [];
    Object.entries(blob).forEach(([key, value]) => {
        const nextKey = prefix ? `${prefix}.${key}` : key;
        if (value === true) {
            result.push(nextKey);
        }
        else {
            result.push(...permissionKeysFromBlob(value, nextKey));
        }
    });
    return result;
}
export function permissionKey(record) {
    return record.permission_key || record.key || '';
}
export function permissionGroupForKey(key) {
    const [group] = key.split('.');
    return group || 'other';
}
export async function fetchUsers(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'users', 'list');
    return toUsers(res);
}
export async function fetchRoles(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'roles', 'list');
    return toRoles(res);
}
export async function fetchPermissions(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'permissions', 'list');
    return toPermissions(res);
}
export async function createUserRecord(emit, jwt, user) {
    const meltdownEmit = requireEmitter(emit);
    await emitRuntimeAdmin(meltdownEmit, jwt, 'users', 'create', {
        username: user.username,
        password: user.password,
        email: user.email,
        roleIds: user.roleIds || [],
        directPermissions: user.directPermissions || {}
    });
}
export async function createRoleRecord(emit, jwt, role) {
    const meltdownEmit = requireEmitter(emit);
    await emitRuntimeAdmin(meltdownEmit, jwt, 'roles', 'create', {
        roleName: role.roleName,
        permissions: role.permissions
    });
}
export async function updateRoleRecord(emit, jwt, role, values) {
    const meltdownEmit = requireEmitter(emit);
    await emitRuntimeAdmin(meltdownEmit, jwt, 'roles', 'update', {
        roleId: role.id,
        newRoleName: values.roleName,
        newDescription: values.description,
        newPermissions: values.permissions
    });
}
export async function deleteRoleRecord(emit, jwt, role) {
    const meltdownEmit = requireEmitter(emit);
    await emitRuntimeAdmin(meltdownEmit, jwt, 'roles', 'delete', { roleId: role.id });
}
