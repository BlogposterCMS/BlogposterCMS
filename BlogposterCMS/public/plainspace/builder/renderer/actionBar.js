//public//plainspace/builder/renderer/actionBar.js
export function createActionBar(selectWidget, grid, state, scheduleAutosave) {
  const actionBar = document.createElement('div');
  actionBar.className = 'widget-action-bar';
  actionBar.innerHTML = `
    <button class="action-lock"></button>
    <button class="action-duplicate"></button>
    <button class="action-delete"></button>
    <button class="action-menu"></button>
  `;
  actionBar.style.display = 'none';
  document.body.appendChild(actionBar);

  const lockBtn = actionBar.querySelector('.action-lock');
  const dupBtn = actionBar.querySelector('.action-duplicate');
  const menuBtn = actionBar.querySelector('.action-menu');
  const delBtn = actionBar.querySelector('.action-delete');

  const setLockIcon = locked => {
    const icon = locked ? 'unlock' : 'lock';
    lockBtn.innerHTML = window.featherIcon
      ? window.featherIcon(icon)
      : `<img src="/assets/icons/${icon}.svg" alt="${icon}" />`;
  };

  dupBtn.innerHTML = window.featherIcon ? window.featherIcon('copy') : '<img src="/assets/icons/copy.svg" alt="copy" />';
  menuBtn.innerHTML = window.featherIcon ? window.featherIcon('more-vertical') : '<img src="/assets/icons/more-vertical.svg" alt="menu" />';
  delBtn.innerHTML = window.featherIcon ? window.featherIcon('trash') : '<img src="/assets/icons/trash.svg" alt="delete" />';

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
    actionBar.style.visibility = 'hidden';
    const rect = el.getBoundingClientRect();
    actionBar.style.top = `${rect.top - 28 + window.scrollY}px`;
    actionBar.style.left = `${rect.left + rect.width / 2 + window.scrollX}px`;
    actionBar.style.visibility = '';
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

  return { actionBar, select };
}
