import type { MeltdownPayload } from './meltdownClient.js';

// Scheduling hints only. The server facade still authorizes every HTTP request.
// Unknown actions are ordered commands, never inferred from a name like "get".
const ADMIN_READS: Record<string, readonly string[]> = {
  pages: ['get', 'getBySlug', 'children', 'byLane', 'list', 'start', 'envelope', 'search'],
  plainSpace: ['widgetRegistry', 'globalLayoutTemplate', 'layoutTemplate', 'layoutForViewport'],
  colors: ['list'],
  fontPackages: ['list'],
  settings: ['public', 'get', 'list', 'cmsMode'],
  modules: ['registry', 'system', 'activeStaticFrontends'],
  apps: ['list', 'get', 'builderList'],
  designer: ['get', 'list', 'getLayout', 'layouts'],
  navigation: ['locations', 'menus', 'getMenu', 'tree'],
  content: ['list', 'get', 'revisions', 'revision', 'scheduled', 'trashed'],
  contentTypes: ['list', 'get'],
  media: ['list', 'get', 'listVariants', 'listForContent', 'listContent', 'listLocalFolder'],
  users: ['list', 'me', 'get', 'getByUsername', 'count', 'access'],
  roles: ['list'],
  permissions: ['list'],
  auth: ['loginStrategies'],
  fonts: ['listProviders', 'list'],
  sitePresets: ['list']
};

export function isConcurrentAdminRead(eventName: string, payload: MeltdownPayload): boolean {
  return eventName === 'cmsAdminApiRequest'
    && payload.moduleName === 'runtimeManager' && payload.moduleType === 'core'
    && Object.prototype.hasOwnProperty.call(ADMIN_READS, String(payload.resource))
    && (ADMIN_READS[String(payload.resource)]?.includes(String(payload.action)) === true);
}

export function isReusableRuntimeRead(eventName: string, payload: MeltdownPayload): boolean {
  if (eventName !== 'cmsPublicRuntimeRequest' && !isConcurrentAdminRead(eventName, payload)) return false;
  // Do not cache page content, permissions or user records. This short-lived
  // document cache only shares common presentation data across widgets/routes.
  return (payload.resource === 'plainSpace' && payload.action === 'widgetRegistry')
    || (payload.resource === 'settings' && payload.action === 'public');
}
