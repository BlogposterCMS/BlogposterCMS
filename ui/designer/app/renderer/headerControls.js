import {
  BUILDER_VIEWPORT_MAX,
  BUILDER_VIEWPORT_MIN,
  getBuilderViewportState,
  setBuilderViewportPreset,
  setBuilderViewportWidth,
  subscribeBuilderViewport
} from '/ui/designer/app/renderer/viewportState.js';
import {
  defaultResponsiveWidthRange,
  normalizeResponsiveWidthRange
} from '/ui/shared/layout/responsivePlacement.js';

export function initHeaderControls(topBar, gridEl, viewportSizeEl, grid, { undo, redo }) {
  const viewportBtn = topBar.querySelector('#viewportControlBtn');
  const viewportPanel = topBar.querySelector('.viewport-slider');
  const viewportRange = viewportPanel?.querySelector('.viewport-range');
  const viewportValue = viewportPanel?.querySelector('.viewport-value');
  const responsiveRangeMin = viewportPanel?.querySelector('.responsive-range-min');
  const responsiveRangeMax = viewportPanel?.querySelector('.responsive-range-max');
  const responsiveRangeBand = viewportPanel?.querySelector('.responsive-validity-band');
  const responsiveRangeValue = viewportPanel?.querySelector('.responsive-validity-value');
  const responsiveMarkers = viewportPanel?.querySelector('.responsive-rule-markers');
  const responsiveSection = viewportPanel?.querySelector('.responsive-validity');
  if (window.featherIcon && viewportBtn) {
    viewportBtn.innerHTML = window.featherIcon('monitor');
  }

  function selectedWidget() {
    return grid?.activeEl || gridEl?.querySelector?.('.canvas-item.selected') || null;
  }

  function rangePercent(value) {
    return ((value - BUILDER_VIEWPORT_MIN) / (BUILDER_VIEWPORT_MAX - BUILDER_VIEWPORT_MIN)) * 100;
  }

  function syncResponsiveRangeUi(rangeValue = null) {
    const selected = selectedWidget();
    const placementState = grid?.getResponsivePlacementState?.(selected);
    const nextRange = normalizeResponsiveWidthRange(
      rangeValue || placementState?.activeRule || defaultResponsiveWidthRange(getBuilderViewportState().width),
      getBuilderViewportState().width
    );
    grid?.setResponsiveRange?.(nextRange, { element: selected, rewriteActive: false });
    if (responsiveSection) {
      responsiveSection.classList.toggle('is-disabled', !selected);
      responsiveSection.dataset.hasSelection = selected ? 'true' : 'false';
    }
    if (responsiveRangeMin) {
      responsiveRangeMin.value = String(nextRange.minWidth);
      responsiveRangeMin.disabled = !selected;
    }
    if (responsiveRangeMax) {
      responsiveRangeMax.value = String(nextRange.maxWidth);
      responsiveRangeMax.disabled = !selected;
    }
    if (responsiveRangeBand) {
      responsiveRangeBand.style.setProperty('--responsive-range-start', `${rangePercent(nextRange.minWidth)}%`);
      responsiveRangeBand.style.setProperty('--responsive-range-end', `${rangePercent(nextRange.maxWidth)}%`);
    }
    if (responsiveRangeValue) {
      responsiveRangeValue.textContent = selected
        ? `${nextRange.minWidth}–${nextRange.maxWidth}px`
        : 'Select a widget';
    }
    if (responsiveMarkers) {
      responsiveMarkers.replaceChildren();
      (placementState?.rules || []).forEach(rule => {
        const marker = document.createElement('span');
        marker.style.left = `${rangePercent(rule.minWidth)}%`;
        marker.style.width = `${Math.max(0.5, rangePercent(rule.maxWidth) - rangePercent(rule.minWidth))}%`;
        marker.dataset.ruleId = rule.id;
        responsiveMarkers.appendChild(marker);
      });
    }
    return nextRange;
  }

  function commitResponsiveRange(range) {
    const selected = selectedWidget();
    if (!selected) return;
    const normalized = normalizeResponsiveWidthRange(range, getBuilderViewportState().width);
    grid?.setResponsiveRange?.(normalized, { element: selected, rewriteActive: true });
    syncResponsiveRangeUi(normalized);
  }

  function applyViewportState(next) {
    const val = next.width;
    if (grid?.setResponsiveViewport) {
      grid.setResponsiveViewport(val);
    } else {
      const viewportEl = grid?.zoomTarget || gridEl.parentElement || gridEl;
      viewportEl.style.width = `${val}px`;
      viewportEl.style.margin = '0 auto';
    }
    if (viewportRange) viewportRange.value = String(val);
    if (viewportValue) viewportValue.textContent = `${val}px`;
    viewportSizeEl.textContent = `${val}px`;
    document.querySelectorAll('[data-builder-viewport-preset]').forEach(button => {
      const active = button.dataset.builderViewportPreset === next.presetId;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    requestAnimationFrame(() => syncResponsiveRangeUi());
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
  viewportPanel?.addEventListener('pointerdown', event => event.stopPropagation());
  viewportPanel?.addEventListener('click', event => event.stopPropagation());

  viewportRange?.addEventListener('input', () => {
    const val = parseInt(viewportRange.value, 10);
    if (Number.isFinite(val)) setBuilderViewportWidth(val);
  });
  responsiveRangeMin?.addEventListener('input', () => {
    const maxWidth = Math.max(
      parseInt(responsiveRangeMin.value, 10) || BUILDER_VIEWPORT_MIN,
      parseInt(responsiveRangeMax?.value || '', 10) || BUILDER_VIEWPORT_MAX
    );
    commitResponsiveRange({
      minWidth: parseInt(responsiveRangeMin.value, 10),
      maxWidth
    });
  });
  responsiveRangeMax?.addEventListener('input', () => {
    const minWidth = Math.min(
      parseInt(responsiveRangeMin?.value || '', 10) || BUILDER_VIEWPORT_MIN,
      parseInt(responsiveRangeMax.value, 10) || BUILDER_VIEWPORT_MAX
    );
    commitResponsiveRange({
      minWidth,
      maxWidth: parseInt(responsiveRangeMax.value, 10)
    });
  });
  viewportPanel?.querySelectorAll('[data-responsive-scope]').forEach(button => {
    button.addEventListener('click', () => {
      const width = getBuilderViewportState().width;
      const scope = button.dataset.responsiveScope;
      if (scope === 'lower') {
        commitResponsiveRange({ minWidth: BUILDER_VIEWPORT_MIN, maxWidth: width });
      } else if (scope === 'higher') {
        commitResponsiveRange({ minWidth: width, maxWidth: BUILDER_VIEWPORT_MAX });
      } else if (scope === 'all') {
        commitResponsiveRange({ minWidth: BUILDER_VIEWPORT_MIN, maxWidth: BUILDER_VIEWPORT_MAX });
      } else {
        commitResponsiveRange(defaultResponsiveWidthRange(width));
      }
    });
  });
  const syncResponsiveSelection = () => syncResponsiveRangeUi();
  document.addEventListener('designerSelectionChanged', syncResponsiveSelection);
  document.addEventListener('designerResponsivePlacementChanged', syncResponsiveSelection);
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
    document.removeEventListener('designerSelectionChanged', syncResponsiveSelection);
    document.removeEventListener('designerResponsivePlacementChanged', syncResponsiveSelection);
    hideViewportPanel();
    hideHeaderMenu();
  };
}
