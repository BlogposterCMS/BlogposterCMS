function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('SHELL_USER_COLOR_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
export function isValidHex(color) {
    return typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color);
}
export function userIdFromTokenResult(value) {
    if (!value || typeof value !== 'object')
        return null;
    const userId = value.userId;
    return typeof userId === 'string' || typeof userId === 'number' ? userId : null;
}
export function uiColorFromUserDetails(value) {
    if (!value || typeof value !== 'object')
        return null;
    const result = value;
    const user = result.data ?? result;
    return isValidHex(user.ui_color) ? user.ui_color : null;
}
export async function fetchUserColor(emit, jwt) {
    if (!jwt)
        return null;
    const meltdownEmit = requireEmitter(emit);
    const decoded = await meltdownEmit('validateToken', {
        moduleName: 'auth',
        moduleType: 'core',
        jwt,
        tokenToValidate: jwt
    });
    const userId = userIdFromTokenResult(decoded);
    if (!userId)
        return null;
    const res = await meltdownEmit('getUserDetailsById', {
        moduleName: 'userManagement',
        moduleType: 'core',
        userId,
        jwt
    });
    return uiColorFromUserDetails(res);
}
