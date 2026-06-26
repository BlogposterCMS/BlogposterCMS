import { applyWidgetOptions } from '../options/widgetOptions.js';
import { renderWidget } from '../rendering/widgetRenderer.js';
import { attachDashboardControls } from './widgetControls.js';
const DEFAULT_ADMIN_ROWS = 20;
function resolvePosition(value) {
    return Number.isFinite(value) ? Number(value) : 0;
}
function createWidgetWrapper(grid, def, pos) {
    const wrapper = grid.addWidget({
        x: resolvePosition(pos.x),
        y: resolvePosition(pos.y),
        w: 8,
        h: DEFAULT_ADMIN_ROWS
    });
    wrapper.dataset.widgetId = def.id;
    wrapper.dataset.instanceId = `w${Math.random().toString(36).slice(2, 8)}`;
    const content = document.createElement('div');
    content.className = 'canvas-item-content';
    wrapper.appendChild(content);
    return wrapper;
}
async function loadDefaultWidgetInstance(def) {
    const emit = window.meltdownEmit;
    if (typeof emit !== 'function') {
        throw new Error('meltdownEmit unavailable');
    }
    const res = await emit('getWidgetInstance', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'plainspace',
        moduleType: 'core',
        instanceId: `default.${def.id}`
    });
    const contentRaw = res && typeof res === 'object' ? res.content : null;
    return typeof contentRaw === 'string'
        ? JSON.parse(contentRaw)
        : null;
}
export async function addDashboardWidget(def, pos = {}) {
    const grid = window.adminGrid;
    if (!grid || !def)
        return;
    const wrapper = createWidgetWrapper(grid, def, pos);
    let instance = null;
    try {
        instance = await loadDefaultWidgetInstance(def);
        applyWidgetOptions(wrapper, instance, grid);
    }
    catch {
        /* keep rendering with the widget definition only */
    }
    await renderWidget(wrapper, def, null, instance, 'Widgets');
    attachDashboardControls(wrapper, grid);
    if (document.body.classList.contains('dashboard-edit-mode')) {
        grid.select?.(wrapper);
    }
    document.dispatchEvent(new CustomEvent('ui:widget:add', { detail: { type: def.id } }));
}
