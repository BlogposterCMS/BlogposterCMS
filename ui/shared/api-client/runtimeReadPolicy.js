// Scheduling hints only. The server facade still authorizes every HTTP request.
// Unknown actions are ordered commands, never inferred from a name like "get".
const ADMIN_READS = {
    pages: ['get', 'getBySlug', 'children', 'byLane', 'list', 'start', 'envelope', 'search'],
    plainSpace: ['widgetRegistry', 'globalLayoutTemplate', 'layoutTemplate', 'layoutForViewport'],
    colors: ['list'],
    fontPackages: ['list'],
    settings: ['public', 'get', 'list', 'cmsMode'],
    modules: ['registry', 'system', 'activeStaticFrontends'],
    apps: ['list', 'get', 'builderList']
};
export function isConcurrentAdminRead(eventName, payload) {
    return eventName === 'cmsAdminApiRequest'
        && payload.moduleName === 'runtimeManager' && payload.moduleType === 'core'
        && Object.prototype.hasOwnProperty.call(ADMIN_READS, String(payload.resource))
        && (ADMIN_READS[String(payload.resource)]?.includes(String(payload.action)) === true);
}
export function isReusableRuntimeRead(eventName, payload) {
    if (eventName !== 'cmsPublicRuntimeRequest' && !isConcurrentAdminRead(eventName, payload))
        return false;
    // Do not cache page content, permissions or user records. This short-lived
    // document cache only shares common presentation data across widgets/routes.
    return (payload.resource === 'plainSpace' && payload.action === 'widgetRegistry')
        || (payload.resource === 'settings' && payload.action === 'public');
}
