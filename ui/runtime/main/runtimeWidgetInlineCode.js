import { renderWidgetInlineCode } from './widgetRuntimeGateway.js';
/** Keep the runtime entry point while sharing HTML/CSS/script handling with Studio. */
export function renderInlineWidgetCode(wrapper, root, container, code) {
    renderWidgetInlineCode(wrapper, root, container, code, 'Renderer');
}
