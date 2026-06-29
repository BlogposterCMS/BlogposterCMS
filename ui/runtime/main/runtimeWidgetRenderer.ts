import { registerRuntimeWidgetEvents } from './runtimeWidgetEvents.js';
import {
  renderInlineWidgetCode,
  type RuntimeRenderCode
} from './runtimeWidgetInlineCode.js';
import { parseMetadata } from './sceneRuntime.js';
import { createRuntimeWidgetShell } from './runtimeWidgetShell.js';
import { renderRuntimeWidgetModule } from './runtimeWidgetModuleRenderer.js';
import type { RuntimeWidgetDefinition } from './runtimeWidgetTypes.js';

export type { RuntimeWidgetDefinition } from './runtimeWidgetTypes.js';

function hasInlineWidgetCode(code: RuntimeRenderCode): code is NonNullable<RuntimeRenderCode> {
  return Boolean(code && (
    typeof code.html === 'string' && code.html.trim() ||
    typeof code.css === 'string' && code.css.trim() ||
    typeof code.js === 'string' && code.js.trim()
  ));
}

function instanceMetadataFromCode(code: RuntimeRenderCode): Record<string, any> {
  if (!code) return {};
  return {
    ...parseMetadata(code.metadata),
    ...parseMetadata(code.meta)
  };
}

export async function renderWidget(
  wrapper: HTMLElement,
  def: RuntimeWidgetDefinition,
  code: RuntimeRenderCode = null,
  lane = 'public',
  options: { emit?: (...args: any[]) => Promise<any> } = {}
): Promise<void> {
  const { root, container } = createRuntimeWidgetShell(wrapper, lane);
  const instanceMetadata = instanceMetadataFromCode(code);

  await registerRuntimeWidgetEvents(def, lane);

  if (hasInlineWidgetCode(code)) {
    renderInlineWidgetCode(wrapper, root, container, code);
    return;
  }

  await renderRuntimeWidgetModule(wrapper, container, def, lane, instanceMetadata, {
    emit: options.emit
  });
}
