export function registerDeselect(gridEl, state, actionBar, hideToolbar) {
  document.addEventListener('click', e => {
    if (!state.activeWidgetEl) return;
    if (
      e.target.closest('.canvas-item') === state.activeWidgetEl ||
      e.target.closest('.widget-action-bar') ||
      e.target.closest('.text-block-editor-toolbar') ||
      e.target.closest('.bg-editor-toolbar') ||
      e.target.closest('.color-picker')
    ) {
      return;
    }
    actionBar.style.display = 'none';
    state.activeWidgetEl.classList.remove('selected');
    state.activeWidgetEl.dispatchEvent(new Event('deselected'));
    state.activeWidgetEl = null;
    hideToolbar();
    gridEl.__grid.clearSelection();
  });
}
