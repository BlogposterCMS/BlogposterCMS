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

function cmsPublicRuntimePayload(resource: string, action: string, params: LooseRecord = {}): LooseRecord {
  return {
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource,
    action,
    params
  };
}

function cmsAdminPayload(resource: string, action: string, params: LooseRecord = {}): LooseRecord {
  return {
    jwt: window.ADMIN_TOKEN,
    moduleName: 'runtimeManager',
    moduleType: 'core',
    resource,
    action,
    params
  };
}

export async function fetchRuntimePageBySlug(
  emit: RuntimeEmitter,
  slug: string,
  lane: string
): Promise<any> {
  const eventName = lane === 'admin' ? 'cmsAdminApiRequest' : 'cmsPublicRuntimeRequest';
  const payload = lane === 'admin'
    ? cmsAdminPayload('pages', 'getBySlug', { slug, lane })
    : cmsPublicRuntimePayload('pages', 'getBySlug', { slug, lane });
  return unwrapData(await emit(eventName, payload));
}

export async function fetchRuntimePageById(
  emit: RuntimeEmitter,
  pageId: unknown,
  lane: string
): Promise<any> {
  const eventName = lane === 'admin' ? 'cmsAdminApiRequest' : 'cmsPublicRuntimeRequest';
  const payload = lane === 'admin'
    ? cmsAdminPayload('pages', 'get', { pageId, lane })
    : cmsPublicRuntimePayload('pages', 'get', { pageId, lane });
  return unwrapData(await emit(eventName, payload));
}

export async function fetchRuntimeChildPages(
  emit: RuntimeEmitter,
  parentId: unknown,
  lane: string
): Promise<LooseRecord[]> {
  const eventName = lane === 'admin' ? 'cmsAdminApiRequest' : 'cmsPublicRuntimeRequest';
  const payload = lane === 'admin'
    ? cmsAdminPayload('pages', 'children', { parentId, lane })
    : cmsPublicRuntimePayload('pages', 'children', { parentId, lane });
  return normalizeDataList(await emit(eventName, payload));
}

export async function fetchRuntimeWidgetRegistry(
  emit: RuntimeEmitter,
  lane: string,
  widgetLane: string
): Promise<LooseRecord[]> {
  const eventName = lane === 'admin' ? 'cmsAdminApiRequest' : 'cmsPublicRuntimeRequest';
  const payload = lane === 'admin'
    ? cmsAdminPayload('plainSpace', 'widgetRegistry', { lane: widgetLane })
    : cmsPublicRuntimePayload('plainSpace', 'widgetRegistry', { lane: widgetLane });
  const data = unwrapData(await emit(eventName, payload));
  return data && typeof data === 'object' && Array.isArray(data.widgets)
    ? data.widgets
    : [];
}

export async function loadRuntimeGlobalLayout(
  emit: RuntimeEmitter,
  lane: string
): Promise<LooseRecord[]> {
  const eventName = lane === 'admin' ? 'cmsAdminApiRequest' : 'cmsPublicRuntimeRequest';
  const payload = lane === 'admin'
    ? cmsAdminPayload('plainSpace', 'globalLayoutTemplate', { lane })
    : cmsPublicRuntimePayload('plainSpace', 'globalLayoutTemplate', { lane });
  return normalizeLayoutResponse(unwrapData(await emit(eventName, payload)));
}

export async function loadRuntimeLayoutTemplate(
  emit: RuntimeEmitter,
  name: string,
  lane: string
): Promise<LooseRecord[]> {
  const eventName = lane === 'admin' ? 'cmsAdminApiRequest' : 'cmsPublicRuntimeRequest';
  const payload = lane === 'admin'
    ? cmsAdminPayload('plainSpace', 'layoutTemplate', { name, lane })
    : cmsPublicRuntimePayload('plainSpace', 'layoutTemplate', { name, lane });
  return normalizeLayoutResponse(unwrapData(await emit(eventName, payload)));
}

export async function loadRuntimeLayoutForViewport(
  emit: RuntimeEmitter,
  pageId: unknown,
  lane: string,
  viewport = 'desktop'
): Promise<LooseRecord[]> {
  const eventName = lane === 'admin' ? 'cmsAdminApiRequest' : 'cmsPublicRuntimeRequest';
  const payload = lane === 'admin'
    ? cmsAdminPayload('plainSpace', 'layoutForViewport', { pageId, lane, viewport })
    : cmsPublicRuntimePayload('plainSpace', 'layoutForViewport', { pageId, lane, viewport });
  return normalizeLayoutResponse(unwrapData(await emit(eventName, payload)));
}

export async function fetchRuntimeDesign(
  emit: RuntimeEmitter,
  designId: unknown,
  lane: string
): Promise<any> {
  const eventName = lane === 'admin' ? 'cmsAdminApiRequest' : 'cmsPublicRuntimeRequest';
  const payload = lane === 'admin'
    ? cmsAdminPayload('designer', 'get', { id: designId, lane })
    : cmsPublicRuntimePayload('designer', 'get', { id: designId, lane });
  return unwrapData(await emit(eventName, payload));
}

export async function saveRuntimeLayoutForViewport(
  emit: RuntimeEmitter,
  pageId: unknown,
  lane: string,
  layout: LooseRecord[],
  viewport = 'desktop'
): Promise<any> {
  return unwrapData(await emit('cmsAdminApiRequest', cmsAdminPayload('plainSpace', 'saveLayoutForViewport', {
    pageId,
    lane,
    viewport,
    layout
  })));
}
