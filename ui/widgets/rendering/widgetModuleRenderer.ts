import { loadWidgetModule } from './widgetModuleLoader.js';

export type WidgetModuleDefinition = {
  id: string;
  metadata?: Record<string, any>;
  codeUrl?: string;
};

export async function renderWidgetModule(
  container: HTMLElement,
  widgetDef: WidgetModuleDefinition,
  instanceId?: string,
  instanceMetadata: Record<string, any> = {}
): Promise<void> {
  if (!widgetDef.codeUrl) return;

  const ctx: Record<string, any> = {
    id: instanceId,
    widgetId: widgetDef.id,
    metadata: widgetDef.metadata,
    instanceMetadata
  };
  if (window.ADMIN_TOKEN) ctx.jwt = window.ADMIN_TOKEN;

  try {
    const module = await loadWidgetModule(widgetDef.codeUrl);
    if (!module) {
      console.warn('[Widgets] blocked widget import path', widgetDef.id, widgetDef.codeUrl);
      return;
    }
    module.render?.(container, ctx);
  } catch (err) {
    console.error('[Widgets] widget import error', err);
  }
}
