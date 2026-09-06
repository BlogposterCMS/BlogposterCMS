import {
  renderWidgetInlineCode,
  hasInlineWidgetCode,
  instanceMetadataFromCode,
  type WidgetRenderData
} from './widgetInlineCode.js';
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
  context = 'Widgets',
  options: { scene?: Record<string, any>; onInlineRendered?: (container: HTMLElement) => void } = {}
): Promise<void> {
  const instanceId = wrapper.dataset.instanceId;
  const data = customData || (instanceId && codeMap ? codeMap[instanceId] : null);
  const content = wrapper.querySelector<HTMLElement>('.canvas-item-content');

  if (!content) {
    console.error('[renderWidget] .canvas-item-content not found for', widgetDef.id);
    return;
  }

  const container = createWidgetRenderShell(content);

  // API metadata documents dependencies. The facade authorizes each request;
  // rendering does not register browser-supplied actions or grant permissions.

  if (hasInlineWidgetCode(data)) {
    renderWidgetInlineCode(wrapper, content, container, data, context, options.onInlineRendered);
    return;
  }

  await renderWidgetModule(container, widgetDef, instanceId, instanceMetadataFromCode(data), options.scene);
}
