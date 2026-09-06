import { hasInlineWidgetCode } from '../../../widgets/rendering/widgetInlineCode.js';
import { addHitLayer } from '../utils.js';
import { registerElement } from '../editor/editor.js';
import { renderWidget as renderSharedWidget } from '../../../widgets/rendering/widgetRenderer.js';

/** Studio owns editing hooks; saved content and module execution use the widget renderer. */
export async function renderWidget(wrapper, widgetDef, codeMap, customData = null) {
  await renderSharedWidget(wrapper, widgetDef, codeMap, customData, 'Designer', {
    scene: {
      behavior: wrapper.dataset.behavior || '',
      sceneId: wrapper.dataset.sceneId || '',
      sceneTitle: wrapper.dataset.sceneTitle || '',
      sceneBackground: wrapper.dataset.sceneBackground || '',
      scrollStart: wrapper.dataset.scrollStart || '',
      scrollEnd: wrapper.dataset.scrollEnd || ''
    },
    onInlineRendered(container) {
      container.querySelectorAll('.editable').forEach(element => registerElement(element));
    }
  });
  const data = customData || codeMap?.[wrapper.dataset.instanceId];
  if (widgetDef.id === 'textBox' && !hasInlineWidgetCode(data)) addHitLayer(wrapper);
}
