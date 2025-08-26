/**
 * Dashboard-only helpers for widget controls.
 * Provides remove and resize buttons without relying on builder modules.
 * @param {HTMLElement} el - Canvas item wrapper
 * @param {Object} grid - CanvasGrid instance
 */
export function attachDashboardControls(el, grid) {
  if (!el || !grid) return;
  // Avoid adding duplicate controls if already attached
  if (el.querySelector('.widget-remove')) return;

  // Overlay to capture drag events while widget body is non-interactive
  const hit = document.createElement('div');
  hit.className = 'hit-layer';
  hit.addEventListener('pointerdown', ev => {
    el._gridDragStart?.(ev);
  });
  el.appendChild(hit);

  // Remove button
  const removeBtn = document.createElement('button');
  removeBtn.className = 'widget-remove';
  if (window.featherIcon) {
    removeBtn.innerHTML = window.featherIcon('x');
  } else {
    removeBtn.textContent = '×';
  }
  removeBtn.addEventListener('click', e => {
    e.stopPropagation();
    grid.removeWidget(el);
  });
  el.appendChild(removeBtn);

  // Resize button (toggle small/large)
  const resizeBtn = document.createElement('button');
  resizeBtn.className = 'widget-resize';
  resizeBtn.dataset.state = 'small';

  const updateIcon = () => {
    if (window.featherIcon) {
      const icon = resizeBtn.dataset.state === 'small' ? 'maximize' : 'minimize';
      resizeBtn.innerHTML = window.featherIcon(icon);
    } else {
      resizeBtn.textContent = resizeBtn.dataset.state === 'small' ? '▢' : '▣';
    }
  };
  updateIcon();

  resizeBtn.addEventListener('click', e => {
    e.stopPropagation();
    const currentW = parseInt(el.getAttribute('gs-w'), 10) || 4;
    const newW = currentW <= 4 ? 8 : 4;
    grid.update(el, { w: newW });
    resizeBtn.dataset.state = newW <= 4 ? 'small' : 'large';
    updateIcon();
    if (typeof grid._updateGridHeight === 'function') {
      grid._updateGridHeight();
    }
    if (typeof grid._emit === 'function') {
      grid._emit('change', el);
    }
  });
  el.appendChild(resizeBtn);

  el.addEventListener('dragstart', () => el.classList.add('is-dragging'));
  el.addEventListener('dragend', () => el.classList.remove('is-dragging'));
}
