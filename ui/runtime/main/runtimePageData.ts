import {
  adminLaneAuthPayload,
  laneAuthPayload,
  normalizeDataList,
  normalizeLayoutResponse,
  unwrapData,
  type LooseRecord
} from './runtimePageDataHelpers.js';

export {
  adminLaneAuthPayload,
  laneAuthPayload,
  normalizeDataList,
  normalizeLayoutResponse,
  resolveRuntimeWidgetLane,
  unwrapData,
  type LooseRecord
} from './runtimePageDataHelpers.js';

export type RuntimeEmitter = (
  eventName: string,
  payload?: LooseRecord
) => Promise<any>;

export async function fetchRuntimePageBySlug(
  emit: RuntimeEmitter,
  slug: string,
  lane: string
): Promise<any> {
  return unwrapData(await emit('getPageBySlug', {
    moduleName: 'pagesManager',
    moduleType: 'core',
    slug,
    lane
  }));
}

export async function fetchRuntimePageById(
  emit: RuntimeEmitter,
  pageId: unknown,
  lane: string
): Promise<any> {
  return unwrapData(await emit('getPageById', {
    pageId,
    lane,
    moduleName: 'pagesManager',
    moduleType: 'core',
    ...laneAuthPayload(lane)
  }));
}

export async function fetchRuntimeChildPages(
  emit: RuntimeEmitter,
  parentId: unknown,
  lane: string
): Promise<LooseRecord[]> {
  return normalizeDataList(await emit('getChildPages', {
    parentId,
    moduleName: 'pagesManager',
    moduleType: 'core',
    ...laneAuthPayload(lane)
  }));
}

export async function fetchRuntimeWidgetRegistry(
  emit: RuntimeEmitter,
  lane: string,
  widgetLane: string
): Promise<LooseRecord[]> {
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

export async function loadRuntimeGlobalLayout(
  emit: RuntimeEmitter,
  lane: string
): Promise<LooseRecord[]> {
  return normalizeLayoutResponse(await emit('getGlobalLayoutTemplate', {
    moduleName: 'plainspace',
    moduleType: 'core',
    ...laneAuthPayload(lane),
    lane
  }));
}

export async function loadRuntimeLayoutTemplate(
  emit: RuntimeEmitter,
  name: string,
  lane: string
): Promise<LooseRecord[]> {
  return normalizeLayoutResponse(await emit('getLayoutTemplate', {
    name,
    moduleName: 'plainspace',
    moduleType: 'core',
    ...laneAuthPayload(lane),
    lane
  }));
}

export async function loadRuntimeLayoutForViewport(
  emit: RuntimeEmitter,
  pageId: unknown,
  lane: string,
  viewport = 'desktop'
): Promise<LooseRecord[]> {
  return normalizeLayoutResponse(await emit('getLayoutForViewport', {
    ...adminLaneAuthPayload(lane),
    moduleName: 'plainspace',
    moduleType: 'core',
    pageId,
    lane,
    viewport
  }));
}

export async function fetchRuntimeDesign(
  emit: RuntimeEmitter,
  designId: unknown,
  lane: string
): Promise<any> {
  return emit('designer.getDesign', {
    id: designId,
    moduleName: 'designer',
    moduleType: 'community',
    ...laneAuthPayload(lane)
  });
}

export async function saveRuntimeLayoutForViewport(
  emit: RuntimeEmitter,
  pageId: unknown,
  lane: string,
  layout: LooseRecord[],
  viewport = 'desktop'
): Promise<any> {
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
