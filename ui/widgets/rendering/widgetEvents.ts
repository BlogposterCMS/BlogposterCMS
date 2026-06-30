import { runtimeAdminPayload, runtimePublicPayload } from '../../shared/api-client/runtimeFacade.js';

export type WidgetEventDefinition = {
  id: string;
  metadata?: Record<string, any>;
};

export type WidgetApiAction = {
  resource: string;
  action: string;
};

const API_ACTION_PART_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

export function normalizeWidgetApiActions(metadata: Record<string, any> = {}): WidgetApiAction[] {
  const raw = metadata.apiActions;
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  return raw.reduce<WidgetApiAction[]>((actions, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return actions;
    const resource = typeof item.resource === 'string' ? item.resource.trim() : '';
    const action = typeof item.action === 'string' ? item.action.trim() : '';
    if (!API_ACTION_PART_PATTERN.test(resource) || !API_ACTION_PART_PATTERN.test(action)) {
      return actions;
    }
    const key = `${resource}:${action}`;
    if (seen.has(key)) return actions;
    seen.add(key);
    actions.push({ resource, action });
    return actions;
  }, []);
}

export async function registerWidgetEvents(widgetDef: WidgetEventDefinition): Promise<void> {
  if (typeof window.meltdownEmit !== 'function') return;
  const actions = normalizeWidgetApiActions(widgetDef.metadata || {});
  if (!actions.length) return;

  const isAdmin = Boolean(window.ADMIN_TOKEN);
  const jwt = isAdmin ? window.ADMIN_TOKEN : window.PUBLIC_TOKEN;
  if (!jwt) return;

  try {
    await window.meltdownEmit(
      isAdmin ? 'cmsAdminApiRequest' : 'cmsPublicRuntimeRequest',
      isAdmin
        ? runtimeAdminPayload(jwt, 'widgets', 'registerUsage', { actions })
        : runtimePublicPayload(jwt, 'widgets', 'registerUsage', { actions })
    );
  } catch (err) {
    console.warn('[Widgets] registerWidgetUsage failed for', widgetDef.id, err);
  }
}
