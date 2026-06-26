interface DashboardGrid {
  removeWidget: (el: HTMLElement) => void;
  update: (el: HTMLElement, opts: { w: number }) => void;
  _updateGridHeight?: () => void;
  emitChange?: (el: HTMLElement) => void;
}

function renderIcon(name: string, fallback: string): string {
  return typeof window.featherIcon === 'function'
    ? window.featherIcon(name)
    : fallback;
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

  const resizeBtn = document.createElement('button');
  resizeBtn.className = 'widget-resize';
  resizeBtn.dataset.state = 'small';

  const updateIcon = () => {
    if (resizeBtn.dataset.state === 'small') {
      resizeBtn.innerHTML = renderIcon('maximize', '+');
    } else {
      resizeBtn.innerHTML = renderIcon('minimize', '-');
    }
  };
  updateIcon();

  resizeBtn.addEventListener('click', e => {
    e.stopPropagation();
    const currentW = parseInt(el.getAttribute('gs-w') || '', 10) || 4;
    const newW = currentW <= 4 ? 8 : 4;
    grid.update(el, { w: newW });
    resizeBtn.dataset.state = newW <= 4 ? 'small' : 'large';
    updateIcon();
    if (typeof grid._updateGridHeight === 'function') {
      grid._updateGridHeight();
    }
    if (typeof grid.emitChange === 'function') {
      grid.emitChange(el);
    }
  });
  el.appendChild(resizeBtn);

  el.addEventListener('dragstart', () => el.classList.add('is-dragging'));
  el.addEventListener('dragend', () => el.classList.remove('is-dragging'));
}
