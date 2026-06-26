function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('SHELL_NOTIFICATION_HUB_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
export function notificationItems(data) {
    return Array.isArray(data)
        ? data.filter((item) => Boolean(item) && typeof item === 'object')
        : [];
}
export async function fetchRecentNotifications(emit, jwt, limit = 5) {
    const meltdownEmit = requireEmitter(emit);
    const data = await meltdownEmit('getRecentNotifications', {
        jwt,
        moduleName: 'notificationManager',
        moduleType: 'core',
        limit
    });
    return notificationItems(data);
}
