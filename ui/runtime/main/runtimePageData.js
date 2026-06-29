import { normalizeDataList, normalizeLayoutResponse, unwrapData } from './runtimePageDataHelpers.js';
export { adminLaneAuthPayload, laneAuthPayload, normalizeDataList, normalizeLayoutResponse, resolveRuntimeWidgetLane, unwrapData } from './runtimePageDataHelpers.js';
function cmsPublicRuntimePayload(resource, action, params = {}) {
    return {
        moduleName: 'runtimeManager',
        moduleType: 'core',
        resource,
        action,
        params
    };
}
function cmsAdminPayload(resource, action, params = {}) {
    return {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'runtimeManager',
        moduleType: 'core',
        resource,
        action,
        params
    };
}
export async function fetchRuntimePageBySlug(emit, slug, lane) {
    const eventName = lane === 'admin' ? 'cmsAdminApiRequest' : 'cmsPublicRuntimeRequest';
    const payload = lane === 'admin'
        ? cmsAdminPayload('pages', 'getBySlug', { slug, lane })
        : cmsPublicRuntimePayload('pages', 'getBySlug', { slug, lane });
    return unwrapData(await emit(eventName, payload));
}
export async function fetchRuntimePageById(emit, pageId, lane) {
    const eventName = lane === 'admin' ? 'cmsAdminApiRequest' : 'cmsPublicRuntimeRequest';
    const payload = lane === 'admin'
        ? cmsAdminPayload('pages', 'get', { pageId, lane })
        : cmsPublicRuntimePayload('pages', 'get', { pageId, lane });
    return unwrapData(await emit(eventName, payload));
}
export async function fetchRuntimeChildPages(emit, parentId, lane) {
    const eventName = lane === 'admin' ? 'cmsAdminApiRequest' : 'cmsPublicRuntimeRequest';
    const payload = lane === 'admin'
        ? cmsAdminPayload('pages', 'children', { parentId, lane })
        : cmsPublicRuntimePayload('pages', 'children', { parentId, lane });
    return normalizeDataList(await emit(eventName, payload));
}
export async function fetchRuntimeWidgetRegistry(emit, lane, widgetLane) {
    const eventName = lane === 'admin' ? 'cmsAdminApiRequest' : 'cmsPublicRuntimeRequest';
    const payload = lane === 'admin'
        ? cmsAdminPayload('plainSpace', 'widgetRegistry', { lane: widgetLane })
        : cmsPublicRuntimePayload('plainSpace', 'widgetRegistry', { lane: widgetLane });
    const data = unwrapData(await emit(eventName, payload));
    return data && typeof data === 'object' && Array.isArray(data.widgets)
        ? data.widgets
        : [];
}
export async function loadRuntimeGlobalLayout(emit, lane) {
    const eventName = lane === 'admin' ? 'cmsAdminApiRequest' : 'cmsPublicRuntimeRequest';
    const payload = lane === 'admin'
        ? cmsAdminPayload('plainSpace', 'globalLayoutTemplate', { lane })
        : cmsPublicRuntimePayload('plainSpace', 'globalLayoutTemplate', { lane });
    return normalizeLayoutResponse(unwrapData(await emit(eventName, payload)));
}
export async function loadRuntimeLayoutTemplate(emit, name, lane) {
    const eventName = lane === 'admin' ? 'cmsAdminApiRequest' : 'cmsPublicRuntimeRequest';
    const payload = lane === 'admin'
        ? cmsAdminPayload('plainSpace', 'layoutTemplate', { name, lane })
        : cmsPublicRuntimePayload('plainSpace', 'layoutTemplate', { name, lane });
    return normalizeLayoutResponse(unwrapData(await emit(eventName, payload)));
}
export async function loadRuntimeLayoutForViewport(emit, pageId, lane, viewport = 'desktop') {
    const eventName = lane === 'admin' ? 'cmsAdminApiRequest' : 'cmsPublicRuntimeRequest';
    const payload = lane === 'admin'
        ? cmsAdminPayload('plainSpace', 'layoutForViewport', { pageId, lane, viewport })
        : cmsPublicRuntimePayload('plainSpace', 'layoutForViewport', { pageId, lane, viewport });
    return normalizeLayoutResponse(unwrapData(await emit(eventName, payload)));
}
export async function fetchRuntimeDesign(emit, designId, lane) {
    const eventName = lane === 'admin' ? 'cmsAdminApiRequest' : 'cmsPublicRuntimeRequest';
    const payload = lane === 'admin'
        ? cmsAdminPayload('designer', 'get', { id: designId, lane })
        : cmsPublicRuntimePayload('designer', 'get', { id: designId, lane });
    return unwrapData(await emit(eventName, payload));
}
export async function saveRuntimeLayoutForViewport(emit, pageId, lane, layout, viewport = 'desktop') {
    return unwrapData(await emit('cmsAdminApiRequest', cmsAdminPayload('plainSpace', 'saveLayoutForViewport', {
        pageId,
        lane,
        viewport,
        layout
    })));
}
