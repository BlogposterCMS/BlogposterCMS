import { applyDashboardHeightPolicyToElement, applyDashboardSlotToElement, getNextDashboardSlot, getSupportedDashboardSlots, normalizeDashboardColumn, normalizeDashboardSlotName, resolveDashboardSlotForWidget } from '../../shared/layout/dashboardSlots.js';
import { saveRuntimeLayoutForViewport } from './runtimePageData.js';
export const ADMIN_COLUMN_COUNT = 12;
const DASHBOARD_WIDGET_DRAG_MIME = 'application/x-blogposter-dashboard-widget';
const DASHBOARD_PLACEHOLDER_CLASS = 'dashboard-drop-placeholder';
const DASHBOARD_PREVIEW_CLASS = 'dashboard-drag-preview';
const SNAP_PULSE_CLASS = 'is-dashboard-snap-pulse';
const SNAP_PULSE_MS = 240;
const DASHBOARD_DRAG_IGNORED_SELECTOR = [
    'a',
    'button',
    'input',
    'select',
    'summary',
    'textarea',
    '[contenteditable="true"]',
    '.resize-handle',
    '.widget-menu',
    '.widget-remove',
    '.widget-resize'
].join(',');
function emitToHandlers(handlers, eventName, ...args) {
    for (const handler of handlers.get(eventName) || []) {
        handler(...args);
    }
}
function removePageWidgetsBeforeAppend(gridEl, nextWidget) {
    const nextIsPage = nextWidget.dataset.dashboardSlot === 'page';
    gridEl.querySelectorAll('.dashboard-widget').forEach(widget => {
        if (widget === nextWidget)
            return;
        if (nextIsPage || widget.dataset.dashboardSlot === 'page') {
            widget.remove();
        }
    });
}
function getDashboardFlowItems(gridEl) {
    return Array.from(gridEl.querySelectorAll(`.dashboard-widget, .${DASHBOARD_PLACEHOLDER_CLASS}`));
}
function syncWidgetOrder(gridEl) {
    let widgetIndex = 0;
    getDashboardFlowItems(gridEl)
        .forEach((widget, index) => {
        const order = index * 10;
        widget.style.order = String(order);
        if (widget.classList.contains('dashboard-widget')) {
            widget.dataset.dashboardOrder = String(widgetIndex * 10);
            widgetIndex += 1;
        }
    });
}
function getRegisteredDashboardWidgets(gridEl, widgets) {
    const registered = new Set(widgets);
    return Array.from(gridEl.querySelectorAll('.dashboard-widget'))
        .filter(widget => registered.has(widget));
}
function closestDashboardWidget(target, gridEl) {
    if (!(target instanceof HTMLElement))
        return null;
    const widget = target.closest('.dashboard-widget');
    return widget && gridEl.contains(widget) ? widget : null;
}
function closestDashboardWidgetFromEvent(event, gridEl) {
    const direct = closestDashboardWidget(event.target, gridEl);
    if (direct)
        return direct;
    if (typeof event.composedPath !== 'function')
        return null;
    for (const target of event.composedPath()) {
        if (target instanceof HTMLElement &&
            target.classList.contains('dashboard-widget') &&
            gridEl.contains(target)) {
            return target;
        }
    }
    return null;
}
function isIgnoredDashboardDragStart(event) {
    const path = typeof event.composedPath === 'function'
        ? event.composedPath()
        : [event.target];
    return path.some(target => (target instanceof HTMLElement &&
        Boolean(target.closest(DASHBOARD_DRAG_IGNORED_SELECTOR))));
}
function findDashboardWidgetByInstanceId(gridEl, instanceId) {
    return Array.from(gridEl.querySelectorAll('.dashboard-widget'))
        .find(widget => widget.dataset.instanceId === instanceId) || null;
}
function getDropPlacementFromPoint(clientX, clientY, target) {
    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const nearSameRow = Math.abs(clientY - centerY) <= rect.height / 3;
    return (nearSameRow ? clientX > centerX : clientY > centerY)
        ? 'after'
        : 'before';
}
function insertWidgetInFlow(gridEl, widget, target, placement = 'after') {
    if (!target || target === widget) {
        if (!target)
            gridEl.appendChild(widget);
        return;
    }
    gridEl.insertBefore(widget, placement === 'after' ? target.nextSibling : target);
}
function createDashboardDropPlaceholder() {
    const placeholder = document.createElement('article');
    placeholder.className = DASHBOARD_PLACEHOLDER_CLASS;
    placeholder.setAttribute('aria-hidden', 'true');
    return placeholder;
}
function getDashboardPreviewLabel(source, def) {
    const sourceText = (source?.textContent || source?.shadowRoot?.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();
    return String(sourceText || def?.metadata?.label || source?.dataset.widgetId || def?.id || 'Widget');
}
function removePreviewOnlyAttributes(root) {
    root.removeAttribute('id');
    root.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
    root.querySelectorAll('script').forEach(script => script.remove());
    root
        .querySelectorAll('.widget-remove, .widget-resize, .widget-menu, .resize-handle')
        .forEach(control => control.remove());
}
function addPreviewFallbackLabel(preview, label) {
    if (preview.textContent?.replace(/\s+/g, ' ').trim())
        return;
    const title = document.createElement('span');
    title.className = 'dashboard-drag-preview__label';
    title.textContent = label;
    preview.appendChild(title);
}
function createDashboardDragPreview(source, def) {
    const preview = document.createElement('article');
    preview.className = source
        ? `${DASHBOARD_PREVIEW_CLASS} ${DASHBOARD_PREVIEW_CLASS}--widget`
        : `${DASHBOARD_PREVIEW_CLASS} ${DASHBOARD_PREVIEW_CLASS}--catalog`;
    preview.setAttribute('aria-hidden', 'true');
    const label = getDashboardPreviewLabel(source, def);
    if (source) {
        source.childNodes.forEach(node => {
            preview.appendChild(node.cloneNode(true));
        });
        removePreviewOnlyAttributes(preview);
    }
    addPreviewFallbackLabel(preview, label);
    const rect = source?.getBoundingClientRect?.();
    if (rect && Number.isFinite(rect.width) && rect.width > 0) {
        preview.style.setProperty('--dashboard-preview-width', `${Math.round(rect.width)}px`);
    }
    if (rect && Number.isFinite(rect.height) && rect.height > 0) {
        preview.style.setProperty('--dashboard-preview-height', `${Math.round(rect.height)}px`);
    }
    document.body.appendChild(preview);
    return preview;
}
function positionDashboardDragPreviewAt(preview, clientX, clientY, anchorX, anchorY) {
    const x = Number.isFinite(clientX) ? clientX : 0;
    const y = Number.isFinite(clientY) ? clientY : 0;
    preview.style.transform = `translate3d(${Math.round(x - anchorX)}px, ${Math.round(y - anchorY)}px, 0)`;
}
function setTransparentNativeDragImage(event) {
    if (!event.dataTransfer?.setDragImage)
        return;
    const shim = document.createElement('span');
    shim.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;';
    document.body.appendChild(shim);
    event.dataTransfer.setDragImage(shim, 0, 0);
    setTimeout(() => shim.remove(), 0);
}
function readWidgetHeightVars(source, target) {
    ['--dashboard-min-height', '--dashboard-height', '--dashboard-max-height'].forEach(name => {
        const value = source.style.getPropertyValue(name);
        if (value) {
            target.style.setProperty(name, value);
        }
        else {
            target.style.removeProperty(name);
        }
    });
    const rect = source.getBoundingClientRect();
    if (Number.isFinite(rect.height) && rect.height > 0) {
        target.style.setProperty('--dashboard-placeholder-height', `${Math.round(rect.height)}px`);
    }
    else {
        target.style.removeProperty('--dashboard-placeholder-height');
    }
    if (source.dataset.dashboardHeightMode) {
        target.dataset.dashboardHeightMode = source.dataset.dashboardHeightMode;
    }
}
function getSupportedSlotsFromElement(el) {
    const values = (el.dataset.dashboardSupportedSlots || '')
        .split(',')
        .map(value => normalizeDashboardSlotName(value, 'full'));
    return values.length ? values : [normalizeDashboardSlotName(el.dataset.dashboardSlot)];
}
function applyWidgetGridColumn(el, column) {
    const slot = normalizeDashboardSlotName(el.dataset.dashboardSlot);
    applyDashboardSlotToElement(el, slot, getSupportedSlotsFromElement(el), column);
}
function updatePlaceholderFromWidget(placeholder, widget, column) {
    const slot = normalizeDashboardSlotName(widget.dataset.dashboardSlot);
    applyDashboardSlotToElement(placeholder, slot, getSupportedSlotsFromElement(widget), column);
    readWidgetHeightVars(widget, placeholder);
}
function updatePlaceholderFromDefinition(placeholder, def, column) {
    const slot = resolveDashboardSlotForWidget(def);
    applyDashboardSlotToElement(placeholder, slot, getSupportedDashboardSlots(def), column);
    applyDashboardHeightPolicyToElement(placeholder, def);
    placeholder.style.removeProperty('--dashboard-placeholder-height');
}
function getDashboardColumnFromEvent(gridEl, event, slot) {
    return getDashboardColumnFromPoint(gridEl, event.clientX, slot);
}
function getDashboardColumnFromPoint(gridEl, clientX, slot) {
    const rect = gridEl.getBoundingClientRect();
    const columnWidth = rect.width / ADMIN_COLUMN_COUNT;
    if (!Number.isFinite(columnWidth) || columnWidth <= 0)
        return null;
    const rawColumn = Math.floor((clientX - rect.left) / columnWidth) + 1;
    return normalizeDashboardColumn(rawColumn, slot, ADMIN_COLUMN_COUNT);
}
function findDashboardWidgetAtPoint(gridEl, clientX, clientY, ignored) {
    const element = document.elementFromPoint?.(clientX, clientY);
    const widget = closestDashboardWidget(element, gridEl);
    return widget && widget !== ignored ? widget : null;
}
function findNextDashboardWidget(placeholder, ignored) {
    let next = placeholder.nextElementSibling;
    while (next) {
        if (next instanceof HTMLElement &&
            next.classList.contains('dashboard-widget') &&
            next !== ignored) {
            return next;
        }
        next = next.nextElementSibling;
    }
    return null;
}
function resolvePanelDraggedWidget() {
    const id = window.__dashboardDraggingWidgetId;
    const widgets = Array.isArray(window.availableWidgets)
        ? window.availableWidgets
        : [];
    return widgets.find((widget) => widget.id === id) || null;
}
function movePlaceholder(gridEl, placeholder, target, placement) {
    insertWidgetInFlow(gridEl, placeholder, target, placement);
    syncWidgetOrder(gridEl);
}
function clearSnapFeedback(state, gridEl) {
    if (state?.snapPulseTimer) {
        clearTimeout(state.snapPulseTimer);
    }
    gridEl.classList.remove('is-dashboard-snap-active', SNAP_PULSE_CLASS);
    gridEl.style.removeProperty('--dashboard-snap-column');
    gridEl.style.removeProperty('--dashboard-snap-span');
}
function updateSnapFeedback(state, gridEl, slot, column) {
    const nextColumn = column || 1;
    const span = Number(getComputedStyle(state.placeholder)
        .getPropertyValue('--dashboard-column-span')) || Number(state.placeholder.dataset.dashboardColumns) || 12;
    const changedColumn = state.lastColumn !== nextColumn;
    gridEl.style.setProperty('--dashboard-snap-column', String(nextColumn));
    gridEl.style.setProperty('--dashboard-snap-span', String(span));
    gridEl.classList.add('is-dashboard-snap-active');
    if (changedColumn && slot !== 'full' && slot !== 'page') {
        gridEl.classList.remove(SNAP_PULSE_CLASS);
        // Force the pulse animation to restart only when the snapped column changes.
        void gridEl.offsetWidth;
        gridEl.classList.add(SNAP_PULSE_CLASS);
        if (state.snapPulseTimer)
            clearTimeout(state.snapPulseTimer);
        state.snapPulseTimer = setTimeout(() => {
            gridEl.classList.remove(SNAP_PULSE_CLASS);
            state.snapPulseTimer = null;
        }, SNAP_PULSE_MS);
    }
    state.lastColumn = nextColumn;
}
export function createAdminDashboardController(gridEl) {
    const handlers = new Map();
    const controller = {
        el: gridEl,
        options: { columns: ADMIN_COLUMN_COUNT },
        widgets: [],
        registerWidget(el) {
            removePageWidgetsBeforeAppend(gridEl, el);
            // Dashboard widgets use pointer-driven movement so the visual preview can
            // follow the cursor exactly; native drag remains reserved for drawer items.
            el.draggable = false;
            if (!this.widgets.includes(el)) {
                this.widgets.push(el);
            }
            this.widgets = getRegisteredDashboardWidgets(gridEl, this.widgets);
            syncWidgetOrder(gridEl);
        },
        removeWidget(el) {
            this.widgets = this.widgets.filter(widget => widget !== el);
            el.remove();
            syncWidgetOrder(gridEl);
            this.emitChange(el);
        },
        select(el) {
            this.widgets.forEach(widget => widget.classList.toggle('selected', widget === el));
        },
        updateSlot(el, slot, def) {
            const supported = def ? getSupportedDashboardSlots(def) : [slot];
            const nextSlot = def
                ? resolveDashboardSlotForWidget(def, slot)
                : normalizeDashboardSlotName(slot);
            applyDashboardSlotToElement(el, nextSlot, supported, el.dataset.dashboardColumn);
            removePageWidgetsBeforeAppend(gridEl, el);
            this.widgets = getRegisteredDashboardWidgets(gridEl, this.widgets);
            syncWidgetOrder(gridEl);
            this.emitChange(el);
        },
        cycleSlot(el, def) {
            const nextSlot = def
                ? getNextDashboardSlot(def, el.dataset.dashboardSlot)
                : normalizeDashboardSlotName(el.dataset.dashboardSlot);
            this.updateSlot(el, nextSlot, def);
            return nextSlot;
        },
        moveWidget(el, target, placement = 'after', column) {
            if (!gridEl.contains(el))
                return;
            insertWidgetInFlow(gridEl, el, target, placement);
            applyWidgetGridColumn(el, column ?? el.dataset.dashboardColumn);
            this.widgets = getRegisteredDashboardWidgets(gridEl, this.widgets);
            syncWidgetOrder(gridEl);
            this.select(el);
            this.emitChange(el);
        },
        emitChange(el) {
            emitToHandlers(handlers, 'change', el);
        },
        on(eventName, handler) {
            const current = handlers.get(eventName) || [];
            current.push(handler);
            handlers.set(eventName, current);
        },
        setStatic(_value) {
            /* Dashboard flow layouts are always non-positional. */
        }
    };
    return controller;
}
export function bindAdminDropTarget(gridEl, grid) {
    let dragState = null;
    const cleanupPointerListeners = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerCancel);
    };
    const updateDragPreviewAtPoint = (state, clientX, clientY, fallbackTarget) => {
        state.lastClientX = Number.isFinite(clientX) ? clientX : state.lastClientX;
        state.lastClientY = Number.isFinite(clientY) ? clientY : state.lastClientY;
        positionDashboardDragPreviewAt(state.preview, state.lastClientX, state.lastClientY, state.previewAnchorX, state.previewAnchorY);
        const targetWidget = findDashboardWidgetAtPoint(gridEl, state.lastClientX, state.lastClientY, state.draggedWidget) || closestDashboardWidget(fallbackTarget, gridEl);
        const usableTarget = targetWidget && targetWidget !== state.draggedWidget
            ? targetWidget
            : null;
        const placement = usableTarget
            ? getDropPlacementFromPoint(state.lastClientX, state.lastClientY, usableTarget)
            : 'after';
        const slot = state.draggedWidget
            ? normalizeDashboardSlotName(state.draggedWidget.dataset.dashboardSlot)
            : resolveDashboardSlotForWidget(state.widgetDef);
        const column = getDashboardColumnFromPoint(gridEl, state.lastClientX, slot);
        if (state.draggedWidget) {
            updatePlaceholderFromWidget(state.placeholder, state.draggedWidget, column);
        }
        else if (state.widgetDef) {
            updatePlaceholderFromDefinition(state.placeholder, state.widgetDef, column);
        }
        updateSnapFeedback(state, gridEl, slot, column);
        movePlaceholder(gridEl, state.placeholder, usableTarget, placement);
    };
    const releasePointerCapture = (state) => {
        if (!state?.draggedWidget || state.pointerId === null)
            return;
        try {
            state.draggedWidget.releasePointerCapture?.(state.pointerId);
        }
        catch (_err) {
            /* Pointer capture may already be gone after cancel/end. */
        }
    };
    const cleanupDragState = () => {
        cleanupPointerListeners();
        releasePointerCapture(dragState);
        if (dragState?.widgetDef?.id === window.__dashboardDraggingWidgetId) {
            delete window.__dashboardDraggingWidgetId;
        }
        clearSnapFeedback(dragState, gridEl);
        dragState?.placeholder.remove();
        dragState?.preview.remove();
        dragState?.draggedWidget?.classList.remove('is-dragging');
        gridEl.classList.remove('is-dashboard-dragging');
        dragState = null;
        syncWidgetOrder(gridEl);
    };
    const commitDraggedWidget = (event) => {
        if (!dragState?.draggedWidget) {
            cleanupDragState();
            return;
        }
        const draggedWidget = dragState.draggedWidget;
        const slot = normalizeDashboardSlotName(draggedWidget.dataset.dashboardSlot);
        const nextWidget = dragState.placeholder.parentNode
            ? findNextDashboardWidget(dragState.placeholder, draggedWidget)
            : null;
        dragState.placeholder.remove();
        grid.moveWidget(draggedWidget, nextWidget, nextWidget ? 'before' : 'after', dragState.lastColumn ?? getDashboardColumnFromPoint(gridEl, event.clientX, slot));
        cleanupDragState();
    };
    function handlePointerMove(event) {
        if (!dragState?.draggedWidget)
            return;
        if (dragState.pointerId !== null && event.pointerId !== dragState.pointerId)
            return;
        event.preventDefault();
        updateDragPreviewAtPoint(dragState, event.clientX, event.clientY, event.target);
    }
    function handlePointerUp(event) {
        if (!dragState?.draggedWidget)
            return;
        if (dragState.pointerId !== null && event.pointerId !== dragState.pointerId)
            return;
        event.preventDefault();
        commitDraggedWidget(event);
    }
    function handlePointerCancel(event) {
        if (!dragState?.draggedWidget)
            return;
        if (dragState.pointerId !== null && event.pointerId !== dragState.pointerId)
            return;
        cleanupDragState();
    }
    gridEl.addEventListener('pointerdown', (event) => {
        if (!document.body.classList.contains('dashboard-edit-mode'))
            return;
        if (event.button !== 0 || isIgnoredDashboardDragStart(event))
            return;
        const widget = closestDashboardWidgetFromEvent(event, gridEl);
        if (!widget?.dataset.instanceId)
            return;
        event.preventDefault();
        cleanupDragState();
        const rect = widget.getBoundingClientRect();
        const anchorX = Number.isFinite(rect.left) ? event.clientX - rect.left : 18;
        const anchorY = Number.isFinite(rect.top) ? event.clientY - rect.top : 18;
        dragState = {
            placeholder: createDashboardDropPlaceholder(),
            preview: createDashboardDragPreview(widget),
            draggedWidget: widget,
            widgetDef: null,
            pointerId: event.pointerId ?? null,
            previewAnchorX: Math.max(0, anchorX),
            previewAnchorY: Math.max(0, anchorY),
            lastColumn: null,
            lastClientX: event.clientX || 0,
            lastClientY: event.clientY || 0,
            snapPulseTimer: null
        };
        widget.setPointerCapture?.(event.pointerId);
        widget.classList.add('is-dragging');
        gridEl.classList.add('is-dashboard-dragging');
        grid.select(widget);
        updateDragPreviewAtPoint(dragState, event.clientX, event.clientY, event.target);
        window.addEventListener('pointermove', handlePointerMove, { passive: false });
        window.addEventListener('pointerup', handlePointerUp);
        window.addEventListener('pointercancel', handlePointerCancel);
    });
    gridEl.addEventListener('dragstart', (event) => {
        const widget = closestDashboardWidgetFromEvent(event, gridEl);
        if (!document.body.classList.contains('dashboard-edit-mode') || !widget) {
            event.preventDefault();
            return;
        }
        const instanceId = widget.dataset.instanceId;
        if (!instanceId) {
            event.preventDefault();
            return;
        }
        event.dataTransfer?.setData(DASHBOARD_WIDGET_DRAG_MIME, instanceId);
        event.dataTransfer?.setData('text/plain', instanceId);
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
        }
        setTransparentNativeDragImage(event);
        dragState = {
            placeholder: createDashboardDropPlaceholder(),
            preview: createDashboardDragPreview(widget),
            draggedWidget: widget,
            widgetDef: null,
            pointerId: null,
            previewAnchorX: -14,
            previewAnchorY: -14,
            lastColumn: null,
            lastClientX: event.clientX || 0,
            lastClientY: event.clientY || 0,
            snapPulseTimer: null
        };
        positionDashboardDragPreviewAt(dragState.preview, event.clientX, event.clientY, dragState.previewAnchorX, dragState.previewAnchorY);
        widget.classList.add('is-dragging');
        gridEl.classList.add('is-dashboard-dragging');
        grid.select(widget);
    });
    gridEl.addEventListener('dragend', () => {
        cleanupDragState();
    });
    gridEl.addEventListener('dragover', (event) => {
        if (!document.body.classList.contains('dashboard-edit-mode'))
            return;
        event.preventDefault();
        if (!dragState) {
            const widgetDef = resolvePanelDraggedWidget();
            if (widgetDef) {
                dragState = {
                    placeholder: createDashboardDropPlaceholder(),
                    preview: createDashboardDragPreview(null, widgetDef),
                    draggedWidget: null,
                    widgetDef,
                    pointerId: null,
                    previewAnchorX: -14,
                    previewAnchorY: -14,
                    lastColumn: null,
                    lastClientX: event.clientX || 0,
                    lastClientY: event.clientY || 0,
                    snapPulseTimer: null
                };
                gridEl.classList.add('is-dashboard-dragging');
            }
        }
        if (dragState) {
            updateDragPreviewAtPoint(dragState, event.clientX, event.clientY, event.target);
        }
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = event.dataTransfer.types?.includes(DASHBOARD_WIDGET_DRAG_MIME)
                ? 'move'
                : 'copy';
        }
    });
    gridEl.addEventListener('drop', (event) => {
        if (!document.body.classList.contains('dashboard-edit-mode'))
            return;
        event.preventDefault();
        const draggedInstanceId = event.dataTransfer?.getData(DASHBOARD_WIDGET_DRAG_MIME);
        if (draggedInstanceId) {
            const draggedWidget = findDashboardWidgetByInstanceId(gridEl, draggedInstanceId);
            if (draggedWidget) {
                const slot = normalizeDashboardSlotName(draggedWidget.dataset.dashboardSlot);
                const nextWidget = dragState?.placeholder.parentNode
                    ? findNextDashboardWidget(dragState.placeholder, draggedWidget)
                    : null;
                dragState?.placeholder.remove();
                grid.moveWidget(draggedWidget, nextWidget, nextWidget ? 'before' : 'after', dragState?.lastColumn ?? getDashboardColumnFromEvent(gridEl, event, slot));
            }
            cleanupDragState();
            return;
        }
        const id = event.dataTransfer?.getData('text/plain');
        if (!id)
            return;
        const widgets = Array.isArray(window.availableWidgets)
            ? window.availableWidgets
            : [];
        const def = widgets.find((widget) => widget.id === id);
        if (!def || typeof window.addDashboardWidget !== 'function')
            return;
        const slot = resolveDashboardSlotForWidget(def);
        const nextWidget = dragState?.placeholder.parentNode
            ? findNextDashboardWidget(dragState.placeholder)
            : null;
        dragState?.placeholder.remove();
        const column = dragState?.lastColumn ?? getDashboardColumnFromEvent(gridEl, event, slot);
        cleanupDragState();
        if (column) {
            window.addDashboardWidget(def, {
                column,
                ...(nextWidget?.dataset.instanceId ? { beforeInstanceId: nextWidget.dataset.instanceId } : {})
            });
            return;
        }
        if (nextWidget?.dataset.instanceId) {
            window.addDashboardWidget(def, { beforeInstanceId: nextWidget.dataset.instanceId });
            return;
        }
        window.addDashboardWidget(def);
    });
}
export function exposeAdminGridGlobals(grid, pageId, lane, layout) {
    grid.setStatic(true);
    document.body.classList.add('grid-mode', 'dashboard-flow-mode');
    window.adminGrid = grid;
    window.adminPageContext = { pageId, lane };
    window.adminCurrentLayout = layout;
}
export function serializeAdminDashboardLayout(gridEl, resolveMeta = () => ({})) {
    return Array.from(gridEl.querySelectorAll('.dashboard-widget'))
        .map((el, index) => {
        const instanceId = el.dataset.instanceId || `w${index}`;
        const meta = resolveMeta(instanceId, el) || {};
        return {
            id: instanceId,
            widgetId: el.dataset.widgetId,
            slot: normalizeDashboardSlotName(el.dataset.dashboardSlot),
            ...(el.dataset.dashboardColumn ? { column: Number(el.dataset.dashboardColumn) } : {}),
            order: index * 10,
            ...(meta.breakpoints ? { breakpoints: meta.breakpoints } : {}),
            ...(meta.code ? { code: meta.code } : {})
        };
    });
}
export function bindAdminLayoutPersistence({ grid, gridEl, instanceMetaMap, layout, pageId, lane, emit }) {
    let persistedLayout = layout;
    grid.on('change', () => {
        window.adminCurrentLayout = serializeAdminDashboardLayout(gridEl, instanceId => instanceMetaMap.get(instanceId)
            || persistedLayout.find((item) => item.id === instanceId)
            || {});
    });
    window.saveAdminLayout = async () => {
        if (!window.adminCurrentLayout)
            return;
        try {
            await saveRuntimeLayoutForViewport(emit, pageId, lane, window.adminCurrentLayout);
            persistedLayout = window.adminCurrentLayout;
        }
        catch (err) {
            console.error('[Admin] DASHBOARD_LAYOUT_SAVE_FAILED:', err);
        }
    };
}
