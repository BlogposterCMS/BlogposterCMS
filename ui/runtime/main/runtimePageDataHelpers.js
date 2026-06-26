export function laneAuthPayload(lane) {
    return lane === 'admin'
        ? { jwt: window.ADMIN_TOKEN }
        : { jwt: window.PUBLIC_TOKEN };
}
export function adminLaneAuthPayload(lane) {
    return lane === 'admin' ? { jwt: window.ADMIN_TOKEN } : {};
}
export function normalizeLayoutResponse(response) {
    const source = response && typeof response === 'object'
        ? response
        : {};
    return Array.isArray(source.layout) ? source.layout : [];
}
export function normalizeDataList(response) {
    if (Array.isArray(response))
        return response;
    const source = response && typeof response === 'object'
        ? response
        : {};
    return Array.isArray(source.data) ? source.data : [];
}
export function unwrapData(response) {
    return response && typeof response === 'object' && 'data' in response
        ? response.data
        : response;
}
export function resolveRuntimeWidgetLane(lane, config = {}, warn = console.warn) {
    const requestedLane = lane === 'admin'
        ? (config.widgetLane || 'admin')
        : (config.widgetLane || 'public');
    if (lane !== 'admin' && requestedLane === 'admin') {
        warn('[Renderer] widgetLane="admin" on public page => forcing "public"');
        return 'public';
    }
    return lane === 'admin' ? requestedLane : 'public';
}
