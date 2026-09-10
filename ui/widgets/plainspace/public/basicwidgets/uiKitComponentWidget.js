import { renderKitComponent } from '../../../../shared/design-system/componentRenderer.js';
import { widgetSettings, renderWidgetMessage } from './publicWidgetHelpers.js';
/** Definitions travel in existing instance metadata; no public access to private kits is needed. */
export function render(host, ctx = {}) {
    if (!host)
        return;
    const settings = widgetSettings(ctx, {});
    if (settings.interaction) {
        // Interactive composition uses the same renderer as isolated community widgets.
        void import('../../../../shared/widget-ui/mountDocument.js').then(({ mountUiDocument }) => mountUiDocument(host, settings.interaction, ctx.preview === true))
            .catch(error => renderWidgetMessage(host, 'WIDGET_DOCUMENT_INVALID', 'Interactive container unavailable', String(error?.message || 'Invalid document.')));
        return;
    }
    try {
        renderKitComponent(host, settings.component);
    }
    catch (error) {
        renderWidgetMessage(host, 'UI_KIT_COMPONENT_INVALID', 'UI kit component unavailable', error instanceof Error ? error.message : 'Invalid definition.');
    }
}
