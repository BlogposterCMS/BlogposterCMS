export const userEditTextFields = [
    'username',
    'email',
    'first_name',
    'last_name',
    'display_name',
    'phone',
    'company',
    'website',
    'avatar_url',
    'bio'
];
const USER_MANAGEMENT_MODULE = {
    moduleName: 'userManagement',
    moduleType: 'core'
};
// Keep user-management event names and payload shapes outside the DOM widget.
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('PLAINSPACE_USER_EDIT_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export function toUser(value) {
    const candidate = value && typeof value === 'object' && 'data' in value
        ? value.data
        : value;
    return candidate && typeof candidate === 'object' ? candidate : null;
}
function toArray(value) {
    if (Array.isArray(value))
        return value;
    if (value && typeof value === 'object' && Array.isArray(value.data)) {
        return value.data;
    }
    return [];
}
export function toRoles(value) {
    return toArray(value).filter((item) => Boolean(item) && typeof item === 'object');
}
export function toPermissions(value) {
    return toArray(value).filter((item) => Boolean(item) && typeof item === 'object');
}
export function toUserAccess(value) {
    const source = value && typeof value === 'object' && 'data' in value
        ? value.data
        : value;
    return source && typeof source === 'object' ? source : {};
}
export function userValue(user, field) {
    return user[field] == null ? '' : String(user[field]);
}
export function buildUserProfilePayload(jwt, userId, values) {
    const payload = {
        jwt,
        ...USER_MANAGEMENT_MODULE,
        userId,
        newUsername: values.username.trim(),
        newEmail: values.email.trim(),
        newFirstName: values.first_name.trim(),
        newLastName: values.last_name.trim(),
        newDisplayName: values.display_name.trim(),
        newPhone: values.phone.trim(),
        newCompany: values.company.trim(),
        newWebsite: values.website.trim(),
        newAvatarUrl: values.avatar_url.trim(),
        newBio: values.bio,
        newUiColor: values.uiColor
    };
    const newPassword = values.password?.trim();
    if (newPassword) {
        payload.newPassword = newPassword;
    }
    return payload;
}
export async function fetchUserDetails(emit, jwt, userId) {
    const meltdownEmit = requireEmitter(emit);
    const res = await meltdownEmit('getUserDetailsById', {
        jwt,
        ...USER_MANAGEMENT_MODULE,
        userId
    });
    return toUser(res);
}
export async function fetchRoles(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await meltdownEmit('getAllRoles', {
        jwt,
        ...USER_MANAGEMENT_MODULE
    });
    return toRoles(res);
}
export async function fetchPermissions(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await meltdownEmit('getAllPermissions', {
        jwt,
        ...USER_MANAGEMENT_MODULE
    });
    return toPermissions(res);
}
export async function fetchUserAccess(emit, jwt, userId) {
    const meltdownEmit = requireEmitter(emit);
    const res = await meltdownEmit('getUserAccess', {
        jwt,
        ...USER_MANAGEMENT_MODULE,
        userId
    });
    return toUserAccess(res);
}
export async function updateUserAccess(emit, jwt, userId, values) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('setUserAccess', {
        jwt,
        ...USER_MANAGEMENT_MODULE,
        userId,
        roleIds: values.roleIds,
        directPermissions: values.directPermissions || {}
    });
}
export async function updateUserProfile(emit, jwt, userId, values) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('updateUserProfile', buildUserProfilePayload(jwt, userId, values));
}
export async function deleteUserRecord(emit, jwt, userId) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('deleteUser', {
        jwt,
        ...USER_MANAGEMENT_MODULE,
        userId
    });
}
