import { adminLaneAuthPayload, laneAuthPayload, normalizeDataList, normalizeLayoutResponse, unwrapData } from './runtimePageDataHelpers.js';
export { adminLaneAuthPayload, laneAuthPayload, normalizeDataList, normalizeLayoutResponse, resolveRuntimeWidgetLane, unwrapData } from './runtimePageDataHelpers.js';
export async function fetchRuntimePageBySlug(emit, slug, lane) {
    return unwrapData(await emit('getPageBySlug', {
        moduleName: 'pagesManager',
        moduleType: 'core',
        slug,
        lane
    }));
}
export async function fetchRuntimePageById(emit, pageId, lane) {
    return unwrapData(await emit('getPageById', {
        pageId,
        lane,
        moduleName: 'pagesManager',
        moduleType: 'core',
        ...laneAuthPayload(lane)
    }));
}
export async function fetchRuntimeChildPages(emit, parentId, lane) {
    return normalizeDataList(await emit('getChildPages', {
        parentId,
        moduleName: 'pagesManager',
        moduleType: 'core',
        ...laneAuthPayload(lane)
    }));
}
export async function fetchRuntimeWidgetRegistry(emit, lane, widgetLane) {
    const response = await emit('widget.registry.request.v1', {
        lane: widgetLane,
        moduleName: 'plainspace',
        moduleType: 'core',
        ...adminLaneAuthPayload(lane)
    });
    return response && typeof response === 'object' && Array.isArray(response.widgets)
        ? response.widgets
        : [];
}
export async function loadRuntimeGlobalLayout(emit, lane) {
    return normalizeLayoutResponse(await emit('getGlobalLayoutTemplate', {
        moduleName: 'plainspace',
        moduleType: 'core',
        ...laneAuthPayload(lane),
        lane
    }));
}
export async function loadRuntimeLayoutTemplate(emit, name, lane) {
    return normalizeLayoutResponse(await emit('getLayoutTemplate', {
        name,
        moduleName: 'plainspace',
        moduleType: 'core',
        ...laneAuthPayload(lane),
        lane
    }));
}
export async function loadRuntimeLayoutForViewport(emit, pageId, lane, viewport = 'desktop') {
    return normalizeLayoutResponse(await emit('getLayoutForViewport', {
        ...adminLaneAuthPayload(lane),
        moduleName: 'plainspace',
        moduleType: 'core',
        pageId,
        lane,
        viewport
    }));
}
export async function fetchRuntimeDesign(emit, designId, lane) {
    return emit('designer.getDesign', {
        id: designId,
        moduleName: 'designer',
        moduleType: 'community',
        ...laneAuthPayload(lane)
    });
}
export async function saveRuntimeLayoutForViewport(emit, pageId, lane, layout, viewport = 'desktop') {
    return emit('saveLayoutForViewport', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'plainspace',
        moduleType: 'core',
        pageId,
        lane,
        viewport,
        layout
    });
}
