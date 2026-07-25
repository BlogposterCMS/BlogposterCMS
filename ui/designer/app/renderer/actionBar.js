export function createActionBar(selectWidget, grid, state, scheduleAutosave) {
  const actionBar = document.createElement('div');
  actionBar.className = 'widget-action-bar';
  actionBar.setAttribute('role', 'toolbar');
  actionBar.setAttribute('aria-label', 'Selected element actions');
  actionBar.innerHTML = `
    <button type="button" class="action-lock" aria-label="Lock element" data-tooltip="Lock"></button>
    <button type="button" class="action-duplicate" aria-label="Duplicate element" data-tooltip="Duplicate"></button>
    <button type="button" class="action-delete" aria-label="Delete element" data-tooltip="Delete"></button>
    <button type="button" class="action-menu" aria-label="More element options" data-tooltip="More"></button>
  `;
  actionBar.style.display = 'none';
  document.body.appendChild(actionBar);

  const lockBtn = actionBar.querySelector('.action-lock');
  const dupBtn = actionBar.querySelector('.action-duplicate');
  const menuBtn = actionBar.querySelector('.action-menu');
  const delBtn = actionBar.querySelector('.action-delete');

  const setLockIcon = locked => {
    const icon = locked ? 'unlock' : 'lock';
    const label = locked ? 'Unlock element' : 'Lock element';
    lockBtn.innerHTML = window.featherIcon
      ? window.featherIcon(icon)
      : `<img src="/assets/icons/${icon}.svg" alt="${icon}" />`;
    lockBtn.setAttribute('aria-label', label);
    lockBtn.dataset.tooltip = locked ? 'Unlock' : 'Lock';
    lockBtn.classList.toggle('locked', locked);
  };

  dupBtn.innerHTML = window.featherIcon ? window.featherIcon('copy') : '<img src="/assets/icons/copy.svg" alt="copy" />';
  menuBtn.innerHTML = window.featherIcon ? window.featherIcon('more-vertical') : '<img src="/assets/icons/ellipsis-vertical.svg" alt="menu" />';
  delBtn.innerHTML = window.featherIcon ? window.featherIcon('trash') : '<img src="/assets/icons/trash.svg" alt="delete" />';

  function refreshPosition(el = state.activeWidgetEl) {
    if (!el || actionBar.style.display === 'none') return;
    const rect = el.getBoundingClientRect();
    const barWidth = actionBar.offsetWidth || 0;
    const barHeight = actionBar.offsetHeight || 0;
    const gap = 8;
    let left = rect.left + rect.width / 2 + window.scrollX - barWidth / 2;
    let top = rect.top + window.scrollY - barHeight - gap;
    const minTop = window.scrollY + gap;
    if (top < minTop) {
      top = rect.bottom + window.scrollY + gap;
    }
    const viewportLeft = window.scrollX + gap;
    const viewportRight = window.scrollX + document.documentElement.clientWidth - gap;
    if (barWidth > 0) {
      left = Math.max(viewportLeft, Math.min(left, viewportRight - barWidth));
    }
    const textToolbar = document.querySelector('.text-block-editor-toolbar');
    if (textToolbar && barWidth > 0 && barHeight > 0) {
      const textToolbarRect = textToolbar.getBoundingClientRect();
      const textToolbarVisible = textToolbarRect.width > 0 && textToolbarRect.height > 0;
      const actionBarRect = {
        left: left - window.scrollX,
        right: left - window.scrollX + barWidth,
        top: top - window.scrollY,
        bottom: top - window.scrollY + barHeight
      };
      const overlapsTextToolbar = textToolbarVisible && (
        actionBarRect.left < textToolbarRect.right &&
        actionBarRect.right > textToolbarRect.left &&
        actionBarRect.top < textToolbarRect.bottom &&
        actionBarRect.bottom > textToolbarRect.top
      );
      if (overlapsTextToolbar) {
        top = rect.bottom + window.scrollY + gap;
      }
    }
    actionBar.style.top = `${top}px`;
    actionBar.style.left = `${left}px`;
    actionBar.style.visibility = '';
  }

  function select(el) {
    if (!el) return;
    if (state.activeWidgetEl) {
      state.activeWidgetEl.classList.remove('selected');
      state.activeWidgetEl.dispatchEvent(new Event('deselected'));
    }
    state.activeWidgetEl = el;
    const editable = window.getRegisteredEditable
      ? window.getRegisteredEditable(el)
      : null;
    if (editable) window.setActiveElement(editable);
    el.dispatchEvent(new Event('selected'));
    state.activeWidgetEl.classList.add('selected');
    grid.select(el);
    const locked = el.getAttribute('gs-locked') === 'true';
    setLockIcon(locked);
    actionBar.style.display = 'flex';
    // Context controls are injected after selection, so positioning is
    // intentionally reusable once the final toolbar width is known.
    actionBar.style.visibility = 'hidden';
    refreshPosition(el);
  }

  lockBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (!state.activeWidgetEl) return;
    const locked = state.activeWidgetEl.getAttribute('gs-locked') === 'true';
    state.activeWidgetEl.setAttribute('gs-locked', (!locked).toString());
    grid.update(state.activeWidgetEl, { locked: !locked, noMove: !locked, noResize: !locked });
    setLockIcon(!locked);
    if (state.pageId) scheduleAutosave();
  });

  menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (!state.activeWidgetEl || !state.activeWidgetEl.__optionsMenu) return;
    const menu = state.activeWidgetEl.__optionsMenu;
    if (menu.style.display === 'block' && menu.currentTrigger === menuBtn) {
      menu.hide();
      return;
    }
    menu.show(menuBtn);
  });

  delBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (!state.activeWidgetEl) return;
    const target = state.activeWidgetEl;
    target.classList.remove('selected');
    target.dispatchEvent(new Event('deselected'));
    grid.removeWidget(target);
    actionBar.style.display = 'none';
    state.activeWidgetEl = null;
    if (state.pageId) scheduleAutosave();
  });

  return { actionBar, select, refreshPosition };
}
