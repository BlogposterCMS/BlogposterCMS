import { renderKitComponent } from '../../../../shared/design-system/componentRenderer.js';
import { widgetSettings, renderWidgetMessage } from './publicWidgetHelpers.js';
/** Definitions travel in existing instance metadata; no public access to private kits is needed. */
export function render(host, ctx = {}) {
    if (!host)
        return;
    try {
        renderKitComponent(host, widgetSettings(ctx, {}).component);
    }
    catch (error) {
        renderWidgetMessage(host, 'UI_KIT_COMPONENT_INVALID', 'UI kit component unavailable', error instanceof Error ? error.message : 'Invalid definition.');
    }
}
