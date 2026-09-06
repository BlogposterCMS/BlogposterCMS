import {
  renderInlineWidgetCode,
  type RuntimeRenderCode
} from './runtimeWidgetInlineCode.js';
import { hasInlineWidgetCode, instanceMetadataFromCode } from './widgetRuntimeGateway.js';
import { createRuntimeWidgetShell } from './runtimeWidgetShell.js';
import { renderRuntimeWidgetModule } from './runtimeWidgetModuleRenderer.js';
import type { RuntimeWidgetDefinition } from './runtimeWidgetTypes.js';

export type { RuntimeWidgetDefinition } from './runtimeWidgetTypes.js';

export async function renderWidget(
  wrapper: HTMLElement,
  def: RuntimeWidgetDefinition,
  code: RuntimeRenderCode = null,
  lane = 'public',
  options: { emit?: (...args: any[]) => Promise<any> } = {}
): Promise<void> {
  const { root, container } = createRuntimeWidgetShell(wrapper, lane);
  const instanceMetadata = instanceMetadataFromCode(code);

  // Widgets render directly; existing runtime facades authorize their reads.

  if (hasInlineWidgetCode(code)) {
    renderInlineWidgetCode(wrapper, root, container, code);
    return;
  }

  await renderRuntimeWidgetModule(wrapper, container, def, lane, instanceMetadata, {
    emit: options.emit
  });
}
