import { showWidgetPopup, hideWidgetPopup } from './widgetPopup.js';

export function initContentHeader() {
  const editToggle = document.getElementById('edit-toggle');
  const actionBtn  = document.getElementById('dynamic-action-btn');
  const actionCfg  = window.CONTENT_ACTION;

  if (actionBtn) {
    if (actionCfg && actionCfg.icon) {
      actionBtn.src = actionCfg.icon;
      actionBtn.style.display = 'inline';
      const fn = typeof actionCfg.action === 'function'
        ? actionCfg.action
        : window[actionCfg.action];
      if (typeof fn === 'function') {
        actionBtn.onclick = fn;
      }
    } else {
      actionBtn.removeAttribute('src');
      actionBtn.style.display = 'none';
      actionBtn.onclick = null;
    }
  }

  if (!editToggle) return;

  let editing = false;
  if (window.adminGrid && typeof window.adminGrid.on === 'function') {
    const grid = window.adminGrid;
    grid.pushOnOverlap = grid.staticGrid;
    grid.on('staticchange', isStatic => {
      editing = !isStatic;
      grid.pushOnOverlap = isStatic;
      document.body.classList.toggle('dashboard-edit-mode', editing);
        editToggle.src = editing ? '/assets/icons/check.svg' : '/assets/icons/pencil-line.svg';
      if (editing) showWidgetPopup(); else hideWidgetPopup();
    });
  }
  editToggle.addEventListener('click', async () => {
    const grid = window.adminGrid;
    if (!grid || typeof grid.setStatic !== 'function') return;
    editing = !editing;
    grid.setStatic(!editing);
    document.body.classList.toggle('dashboard-edit-mode', editing);
      editToggle.src = editing ? '/assets/icons/check.svg' : '/assets/icons/pencil-line.svg';
    editToggle.classList.add('spin');
    setTimeout(() => editToggle.classList.remove('spin'), 300);
    if (editing) {
      showWidgetPopup();
    } else {
      hideWidgetPopup();
    }
    if (!editing && typeof window.saveAdminLayout === 'function') {
      try { await window.saveAdminLayout(); } catch(e) { console.error(e); }
    }
  });
}

document.addEventListener('DOMContentLoaded', initContentHeader);
document.addEventListener('content-header-loaded', initContentHeader);
