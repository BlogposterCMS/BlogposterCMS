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
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export function permissionsPromptDefault(value) {
    return typeof value === 'string' ? value : JSON.stringify(value || {});
}
export async function fetchUsers(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await meltdownEmit('getAllUsers', {
        jwt,
        moduleName: 'userManagement',
        moduleType: 'core'
    });
    return toUsers(res);
}
export async function fetchRoles(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await meltdownEmit('getAllRoles', {
        jwt,
        moduleName: 'userManagement',
        moduleType: 'core'
    });
    return toRoles(res);
}
export async function createUserRecord(emit, jwt, user) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('createUser', {
        jwt,
        moduleName: 'userManagement',
        moduleType: 'core',
        username: user.username,
        password: user.password,
        email: user.email
    });
}
export async function createRoleRecord(emit, jwt, role) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('createRole', {
        jwt,
        moduleName: 'userManagement',
        moduleType: 'core',
        roleName: role.roleName,
        permissions: role.permissions
    });
}
export async function updateRoleRecord(emit, jwt, role, values) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('updateRole', {
        jwt,
        moduleName: 'userManagement',
        moduleType: 'core',
        roleId: role.id,
        newRoleName: values.roleName,
        newDescription: values.description,
        newPermissions: values.permissions
    });
}
export async function deleteRoleRecord(emit, jwt, role) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('deleteRole', {
        jwt,
        moduleName: 'userManagement',
        moduleType: 'core',
        roleId: role.id
    });
}
