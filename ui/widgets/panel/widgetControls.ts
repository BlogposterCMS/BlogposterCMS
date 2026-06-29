import {
  getNextDashboardSlot,
  normalizeDashboardSlotName,
  type DashboardSlotName,
  type DashboardWidgetDefinition
} from '../../shared/layout/dashboardSlots.js';

interface DashboardGrid {
  removeWidget: (el: HTMLElement) => void;
  cycleSlot?: (el: HTMLElement, def?: DashboardWidgetDefinition | null) => DashboardSlotName;
  emitChange?: (el?: HTMLElement | null) => void;
}

function renderIcon(name: string, fallback: string): string {
  return typeof window.featherIcon === 'function'
    ? window.featherIcon(name)
    : fallback;
}

function findWidgetDefinition(el: HTMLElement): DashboardWidgetDefinition | null {
  const widgetId = el.dataset.widgetId;
  if (!widgetId || !Array.isArray(window.availableWidgets)) return null;
  return window.availableWidgets.find(widget => widget?.id === widgetId) || null;
}

function updateSlotIcon(button: HTMLButtonElement, slot: DashboardSlotName): void {
  const iconName = slot === 'page' || slot === 'full'
    ? 'minimize'
    : 'maximize';
  button.innerHTML = renderIcon(iconName, slot === 'page' || slot === 'full' ? '-' : '+');
  button.dataset.state = slot;
}

export function attachDashboardControls(el: HTMLElement | null, grid: DashboardGrid | null): void {
  if (!el || !grid) return;
  if (el.querySelector('.widget-remove')) return;

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
