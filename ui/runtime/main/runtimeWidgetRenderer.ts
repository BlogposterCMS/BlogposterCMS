import { registerRuntimeWidgetEvents } from './runtimeWidgetEvents.js';
import {
  renderInlineWidgetCode,
  type RuntimeRenderCode
} from './runtimeWidgetInlineCode.js';
import { createRuntimeWidgetShell } from './runtimeWidgetShell.js';
import { renderRuntimeWidgetModule } from './runtimeWidgetModuleRenderer.js';
import type { RuntimeWidgetDefinition } from './runtimeWidgetTypes.js';

export type { RuntimeWidgetDefinition } from './runtimeWidgetTypes.js';

export async function renderWidget(
  wrapper: HTMLElement,
  def: RuntimeWidgetDefinition,
  code: RuntimeRenderCode = null,
  lane = 'public'
): Promise<void> {
  const { root, container } = createRuntimeWidgetShell(wrapper, lane);

  await registerRuntimeWidgetEvents(def, lane);

  if (code) {
    renderInlineWidgetCode(wrapper, root, container, code);
    return;
  }

  await renderRuntimeWidgetModule(wrapper, container, def, lane);
}
