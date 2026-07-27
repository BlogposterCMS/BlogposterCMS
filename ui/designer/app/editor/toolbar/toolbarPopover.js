const POPOVER_MARGIN = 8;
const DEFAULT_POPOVER_WIDTH = 260;
const DEFAULT_POPOVER_HEIGHT = 52;
const POPOVER_LAYER_CLASS = 'designer-toolbar-popover-layer';
const popoverOrigins = new WeakMap();

function ensureToolbarPopoverLayer(ownerDocument = document) {
  let layer = ownerDocument.querySelector(`.${POPOVER_LAYER_CLASS}`);
  if (layer) return layer;

  layer = ownerDocument.createElement('div');
  layer.className = POPOVER_LAYER_CLASS;
  layer.dataset.designerToolbarPopoverLayer = 'true';
  ownerDocument.body.appendChild(layer);
  return layer;
}

/**
 * Moves a toolbar popover into a viewport-level layer. This avoids clipping
 * from the toolbar's horizontal scrolling without losing its original DOM
 * position when the popover closes.
 */
export function mountToolbarPopover(popover) {
  if (!popover) {
    throw new Error(
      'DESIGNER_TOOLBAR_POPOVER_TARGET_INVALID: A popover is required for portal mounting.'
    );
  }
  if (!popoverOrigins.has(popover)) {
    popoverOrigins.set(popover, {
      parent: popover.parentNode,
      nextSibling: popover.nextSibling
    });
  }
  const layer = ensureToolbarPopoverLayer(popover.ownerDocument);
  if (popover.parentNode !== layer) layer.appendChild(popover);
  return layer;
}

export function restoreToolbarPopover(popover) {
  if (!popover) return;
  const origin = popoverOrigins.get(popover);
  if (!origin?.parent?.isConnected) {
    popover.remove();
    popoverOrigins.delete(popover);
    return;
  }
  const reference = origin.nextSibling?.parentNode === origin.parent
    ? origin.nextSibling
    : null;
  origin.parent.insertBefore(popover, reference);
  popoverOrigins.delete(popover);

  const layer = popover.ownerDocument.querySelector(`.${POPOVER_LAYER_CLASS}`);
  if (layer && !layer.childElementCount) layer.remove();
}

export function positionToolbarPopover(popover, anchor, viewport = window) {
  if (!popover || !anchor) {
    throw new Error(
      'DESIGNER_TOOLBAR_POPOVER_TARGET_INVALID: A popover and its anchor are required.'
    );
  }

  const anchorRect = anchor.getBoundingClientRect();
  const viewportWidth = Math.max(0, Number(viewport.innerWidth) || 0);
  const viewportHeight = Math.max(0, Number(viewport.innerHeight) || 0);
  const width = Math.min(
    DEFAULT_POPOVER_WIDTH,
    Math.max(120, viewportWidth - (POPOVER_MARGIN * 2))
  );
  const measuredHeight = popover.getBoundingClientRect().height || DEFAULT_POPOVER_HEIGHT;
  const minimumCenter = POPOVER_MARGIN + (width / 2);
  const maximumCenter = Math.max(minimumCenter, viewportWidth - POPOVER_MARGIN - (width / 2));
  const center = Math.min(
    maximumCenter,
    Math.max(minimumCenter, anchorRect.left + (anchorRect.width / 2))
  );
  const belowTop = anchorRect.bottom + POPOVER_MARGIN;
  const top = belowTop + measuredHeight <= viewportHeight - POPOVER_MARGIN
    ? belowTop
    : Math.max(POPOVER_MARGIN, anchorRect.top - POPOVER_MARGIN - measuredHeight);

  Object.assign(popover.style, {
    left: `${Math.round(center)}px`,
    top: `${Math.round(top)}px`,
    minWidth: `${Math.round(width)}px`,
    maxWidth: `calc(100vw - ${POPOVER_MARGIN * 2}px)`
  });

  return { center, top, width };
}

export function clearToolbarPopoverPosition(popover) {
  if (!popover) return;
  ['left', 'top', 'min-width', 'max-width'].forEach(property => {
    popover.style.removeProperty(property);
  });
}
