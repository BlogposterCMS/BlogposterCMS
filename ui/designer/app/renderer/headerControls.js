import {
  getBuilderViewportState,
  setBuilderViewportPreset,
  setBuilderViewportWidth,
  subscribeBuilderViewport
} from '/ui/designer/app/renderer/viewportState.js';

export function initHeaderControls(topBar, gridEl, viewportSizeEl, grid, { undo, redo }) {
  const viewportBtn = topBar.querySelector('#viewportControlBtn');
  const viewportPanel = topBar.querySelector('.viewport-slider');
  const viewportRange = viewportPanel?.querySelector('.viewport-range');
  const viewportValue = viewportPanel?.querySelector('.viewport-value');
  if (window.featherIcon && viewportBtn) {
    viewportBtn.innerHTML = window.featherIcon('monitor');
  }

  const viewportEl = grid?.scrollContainer || gridEl.parentElement || gridEl;
  function applyViewportState(next) {
    const val = next.width;
    if (viewportEl) {
      viewportEl.style.width = `${val}px`;
      viewportEl.style.margin = '0 auto';
    }
    if (viewportRange) viewportRange.value = String(val);
    if (viewportValue) viewportValue.textContent = `${val}px`;
    viewportSizeEl.textContent = `${val}px`;
    if (grid && typeof grid.setScale === 'function') {
      const current = grid.scale || parseFloat(
        getComputedStyle(gridEl).getPropertyValue('--canvas-scale') || '1'
      );
      grid.setScale(current);
    }
    document.querySelectorAll('[data-builder-viewport-preset]').forEach(button => {
      const active = button.dataset.builderViewportPreset === next.presetId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  const unsubscribeViewport = subscribeBuilderViewport(applyViewportState);
  const presetButtons = Array.from(document.querySelectorAll('[data-builder-viewport-preset]'));
  presetButtons.forEach(button => {
    if (button.dataset.builderViewportBound === 'true') return;
    button.dataset.builderViewportBound = 'true';
    button.addEventListener('click', () => {
      setBuilderViewportPreset(button.dataset.builderViewportPreset);
    });
  });

  function hideViewportPanel() {
    if (!viewportPanel) return;
    viewportPanel.style.display = 'none';
    document.removeEventListener('click', outsideViewportHandler);
  }

  function outsideViewportHandler(e) {
    if (!viewportPanel || !viewportBtn) return;
    if (!viewportPanel.contains(e.target) && e.target !== viewportBtn) hideViewportPanel();
  }

  viewportBtn?.addEventListener('click', e => {
    e.stopPropagation();
    if (!viewportPanel) return;
    if (viewportPanel.style.display === 'block') { hideViewportPanel(); return; }
    viewportPanel.style.display = 'block';
    viewportPanel.style.visibility = 'hidden';
    const rect = viewportBtn.getBoundingClientRect();
    const headerRect = topBar.getBoundingClientRect();
    const top = rect.bottom - headerRect.top + 4;
    viewportPanel.style.top = `${top}px`;
    let left = rect.left - headerRect.left;
    const panelWidth = viewportPanel.offsetWidth || 0;
    const maxLeft = Math.max(8, topBar.clientWidth - panelWidth - 8);
    if (left > maxLeft) left = maxLeft;
    viewportPanel.style.left = `${left}px`;
    viewportPanel.style.visibility = '';
    document.addEventListener('click', outsideViewportHandler);
  });

  viewportRange?.addEventListener('input', () => {
    const val = parseInt(viewportRange.value, 10);
    if (Number.isFinite(val)) setBuilderViewportWidth(val);
  });

  const headerMenuBtn = topBar.querySelector('.builder-menu-btn');
  const headerMenu = topBar.querySelector('.builder-options-menu');
  if (window.featherIcon && headerMenuBtn) {
    headerMenuBtn.innerHTML = window.featherIcon('more-vertical');
  }

  function hideHeaderMenu() {
    if (!headerMenu) return;
    headerMenu.style.display = 'none';
    document.removeEventListener('click', outsideHeaderHandler);
  }

  function outsideHeaderHandler(e) {
    if (!headerMenu || !headerMenuBtn) return;
    if (!headerMenu.contains(e.target) && e.target !== headerMenuBtn) hideHeaderMenu();
  }

  headerMenuBtn?.addEventListener('click', e => {
    e.stopPropagation();
    if (!headerMenu) return;
    if (headerMenu.style.display === 'block') { hideHeaderMenu(); return; }
    headerMenu.style.display = 'block';
    headerMenu.style.visibility = 'hidden';
    const rect = headerMenuBtn.getBoundingClientRect();
    const headerRect = topBar.getBoundingClientRect();
    headerMenu.style.top = `${rect.bottom - headerRect.top + 4}px`;
    headerMenu.style.left = `${rect.right - headerRect.left - headerMenu.offsetWidth}px`;
    headerMenu.style.visibility = '';
    document.addEventListener('click', outsideHeaderHandler);
  });

  topBar.querySelectorAll('.header-actions .menu-undo').forEach(btn => {
    btn.addEventListener('click', () => { hideHeaderMenu(); undo(); });
  });
  topBar.querySelectorAll('.header-actions .menu-redo').forEach(btn => {
    btn.addEventListener('click', () => { hideHeaderMenu(); redo(); });
  });

  let proMode = true;
  function applyProMode() {
    document.body.classList.toggle('pro-mode', proMode);
    document.querySelectorAll('.widget-edit').forEach(btn => {
      btn.style.display = proMode ? '' : 'none';
    });
    if (!proMode) {
      document.querySelectorAll('.widget-code-editor').forEach(ed => {
        ed.style.display = 'none';
      });
    }
  }

  const proToggle = headerMenu?.querySelector('.pro-toggle');
  if (proToggle) {
    proToggle.checked = proMode;
    proToggle.addEventListener('change', () => {
      proMode = proToggle.checked;
      applyProMode();
    });
  }

  applyProMode();
  applyViewportState(getBuilderViewportState());
  return () => {
    unsubscribeViewport();
    hideViewportPanel();
    hideHeaderMenu();
  };
}
