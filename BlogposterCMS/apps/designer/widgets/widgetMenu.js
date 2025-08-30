import { makeSelector, extractCssProps } from '../renderer/renderUtils.js';
import { wrapCss } from '../utils.js';
import { renderWidget } from './widgetRenderer.js';
import * as widgetActions from '../renderer/widgetActions.js';

export function attachOptionsMenu(el, widgetDef, editBtn, {
  grid,
  pageId,
  scheduleAutosave,
  activeLayer,
  codeMap,
  genId
}) {
  const menuBtn = document.createElement('button');
  menuBtn.className = 'widget-menu';
  menuBtn.innerHTML = window.featherIcon
    ? window.featherIcon('more-vertical')
    : '<img src="/assets/icons/ellipsis-vertical.svg" alt="menu" />';

  const menu = document.createElement('div');
  menu.className = 'widget-options-menu';
  menu.innerHTML = `
        <button class="menu-edit"><img src="/assets/icons/pencil-line.svg" class="icon" alt="edit" /> Edit Code</button>
      <button class="menu-copy"><img src="/assets/icons/copy.svg" class="icon" alt="duplicate" /> Duplicate</button>
      <button class="menu-template"><img src="/assets/icons/package.svg" class="icon" alt="template" /> Save as Template</button>
      <button class="menu-lock"><img src="/assets/icons/lock.svg" class="icon" alt="lock" /> Lock Position</button>
      <button class="menu-snap"><img src="/assets/icons/layout-grid.svg" class="icon" alt="snap" /> Snap to Grid</button>
      <button class="menu-shared"><img src="/assets/icons/globe.svg" class="icon" alt="shared" /> Set as Shared Widget</button>
      <button class="menu-layer-up"><img src="/assets/icons/arrow-up.svg" class="icon" alt="layer up" /> Layer Up</button>
      <button class="menu-layer-down"><img src="/assets/icons/arrow-down.svg" class="icon" alt="layer down" /> Layer Down</button>
  `;
  menu.style.display = 'none';
  document.body.appendChild(menu);

  function hideMenu() {
    menu.style.display = 'none';
    document.removeEventListener('click', outsideHandler);
  }

  function showMenu(triggerEl = menuBtn) {
    updateSharedBtn();
    menu.style.display = 'block';
    menu.style.visibility = 'hidden';
    const rect = triggerEl.getBoundingClientRect();
    menu.style.top = `${rect.top}px`;
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft = rect.left;
    if (spaceRight >= menu.offsetWidth || spaceRight >= spaceLeft) {
      menu.style.left = `${rect.right + 4}px`;
    } else {
      const left = rect.left - menu.offsetWidth - 4;
      menu.style.left = `${Math.max(0, left)}px`;
    }
    menu.style.visibility = '';
    menu.currentTrigger = triggerEl;
    document.addEventListener('click', outsideHandler);
  }

  function outsideHandler(ev) {
    if (!menu.contains(ev.target) && ev.target !== menu.currentTrigger) hideMenu();
  }

  menu.show = showMenu;
  menu.hide = hideMenu;

  menuBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (menu.style.display === 'block' && menu.currentTrigger === menuBtn) {
      hideMenu();
      return;
    }
    showMenu(menuBtn);
  });

  menu.querySelector('.menu-edit').onclick = () => { editBtn.click(); menu.style.display = 'none'; };
  menu.querySelector('.menu-copy').onclick = () => {
    const clone = el.cloneNode(true);
    const cloneId = genId();
    clone.id = `widget-${cloneId}`;
    clone.dataset.instanceId = cloneId;
    clone.dataset.global = el.dataset.global || 'false';
    clone.dataset.layer = el.dataset.layer || String(activeLayer);
    grid.appendChild(clone);
    grid.__grid.makeWidget(clone);
    const cEditBtn = editBtn.cloneNode(true);
    clone.appendChild(cEditBtn);
    attachOptionsMenu(clone, widgetDef, cEditBtn, { grid, pageId, scheduleAutosave, activeLayer, codeMap, genId });
    renderWidget(clone, widgetDef, codeMap);
    if (pageId) scheduleAutosave();
    menu.style.display = 'none';
  };
  menu.querySelector('.menu-template').onclick = () => {
    const defaultName = widgetDef.metadata?.label || widgetDef.id;
    const name = prompt('Template name:', defaultName);
    if (!name) { menu.style.display = 'none'; return; }
    let templates = [];
    try { templates = JSON.parse(localStorage.getItem('widgetTemplates') || '[]'); } catch {}
    const data = {
      widgetId: widgetDef.id,
      w: +el.getAttribute('gs-w'),
      h: +el.getAttribute('gs-h'),
      code: codeMap[el.dataset.instanceId] || null
    };
    const idx = templates.findIndex(t => t.name === name);
    if (idx !== -1) {
      if (!confirm('Template exists. Override?')) { menu.style.display = 'none'; return; }
      templates[idx].data = data;
      templates[idx].widgetId = widgetDef.id;
      templates[idx].label = widgetDef.metadata?.label || widgetDef.id;
    } else {
      templates.push({ name, widgetId: widgetDef.id, label: widgetDef.metadata?.label || widgetDef.id, data });
    }
    localStorage.setItem('widgetTemplates', JSON.stringify(templates));
    window.dispatchEvent(new Event('widgetTemplatesUpdated'));
    menu.style.display = 'none';
  };
  const sharedBtn = menu.querySelector('.menu-shared');
  function updateSharedBtn() {
    const isShared = el.dataset.global === 'true';
    sharedBtn.innerHTML = `<img src="/assets/icons/globe.svg" class="icon" alt="shared" /> ${isShared ? 'Unset Shared Widget' : 'Set as Shared Widget'}`;
  }
  sharedBtn.onclick = () => {
    const isShared = el.dataset.global === 'true';
    if (isShared) {
      el.dataset.global = 'false';
      const newLocalId = genId();
      el.dataset.instanceId = newLocalId;
      el.id = `widget-${newLocalId}`;
    } else {
      el.dataset.global = 'true';
      el.dataset.instanceId = `global-${widgetDef.id}`;
      el.id = `widget-${el.dataset.instanceId}`;
    }
    updateSharedBtn();
    menu.style.display = 'none';
    if (pageId) scheduleAutosave();
  };
  menu.querySelector('.menu-layer-up').onclick = () => {
    const layer = (+el.dataset.layer || 0) + 1;
    el.dataset.layer = layer;
    el.style.zIndex = layer.toString();
    menu.style.display = 'none';
    if (pageId) scheduleAutosave();
  };
  menu.querySelector('.menu-layer-down').onclick = () => {
    let layer = (+el.dataset.layer || 0) - 1;
    if (layer < 0) layer = 0;
    el.dataset.layer = layer;
    el.style.zIndex = layer.toString();
    menu.style.display = 'none';
    if (pageId) scheduleAutosave();
  };

  // attach custom actions only if a matching handler exists
  menu.querySelectorAll('button[data-action]').forEach(btn => {
    btn.onclick = e => {
      e.stopPropagation();
      const actionKey = btn.dataset.action;
      const fn = widgetActions[actionKey];
      if (typeof fn === 'function') fn(el);
    };
  });

  el.appendChild(menuBtn);
  el.__optionsMenu = menu;
}
