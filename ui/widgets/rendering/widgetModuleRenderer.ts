import { mountWidgetModule } from './widgetModuleMount.js';
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
  instanceMetadata: Record<string, any> = {},
  scene?: Record<string, any>
): Promise<void> {
  const ctx: Record<string, any> = {
    id: instanceId,
    widgetId: widgetDef.id,
    ...(widgetDef.codeUrl?.startsWith('/widgets/') ? { preview: true } : {}),
    metadata: widgetDef.metadata,
    instanceMetadata
  };
  if (window.ADMIN_TOKEN) ctx.jwt = window.ADMIN_TOKEN;

  if (scene) ctx.scene = scene;
  await mountWidgetModule(container, widgetDef, loadWidgetModule, () => ctx);
}
