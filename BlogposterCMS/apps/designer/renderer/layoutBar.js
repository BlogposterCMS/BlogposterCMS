export function buildLayoutBar({ footer, grid, gridEl }) {
  const layoutBar = document.createElement('div');
  layoutBar.className = 'layout-bar';

  const zoomWrap = document.createElement('div');
  zoomWrap.className = 'zoom-controls';
  const zoomOut = document.createElement('button');
  zoomOut.title = 'Zoom out';
  zoomOut.innerHTML = window.featherIcon ? window.featherIcon('minus') : '<img src="/assets/icons/zoom-out.svg" alt="-" />';
  const zoomLevel = document.createElement('span');
  zoomLevel.className = 'zoom-level';
  const zoomSlider = document.createElement('input');
  zoomSlider.type = 'range';
  zoomSlider.min = '10';
  zoomSlider.max = '500';
  zoomSlider.step = '1';
  zoomSlider.value = '100';
  zoomSlider.style.width = '180px';
  const zoomIn = document.createElement('button');
  zoomIn.title = 'Zoom in';
  zoomIn.innerHTML = window.featherIcon ? window.featherIcon('plus') : '<img src="/assets/icons/zoom-in.svg" alt="+" />';

  let zoomPct = 100;
  function applyZoom(pct) {
    zoomPct = Math.max(10, Math.min(500, Math.round(pct)));
    zoomSlider.value = String(zoomPct);
    zoomLevel.textContent = `${zoomPct}%`;
    const scale = zoomPct / 100;
    if (grid && typeof grid.setScale === 'function') {
      grid.setScale(scale);
    } else if (gridEl) {
      gridEl.style.transformOrigin = 'center center';
      gridEl.style.transform = `scale(${scale})`;
      gridEl.style.setProperty('--canvas-scale', String(scale));
      gridEl.dispatchEvent(new Event('zoom', { bubbles: true }));
    }
  }

  applyZoom(100);

  zoomOut.addEventListener('click', () => applyZoom(zoomPct - 10));
  zoomIn.addEventListener('click', () => applyZoom(zoomPct + 10));
  zoomSlider.addEventListener('input', () => applyZoom(parseInt(zoomSlider.value, 10) || 100));

  gridEl.addEventListener('zoom', () => {
    const sc = parseFloat(getComputedStyle(gridEl).getPropertyValue('--canvas-scale') || '1');
    const pct = Math.round(sc * 100);
    zoomPct = pct;
    zoomSlider.value = String(pct);
    zoomLevel.textContent = `${pct}%`;
  });

  zoomWrap.appendChild(zoomOut);
  zoomWrap.appendChild(zoomSlider);
  zoomWrap.appendChild(zoomLevel);
  zoomWrap.appendChild(zoomIn);
  layoutBar.appendChild(zoomWrap);

  (footer || document.body).appendChild(layoutBar);
  return layoutBar;
}
