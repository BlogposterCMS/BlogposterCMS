/**
 * Keeps CanvasGrid interaction locks aligned with the owning layout surface.
 *
 * Auto and Grid own child flow, so their children must not accept free drag or
 * resize gestures. Returning to Free must remove those temporary locks
 * immediately; otherwise the mode button changes visually while the surface
 * remains unusable.
 */
export function syncLayoutSurfaceInteractions(records = [], activeLayer = 0) {
  records.forEach(record => {
    const surface = record?.surface || record?.workspace;
    if (!surface) return;
    const mode = surface.dataset.layoutMode || 'free';
    const automaticPlacement = mode !== 'free';

    surface.querySelectorAll(':scope > .canvas-item').forEach(el => {
      const isGridContainer = el.classList.contains('layout-grid-container');
      const inactive = !isGridContainer && String(el.dataset.layer) !== String(activeLayer);
      const explicitlyLocked = el.getAttribute('gs-locked') === 'true';

      if (inactive) {
        el.classList.add('inactive-layer');
        el.title = 'Change layer to edit this widget';
      } else {
        el.classList.remove('inactive-layer');
        el.removeAttribute('title');
      }

      if (inactive || automaticPlacement || explicitlyLocked) {
        el.setAttribute('gs-no-move', 'true');
        el.setAttribute('gs-no-resize', 'true');
      } else {
        el.removeAttribute('gs-no-move');
        el.removeAttribute('gs-no-resize');
      }
      el.classList.toggle('auto-layout-item', automaticPlacement);

      if (inactive) {
        if (el.getAttribute('contenteditable') === 'true') {
          el.dataset.prevContentEditable = 'true';
        }
        el.setAttribute('contenteditable', 'false');
      } else if (el.dataset.prevContentEditable === 'true') {
        el.setAttribute('contenteditable', 'true');
        delete el.dataset.prevContentEditable;
      } else {
        el.removeAttribute('contenteditable');
      }
    });
  });
}

/**
 * Resolves an editable widget independently from CanvasGrid move/resize locks.
 * Auto and Grid deliberately set gs-no-move/gs-no-resize, but those gesture
 * locks must never make an active-layer widget impossible to select.
 */
export function layoutWidgetSelectionTarget(event, activeLayer = 0) {
  const widget = event?.target?.closest?.('.canvas-item');
  if (!widget?.closest?.('.layout-grid-surface')) return null;
  const isGridContainer = widget.classList.contains('layout-grid-container');
  const inactive = !isGridContainer && String(widget.dataset.layer) !== String(activeLayer);
  return inactive || widget.classList.contains('inactive-layer') ? null : widget;
}

/**
 * Binds the shared widget selection path in capture phase so child widgets can
 * still be selected when CanvasGrid correctly declines an Auto/Grid drag.
 */
export function bindLayoutWidgetSelection({
  layoutRoot,
  getActiveLayer = () => 0,
  isDisabled = () => false,
  onSelect
} = {}) {
  if (!layoutRoot?.addEventListener || typeof onSelect !== 'function') {
    console.warn('[Designer] DESIGNER_LAYOUT_WIDGET_SELECTION_BIND_INVALID');
    return () => {};
  }
  const handlePointerDown = event => {
    if (isDisabled()) return;
    const widget = layoutWidgetSelectionTarget(event, getActiveLayer());
    if (widget) onSelect(widget, event);
  };
  layoutRoot.addEventListener('pointerdown', handlePointerDown, true);
  return () => layoutRoot.removeEventListener('pointerdown', handlePointerDown, true);
}
