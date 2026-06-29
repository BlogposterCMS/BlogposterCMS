import { applyDashboardHeightPolicyToElement, applyDashboardSlotToElement, getDefaultDashboardSlot, getSupportedDashboardSlots, resolveDashboardSlotForWidget } from '../../shared/layout/dashboardSlots.js';
import { renderWidget } from '../rendering/widgetRenderer.js';
import { attachDashboardControls } from './widgetControls.js';
const LAYOUT_OPTION_KEYS = new Set([
    'max',
    'maxWidth',
    'maxHeight',
    'halfWidth',
    'thirdWidth',
    'width',
    'height',
    'overflow'
]);
function toFiniteNumber(value) {
    const num = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
    return Number.isFinite(num) ? num : null;
}
function stripLayoutOptions(value) {
    if (!value)
        return null;
    const cleanEntries = Object.entries(value)
        .filter(([key]) => !LAYOUT_OPTION_KEYS.has(key));
    return cleanEntries.length ? Object.fromEntries(cleanEntries) : null;
}
function getDashboardController() {
    return window.adminGrid && typeof window.adminGrid === 'object'
        ? window.adminGrid
        : null;
}
function createWidgetWrapper(gridEl, def, pos = {}) {
    const wrapper = document.createElement('article');
    wrapper.classList.add('canvas-item', 'dashboard-widget', 'loading');
    wrapper.dataset.widgetId = def.id;
    wrapper.dataset.instanceId = `w${Math.random().toString(36).slice(2, 8)}`;
    const slot = resolveDashboardSlotForWidget(def, pos.slot || getDefaultDashboardSlot(def));
    const order = toFiniteNumber(pos.order) ?? gridEl.querySelectorAll('.dashboard-widget').length * 10;
    wrapper.dataset.dashboardOrder = String(order);
    wrapper.style.order = String(order);
    applyDashboardSlotToElement(wrapper, slot, getSupportedDashboardSlots(def), pos.column);
    applyDashboardHeightPolicyToElement(wrapper, def);
    const content = document.createElement('div');
    content.className = 'canvas-item-content';
    wrapper.appendChild(content);
    const beforeInstanceId = typeof pos.beforeInstanceId === 'string'
        ? pos.beforeInstanceId
        : null;
    const beforeEl = beforeInstanceId
        ? Array.from(gridEl.querySelectorAll('.dashboard-widget'))
            .find(widget => widget.dataset.instanceId === beforeInstanceId)
        : null;
    gridEl.insertBefore(wrapper, beforeEl || null);
    return wrapper;
}
async function loadDefaultWidgetInstance(def) {
    const emit = window.meltdownEmit;
    if (typeof emit !== 'function') {
        throw new Error('DASHBOARD_WIDGET_INSTANCE_EMITTER_MISSING');
    }
    const res = await emit('getWidgetInstance', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'plainspace',
        moduleType: 'core',
        instanceId: `default.${def.id}`
    });
    const contentRaw = res && typeof res === 'object' ? res.content : null;
    const parsed = typeof contentRaw === 'string'
        ? JSON.parse(contentRaw)
        : null;
    return stripLayoutOptions(parsed);
}
export async function addDashboardWidget(def, pos = {}) {
    const controller = getDashboardController();
    const gridEl = controller?.el || document.getElementById('adminGrid');
    if (!gridEl || !def)
        return;
    const wrapper = createWidgetWrapper(gridEl, def, pos);
    controller?.registerWidget?.(wrapper);
    let instance = null;
    try {
        instance = await loadDefaultWidgetInstance(def);
    }
    catch {
        /* Default widget data is optional; the registry contract owns layout. */
    }
    await renderWidget(wrapper, def, null, instance, 'Widgets');
    const controlsGrid = controller && typeof controller.removeWidget === 'function'
        ? controller
        : null;
    attachDashboardControls(wrapper, controlsGrid);
    controller?.select?.(wrapper);
    controller?.emitChange?.(wrapper);
    document.dispatchEvent(new CustomEvent('ui:widget:add', { detail: { type: def.id } }));
}
