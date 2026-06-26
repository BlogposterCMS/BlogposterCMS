import {
  renderWidgetInlineCode,
  type WidgetRenderData
} from './widgetInlineCode.js';
import { registerWidgetEvents } from './widgetEvents.js';
import {
  renderWidgetModule,
  type WidgetModuleDefinition
} from './widgetModuleRenderer.js';
import { createWidgetRenderShell } from './widgetShell.js';

type WidgetDefinition = WidgetModuleDefinition;

type WidgetCodeMap = Record<string, WidgetRenderData | null | undefined>;

export async function renderWidget(
  wrapper: HTMLElement,
  widgetDef: WidgetDefinition,
  codeMap: WidgetCodeMap | null = null,
  customData: WidgetRenderData | null = null,
  context = 'Widgets'
): Promise<void> {
  const instanceId = wrapper.dataset.instanceId;
  const data = customData || (instanceId && codeMap ? codeMap[instanceId] : null);
  const content = wrapper.querySelector<HTMLElement>('.canvas-item-content');

  if (!content) {
    console.error('[renderWidget] .canvas-item-content not found for', widgetDef.id);
    return;
  }

  const container = createWidgetRenderShell(content);

  await registerWidgetEvents(widgetDef);

  if (data) {
    renderWidgetInlineCode(wrapper, content, container, data, context);
    return;
  }

  await renderWidgetModule(container, widgetDef, instanceId);
}
