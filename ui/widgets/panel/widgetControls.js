import { getNextDashboardSlot, normalizeDashboardSlotName } from '../../shared/layout/dashboardSlots.js';
function renderIcon(name, fallback) {
    return typeof window.featherIcon === 'function'
        ? window.featherIcon(name)
        : fallback;
}
function findWidgetDefinition(el) {
    const widgetId = el.dataset.widgetId;
    if (!widgetId || !Array.isArray(window.availableWidgets))
        return null;
    return window.availableWidgets.find(widget => widget?.id === widgetId) || null;
}
function updateSlotIcon(button, slot) {
    const iconName = slot === 'page' || slot === 'full'
        ? 'minimize'
        : 'maximize';
    button.innerHTML = renderIcon(iconName, slot === 'page' || slot === 'full' ? '-' : '+');
    button.dataset.state = slot;
}
export function attachDashboardControls(el, grid) {
    if (!el || !grid)
        return;
    if (el.querySelector('.widget-remove'))
        return;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'widget-remove';
    removeBtn.innerHTML = renderIcon('x', 'x');
    removeBtn.addEventListener('click', e => {
        e.stopPropagation();
        grid.removeWidget(el);
    });
    el.appendChild(removeBtn);
    const slotBtn = document.createElement('button');
    slotBtn.className = 'widget-resize';
    updateSlotIcon(slotBtn, normalizeDashboardSlotName(el.dataset.dashboardSlot));
    slotBtn.addEventListener('click', e => {
        e.stopPropagation();
        const def = findWidgetDefinition(el);
        const nextSlot = typeof grid.cycleSlot === 'function'
            ? grid.cycleSlot(el, def)
            : getNextDashboardSlot(def || { id: el.dataset.widgetId || '' }, el.dataset.dashboardSlot);
        updateSlotIcon(slotBtn, nextSlot);
        if (typeof grid.emitChange === 'function') {
            grid.emitChange(el);
        }
    });
    el.appendChild(slotBtn);
    el.addEventListener('dragstart', () => el.classList.add('is-dragging'));
    el.addEventListener('dragend', () => el.classList.remove('is-dragging'));
}
