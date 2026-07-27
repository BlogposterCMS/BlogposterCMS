const MIN_SECTION_HEIGHT = 80;
const MAX_SECTION_HEIGHT = 2400;

function clampSectionHeight(value) {
  const height = Number.parseFloat(String(value || ''));
  if (!Number.isFinite(height)) return MIN_SECTION_HEIGHT;
  return Math.max(MIN_SECTION_HEIGHT, Math.min(MAX_SECTION_HEIGHT, Math.round(height)));
}

function sectionVisualScale(section) {
  const authoredHeight = Number(section.offsetHeight) || 0;
  const visualHeight = Number(section.getBoundingClientRect?.().height) || 0;
  if (authoredHeight > 0 && visualHeight > 0) {
    const scale = visualHeight / authoredHeight;
    if (Number.isFinite(scale) && scale > 0) return scale;
  }
  return 1;
}

function currentSectionHeight(section) {
  // offsetHeight is the authored Section height. getBoundingClientRect() is
  // visually scaled by Builder zoom and would collapse a 320px Section to
  // roughly 93px while Fit is at 29%.
  const authoredHeight = Number(section.offsetHeight) || 0;
  if (authoredHeight > 0) {
    return clampSectionHeight(authoredHeight);
  }
  const visualHeight = Number(section.getBoundingClientRect?.().height) || 0;
  if (visualHeight > 0) {
    return clampSectionHeight(visualHeight);
  }
  return clampSectionHeight(section.dataset.layoutMinHeight || section.style.minHeight || 320);
}

/**
 * Gives every top-level Section one bottom-edge resize handle. The helper owns
 * pointer and keyboard interaction only; LayoutTree persistence stays behind
 * the callbacks supplied by the Designer renderer.
 */
export function refreshSectionResizeHandles({
  layoutRoot,
  onResize,
  onCommit
} = {}) {
  if (!layoutRoot) return [];

  const sections = Array.from(
    layoutRoot.querySelectorAll(':scope > .layout-section[data-section-id]')
  );
  sections.forEach(section => {
    let handle = section.querySelector(':scope > .layout-section-resize-handle');
    if (handle) return;

    handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'layout-section-resize-handle';
    handle.setAttribute('aria-label', 'Resize section height');
    handle.title = 'Drag to resize section';
    handle.innerHTML = '<span aria-hidden="true"></span>';

    const applyHeight = (height, commit = false) => {
      const nextHeight = clampSectionHeight(height);
      try {
        onResize?.(section, nextHeight);
        handle.setAttribute('aria-valuenow', String(nextHeight));
        if (commit) onCommit?.(section, nextHeight);
      } catch (error) {
        console.warn('[Designer] DESIGNER_SECTION_RESIZE_FAILED', {
          sectionId: section.dataset.sectionId || null,
          height: nextHeight,
          commit
        }, error);
      }
    };

    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const startY = event.clientY;
      const startHeight = currentSectionHeight(section);
      const startScale = sectionVisualScale(section);
      section.classList.add('layout-section--resizing');
      handle.setPointerCapture?.(event.pointerId);

      const move = moveEvent => {
        // Pointer coordinates are screen pixels, whereas minHeight is stored
        // in authored canvas pixels. Correct the delta so resizing remains
        // one-to-one at every Builder zoom level.
        const authoredDelta = (moveEvent.clientY - startY) / startScale;
        applyHeight(startHeight + authoredDelta);
      };
      const finish = finishEvent => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', finish);
        document.removeEventListener('pointercancel', finish);
        section.classList.remove('layout-section--resizing');
        handle.releasePointerCapture?.(finishEvent.pointerId);
        applyHeight(currentSectionHeight(section), true);
      };

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', finish);
      document.addEventListener('pointercancel', finish);
    });

    handle.addEventListener('keydown', event => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      const delta = event.key === 'ArrowUp' ? -8 : 8;
      applyHeight(currentSectionHeight(section) + delta, true);
    });

    section.appendChild(handle);
  });
  return sections;
}
