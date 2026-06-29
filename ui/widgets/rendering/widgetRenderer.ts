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

function hasInlineWidgetCode(data: WidgetRenderData | null | undefined): data is WidgetRenderData {
  return Boolean(data && (
    typeof data.html === 'string' && data.html.trim() ||
    typeof data.css === 'string' && data.css.trim() ||
    typeof data.js === 'string' && data.js.trim()
  ));
}

function parseMetadata(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, any>
      : {};
  } catch {
    return {};
  }
}

function instanceMetadataFromCode(data: WidgetRenderData | null | undefined): Record<string, any> {
  if (!data) return {};
  return {
    ...parseMetadata(data.metadata),
    ...parseMetadata(data.meta)
  };
}

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

  if (hasInlineWidgetCode(data)) {
    renderWidgetInlineCode(wrapper, content, container, data, context);
    return;
  }

  await renderWidgetModule(container, widgetDef, instanceId, instanceMetadataFromCode(data));
}
