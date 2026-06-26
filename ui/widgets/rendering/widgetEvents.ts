export type WidgetEventDefinition = {
  id: string;
  metadata?: Record<string, any>;
};

export async function registerWidgetEvents(widgetDef: WidgetEventDefinition): Promise<void> {
  const raw = widgetDef.metadata?.apiEvents;
  if (!raw || typeof window.meltdownEmit !== 'function') return;
  const list = Array.isArray(raw) ? raw : [raw];
  const events = list.filter(
    (eventName): eventName is string =>
      typeof eventName === 'string' && /^[\w.:-]{1,64}$/.test(eventName)
  );
  if (!events.length) return;

  const jwt = window.ADMIN_TOKEN || window.PUBLIC_TOKEN;
  if (!jwt) return;

  try {
    await window.meltdownEmit('registerWidgetUsage', { jwt, events });
  } catch (err) {
    console.warn('[Widgets] registerWidgetUsage failed for', widgetDef.id, err);
  }
}
