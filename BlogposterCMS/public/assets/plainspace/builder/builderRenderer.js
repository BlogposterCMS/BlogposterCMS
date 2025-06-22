// public/assets/plainspace/dashboard/builderRenderer.js
import {
  editElement,
  initTextEditor,
  showToolbar,
  hideToolbar,
  setActiveElement,
  getRegisteredEditable
} from '../main/globalTextEditor.js';
import { initGrid, getCurrentLayout, getCurrentLayoutForLayer, pushState } from './managers/gridManager.js';
import { applyLayout, getItemData } from './managers/layoutManager.js';
import { registerDeselect } from './managers/eventManager.js';
import { attachEditButton, attachRemoveButton, attachLockOnClick, attachOptionsMenu, renderWidget } from './managers/widgetManager.js';

import { addHitLayer, applyBuilderTheme, wrapCss, executeJs } from './utils.js';
import { createActionBar } from './renderer/actionBar.js';
import { scheduleAutosave as scheduleAutosaveFn, startAutosave as startAutosaveFn, saveCurrentLayout as saveLayout } from './renderer/autosave.js';
import { registerBuilderEvents } from './renderer/eventHandlers.js';
import { getWidgetIcon } from './renderer/renderUtils.js';

export async function initBuilder(sidebarEl, contentEl, pageId = null, startLayer = 0) {
  document.body.classList.add('builder-mode');
  initTextEditor();
  // Builder widgets load the active theme inside their shadow roots.
  // Inject the theme scoped to the builder grid so the preview matches
  // the active theme without altering the surrounding UI.
  const DEFAULT_PORTS = [
    { id: 'desktop', label: 'Desktop', class: 'preview-desktop' },
    { id: 'tablet', label: 'Tablet', class: 'preview-tablet' },
    { id: 'mobile', label: 'Mobile', class: 'preview-mobile' }
  ];

  const displayPorts = (Array.isArray(window.DISPLAY_PORTS) ? window.DISPLAY_PORTS : [])
    .filter(p => p && p.id && p.label)
    .map(p => ({
      id: String(p.id),
      label: String(p.label),
      class: `preview-${String(p.id).replace(/[^a-z0-9_-]/gi, '')}`
    }));
  if (!displayPorts.length) displayPorts.push(...DEFAULT_PORTS);

  // Temporary patch: larger default widget height
  const DEFAULT_ROWS = 20; // around 100px with 5px grid cells
  const ICON_MAP = {
    systemInfo: 'info',
    activityLog: 'list',
    pageEditor: 'file-text',
    mediaExplorer: 'folder',
    pageList: 'list',
    pageStats: 'bar-chart-2',
    pageEditorWidget: 'file-text',
    contentSummary: 'activity',
    htmlBlock: 'code',
    textBox: 'type'
  };

  let previewHeader;
  let viewportSelect;
  const layoutLayers = [
    { name: 'Global', layout: [] },
    { name: 'Layer 1', layout: [] },
    { name: 'Layer 2', layout: [] }
  ];
  let activeLayer = Math.max(0, Math.min(layoutLayers.length - 1, Number(startLayer) || 0));
  let globalLayoutName = null;
  let layoutBar;
  let globalToggle;

  function showPreviewHeader() {
    if (previewHeader) return;
    previewHeader = document.createElement('div');
    previewHeader.id = 'previewHeader';
    previewHeader.className = 'preview-header';
    viewportSelect = document.createElement('select');
    displayPorts.forEach(p => {
      const o = document.createElement('option');
      o.value = p.class;
      o.textContent = p.label;
      viewportSelect.appendChild(o);
    });
    viewportSelect.addEventListener('change', () => {
      document.body.classList.remove('preview-mobile', 'preview-tablet', 'preview-desktop');
      const cls = viewportSelect.value;
      if (cls) document.body.classList.add(cls);
    });
    previewHeader.appendChild(viewportSelect);
    document.body.prepend(previewHeader);
    viewportSelect.dispatchEvent(new Event('change'));
  }

  function hidePreviewHeader() {
    if (previewHeader) {
      previewHeader.remove();
      previewHeader = null;
      viewportSelect = null;
    }
    document.body.classList.remove('preview-mobile', 'preview-tablet', 'preview-desktop');
  }

  let proMode = true;
  let gridEl;
  const state = {
    pageId,
    autosaveEnabled: true,
    pendingSave: false,
    saveTimer: null,
    autosaveInterval: null,
    lastSavedLayoutStr: '' ,
    activeWidgetEl: null
  };
  function handleHtmlUpdate(e) {
    const { instanceId, html } = e.detail || {};
    if (!instanceId || typeof html !== 'string') return;
    codeMap[instanceId] = codeMap[instanceId] || {};
    codeMap[instanceId].html = html;

    const wrapper = gridEl?.querySelector(`.canvas-item[data-instance-id="${instanceId}"]`);
    if (wrapper && wrapper.__codeEditor && wrapper.__codeEditor.style.display !== 'none') {
      const htmlField = wrapper.__codeEditor.querySelector('.editor-html');
      if (htmlField) htmlField.value = html;
    }
  }
  document.addEventListener('widgetHtmlUpdate', handleHtmlUpdate);

  function updateAllWidgetContents() {
    if (!gridEl) return;
    gridEl.querySelectorAll('.canvas-item').forEach(widget => {
      const editable = getRegisteredEditable(widget);
      if (!editable) return;
      const instId = widget.dataset.instanceId;
      if (!instId) return;
      if (!codeMap[instId]) codeMap[instId] = {};
      codeMap[instId].html = editable.innerHTML.trim();
    });
  }

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
  const genId = () => `w${Math.random().toString(36).slice(2,8)}`;

  // Widget locking is now handled directly by the global text editor.

  function extractCssProps(el) {
    if (!el) return '';
    const style = getComputedStyle(el);
    const props = [
      'color', 'background', 'background-color', 'font-size', 'font-weight',
      'padding', 'margin', 'border', 'border-radius', 'display'
    ];
    return props.map(p => `${p}: ${style.getPropertyValue(p)};`).join('\n');
  }

  function makeSelector(el) {
    if (!el) return '';
    if (el.id) return `#${el.id}`;
    const cls = [...el.classList].join('.');
    const tag = el.tagName.toLowerCase();
    return cls ? `${tag}.${cls}` : tag;
  }

    script.remove();
    delete window.__builderRoot;
    delete window.__builderWrapper;
  }

  function getWidgetIcon(w) {
    const iconName = w.metadata?.icon || ICON_MAP[w.id] || w.id;
    return window.featherIcon ? window.featherIcon(iconName) :
      `<img src="/assets/icons/${iconName}.svg" alt="${iconName}" />`;
  }

  function renderWidget(wrapper, widgetDef, customData = null) {
    const instanceId = wrapper.dataset.instanceId;
    const data = customData || codeMap[instanceId] || null;

    const content = wrapper.querySelector('.canvas-item-content');
    content.innerHTML = '';
    const root = content;
    // Clean existing children to avoid duplicates on re-render
    while (root.firstChild) {
      root.removeChild(root.firstChild);
    }
    const container = document.createElement('div');
    container.className = 'widget-container';
    container.style.width = '100%';
    container.style.height = '100%';
    // Prevent drag actions when interacting with form controls inside widgets.
    // Attach the handler on both the container and the grid item content so
    // events are intercepted before the grid logic runs.
    const stop = ev => {
      const t = ev.target.closest('input, textarea, select, label, button');
      if (t) {
        ev.stopPropagation();
        ev.stopImmediatePropagation();
      }
    };
    container.addEventListener('pointerdown', stop, true);
    container.addEventListener('mousedown', stop, true);
    container.addEventListener(
      'touchstart',
      stop,
      { capture: true, passive: true }
    );
    content.addEventListener('pointerdown', stop, true);
    content.addEventListener('mousedown', stop, true);
    content.addEventListener(
      'touchstart',
      stop,
      { capture: true, passive: true }
    );
    root.appendChild(container);

    if (data) {
      if (data.css) {
        const customStyle = document.createElement('style');
        customStyle.textContent = data.css;
        root.appendChild(customStyle);
      }
      // theme styles applied globally
      if (data.html) {
        container.innerHTML = data.html;
      }
      if (data.js) {
        try { executeJs(data.js, wrapper, root); } catch (e) { console.error('[Builder] custom js error', e); }
      }
      return;
    }
    const ctx = {
      id: instanceId,
      widgetId: widgetDef.id,
      metadata: widgetDef.metadata
    };
    if (window.ADMIN_TOKEN) {
      ctx.jwt = window.ADMIN_TOKEN;
    }
    const codeUrl = new URL(widgetDef.codeUrl, document.baseURI).href;
    import(codeUrl)
      .then(m => m.render?.(container, ctx))
      .catch(err => console.error('[Builder] widget import error', err));

    // theme styles applied globally

    if (widgetDef.id === 'textBox') {
      addHitLayer(wrapper);
    }
  }

  function attachEditButton(el, widgetDef) {
    const btn = document.createElement('button');
    btn.className = 'widget-edit';
    // Use a gear icon to enter pro mode
    btn.innerHTML = window.featherIcon ? window.featherIcon('settings') : '<img src="/assets/icons/settings.svg" alt="pro" />';
    btn.style.display = proMode ? '' : 'none';
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      let overlay = el.__codeEditor;
      let htmlEl, cssEl, jsEl;
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'widget-code-editor';
        overlay.dataset.instanceId = el.dataset.instanceId;
        overlay.innerHTML = `
          <div class="editor-inner">
            <label>HTML</label>
            <textarea class="editor-html"></textarea>
            <label>CSS</label>
            <textarea class="editor-css"></textarea>
            <label>JS</label>
            <textarea class="editor-js"></textarea>
            <div class="editor-actions">
              <button class="media-btn">Insert Image</button>
              <button class="save-btn">Save</button>
              <button class="reset-btn">Reset to Default</button>
              <button class="cancel-btn">Cancel</button>
            </div>
          </div>`;
        document.body.appendChild(overlay);

        htmlEl = overlay.querySelector('.editor-html');
        cssEl = overlay.querySelector('.editor-css');
        jsEl = overlay.querySelector('.editor-js');
        const mediaBtn = overlay.querySelector('.media-btn');
        const updateRender = () => {
          const finalCss = wrapCss(cssEl.value, overlay.currentSelector);
          renderWidget(el, widgetDef, {
            html: htmlEl.value,
            css: finalCss,
            js: jsEl.value
          });
        };

        htmlEl.addEventListener('input', updateRender);
        cssEl.addEventListener('input', updateRender);
        jsEl.addEventListener('input', updateRender);

        mediaBtn.addEventListener('click', async () => {
          try {
            const { shareURL } = await window.meltdownEmit('openMediaExplorer', { jwt: window.ADMIN_TOKEN });
            if (shareURL) {
              const ta = htmlEl;
              const start = ta.selectionStart || 0;
              const end = ta.selectionEnd || 0;
              const safeUrl = shareURL.replace(/"/g, '&quot;');
              const imgTag = `<img src="${safeUrl}" alt="" />`;
              ta.value = ta.value.slice(0, start) + imgTag + ta.value.slice(end);
              ta.focus();
              ta.setSelectionRange(start + imgTag.length, start + imgTag.length);
              updateRender();
            }
          } catch (err) {
            console.error('[Builder] openMediaExplorer error', err);
          }
        });

        overlay.updateRender = updateRender;
        el.__codeEditor = overlay;
      } else {
        overlay.dataset.instanceId = el.dataset.instanceId;
        htmlEl = overlay.querySelector('.editor-html');
        cssEl = overlay.querySelector('.editor-css');
        jsEl = overlay.querySelector('.editor-js');
        const mediaBtn = overlay.querySelector('.media-btn');
        overlay.updateRender = () => {
          const finalCss = wrapCss(cssEl.value, overlay.currentSelector);
          renderWidget(el, widgetDef, {
            html: htmlEl.value,
            css: finalCss,
            js: jsEl.value
          });
        };
        mediaBtn.onclick = async () => {
          try {
            const { shareURL } = await window.meltdownEmit('openMediaExplorer', { jwt: window.ADMIN_TOKEN });
            if (shareURL) {
              const ta = htmlEl;
              const start = ta.selectionStart || 0;
              const end = ta.selectionEnd || 0;
              const safeUrl = shareURL.replace(/"/g, '&quot;');
              const imgTag = `<img src="${safeUrl}" alt="" />`;
              ta.value = ta.value.slice(0, start) + imgTag + ta.value.slice(end);
              ta.focus();
              ta.setSelectionRange(start + imgTag.length, start + imgTag.length);
              overlay.updateRender && overlay.updateRender();
            }
          } catch (err) {
            console.error('[Builder] openMediaExplorer error', err);
          }
        };
      }
      const instId = el.dataset.instanceId;
      const codeData = codeMap[instId] ? { ...codeMap[instId] } : {};

      if (!codeData.sourceJs) {
        try {
          const resp = await window.fetchWithTimeout(
            new URL(widgetDef.codeUrl, document.baseURI).href
          );
          codeData.sourceJs = await resp.text();
        } catch (err) {
          console.error('[Builder] fetch widget source error', err);
          codeData.sourceJs = '';
        }
      }
      if (codeData.html) {
        htmlEl.value = codeData.html;
      } else {
        const root = el.querySelector('.canvas-item-content');
        const container = root?.querySelector('.widget-container');
        htmlEl.value = container ? container.innerHTML.trim() : '';
      }
      overlay.querySelector('.editor-css').value = codeData.css || '';
      jsEl.value = codeData.js || '';
      overlay.defaultJs = codeData.sourceJs || '';
      overlay.currentSelector = codeData.selector || '';

      function pickElement() {
        const root = el.querySelector('.canvas-item-content');
        if (!root) return;
        const handler = ev => {
          ev.preventDefault();
          ev.stopPropagation();
          overlay.currentSelector = makeSelector(ev.target);
          overlay.querySelector('.editor-css').value = extractCssProps(ev.target);
          overlay.updateRender && overlay.updateRender();
          root.removeEventListener('click', handler, true);
        };
        root.addEventListener('click', handler, true);
      }

      pickElement();

      const rect = el.getBoundingClientRect();
      const spaceRight = window.innerWidth - rect.right;
      const spaceLeft = rect.left;
      overlay.classList.remove('left', 'right');
      overlay.style.display = 'block';
      overlay.style.visibility = 'hidden';
      overlay.style.top = `${rect.top}px`;
      if (spaceRight >= 300 || spaceRight >= spaceLeft) {
        overlay.classList.add('right');
        overlay.style.left = `${rect.right + 8}px`;
      } else {
        overlay.classList.add('left');
        const left = rect.left - overlay.offsetWidth - 8;
        overlay.style.left = `${Math.max(0, left)}px`;
      }
      overlay.style.visibility = '';

      overlay.updateRender && overlay.updateRender();
      overlay.querySelector('.save-btn').onclick = () => {
        const instId = el.dataset.instanceId;
        codeMap[instId] = {
          html: htmlEl.value,
          css: wrapCss(cssEl.value, overlay.currentSelector),
          js: jsEl.value,
          selector: overlay.currentSelector
        };
        overlay.style.display = 'none';
        renderWidget(el, widgetDef);
        if (pageId) scheduleAutosave();

      };
      overlay.querySelector('.reset-btn').onclick = () => {
        if (!confirm('Willst du wirklich alle Anpassungen zurücksetzen?')) return;
        const instId = el.dataset.instanceId;
        delete codeMap[instId];
        htmlEl.value = '';
        overlay.querySelector('.editor-css').value = '';
        overlay.querySelector('.editor-js').value = overlay.defaultJs || '';
        overlay.currentSelector = '';
        overlay.updateRender && overlay.updateRender();
        if (pageId) scheduleAutosave();
      };
      overlay.querySelector('.cancel-btn').onclick = () => {
        overlay.style.display = 'none';
      };
    });
    el.appendChild(btn);
    return btn;
  }

  let allWidgets = [];
  try {
    const widgetRes = await meltdownEmit('widget.registry.request.v1', {
      lane: 'public',
      moduleName: 'plainspace',
      moduleType: 'core'
    });
    allWidgets = Array.isArray(widgetRes?.widgets) ? widgetRes.widgets : [];
  } catch (err) {
    console.error('[Builder] failed to load widgets', err);
  }

  sidebarEl.querySelector('.drag-icons').innerHTML = allWidgets.map(w => `
    <div class="sidebar-item drag-widget-icon" draggable="true" data-widget-id="${w.id}">
      ${getWidgetIcon(w)}
      <span class="label">${w.metadata.label}</span>
    </div>
  `).join('');

  sidebarEl.querySelectorAll('.drag-widget-icon').forEach(icon => {
    icon.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', icon.dataset.widgetId);
    });
  });

  contentEl.innerHTML = `<div id="builderGrid" class="canvas-grid builder-grid"></div>`;
  gridEl = document.getElementById('builderGrid');
  const { updateAllWidgetContents } = registerBuilderEvents(gridEl, codeMap, { getRegisteredEditable });
  const saveLayoutCtx = { updateAllWidgetContents, getCurrentLayout, pushState, meltdownEmit, pageId, codeMap };
  await applyBuilderTheme();
  // Allow overlapping widgets for layered layouts
  const grid = initGrid(gridEl, state, selectWidget);
  const { actionBar, select: baseSelectWidget } = createActionBar(null, grid, state, () => scheduleAutosave());
  function scheduleAutosave() {
    scheduleAutosaveFn(state, opts => saveLayout(opts, { ...saveLayoutCtx, ...state }));
  }
  function selectWidget(el) {
    baseSelectWidget(el);
    if (!el) return;
    const editable = getRegisteredEditable(el);
    setActiveElement(editable);
    showToolbar(el);
  }
  grid.on('change', el => {          // jedes Mal, wenn das Grid ein Widget anfasst …
    if (el) selectWidget(el);        // … Action-Bar zeigen
  });
  grid.on("dragstart", () => {
    actionBar.style.display = "none";
  });
  grid.on("resizestart", () => {
    actionBar.style.display = "none";
  });
  grid.on("dragstop", () => {
    if (state.activeWidgetEl) selectWidget(state.activeWidgetEl);
  });
  grid.on("resizestop", () => {
    if (state.activeWidgetEl) selectWidget(state.activeWidgetEl);
  });


  document.addEventListener('click', e => {
    if (!state.activeWidgetEl) return;
    if (
      e.target.closest('.canvas-item') === state.activeWidgetEl ||
      e.target.closest('.widget-action-bar') ||
      e.target.closest('.text-editor-toolbar') ||
      e.target.closest('.color-picker')
    ) {
      return;
    }
    actionBar.style.display = 'none';
    state.activeWidgetEl.classList.remove('selected');
    state.activeWidgetEl = null;
    hideToolbar();
  grid.clearSelection();
  });

  const undoStack = [];
  const redoStack = [];
  const MAX_HISTORY = 50;


  function undo() {
    if (undoStack.length < 2) return;
    const current = undoStack.pop();
    redoStack.push(current);
    const prev = JSON.parse(undoStack[undoStack.length - 1]);
    applyLayout(prev, { gridEl, grid, codeMap, allWidgets, layerIndex: activeLayer });
    if (pageId && autosaveEnabled) scheduleAutosave();
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack.pop();
    undoStack.push(next);
    const layout = JSON.parse(next);
    applyLayout(layout, { gridEl, grid, codeMap, allWidgets, layerIndex: activeLayer });
    if (pageId && autosaveEnabled) scheduleAutosave();
  }

  function startAutosave() {
    startAutosaveFn(state, opts => saveLayout(opts, saveLayoutCtx));
  }

  async function saveCurrentLayout(opts = {}) {
    await saveLayout(opts, { ...saveLayoutCtx, ...state });
  }

  let initialLayout = [];
  let pageData = null;
  if (pageId) {
    try {
      const layoutRes = await meltdownEmit('getLayoutForViewport', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'plainspace',
        moduleType: 'core',
        pageId,
        lane: 'public',
        viewport: 'desktop'
      });
      initialLayout = Array.isArray(layoutRes?.layout) ? layoutRes.layout : [];

      const pageRes = await meltdownEmit('getPageById', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'pagesManager',
        moduleType: 'core',
        pageId
      });
      pageData = pageRes?.data ?? pageRes ?? null;

      try {
        const globalRes = await meltdownEmit('getGlobalLayoutTemplate', {
          jwt: window.ADMIN_TOKEN,
          moduleName: 'plainspace',
          moduleType: 'core'
        });
        layoutLayers[0].layout = Array.isArray(globalRes?.layout) ? globalRes.layout : [];
        globalLayoutName = globalRes?.name || null;
      } catch (err) {
        console.warn('[Builder] failed to load global layout', err);
      }
    } catch (err) {
      console.error('[Builder] load layout or page error', err);
    }
  }
  else {
    try {
      const globalRes = await meltdownEmit('getGlobalLayoutTemplate', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'plainspace',
        moduleType: 'core'
      });
      layoutLayers[0].layout = Array.isArray(globalRes?.layout) ? globalRes.layout : [];
      globalLayoutName = globalRes?.name || null;
    } catch (err) {
      console.warn('[Builder] failed to load global layout', err);
    }
  }

  function attachOptionsMenu(el, widgetDef, editBtn) {
    const menuBtn = document.createElement('button');
    menuBtn.className = 'widget-menu';
    menuBtn.innerHTML = window.featherIcon ? window.featherIcon('more-vertical') :
      '<img src="/assets/icons/more-vertical.svg" alt="menu" />';

    const menu = document.createElement('div');
    menu.className = 'widget-options-menu';
    menu.innerHTML = `
      <button class="menu-edit"><img src="/assets/icons/edit.svg" class="icon" alt="edit" /> Edit Code</button>
      <button class="menu-copy"><img src="/assets/icons/copy.svg" class="icon" alt="duplicate" /> Duplicate</button>
      <button class="menu-template"><img src="/assets/icons/package.svg" class="icon" alt="template" /> Save as Template</button>
      <button class="menu-lock"><img src="/assets/icons/lock.svg" class="icon" alt="lock" /> Lock Position</button>
      <button class="menu-snap"><img src="/assets/icons/grid.svg" class="icon" alt="snap" /> Snap to Grid</button>
      <button class="menu-global"><img src="/assets/icons/globe.svg" class="icon" alt="global" /> Set as Global Widget</button>
      <button class="menu-layer-up"><img src="/assets/icons/arrow-up.svg" class="icon" alt="layer up" /> Layer Up</button>
      <button class="menu-layer-down"><img src="/assets/icons/arrow-down.svg" class="icon" alt="layer down" /> Layer Down</button>
    `;
    menu.style.display = 'none';
    document.body.appendChild(menu);

    function hideMenu() {
      menu.style.display = "none";
      document.removeEventListener("click", outsideHandler);
    }

    function showMenu(triggerEl = menuBtn) {
      updateGlobalBtn();
      menu.style.display = "block";
      menu.style.visibility = "hidden";
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
      menu.style.visibility = "";
      menu.currentTrigger = triggerEl;
      document.addEventListener("click", outsideHandler);
    }

    function outsideHandler(ev) {
      if (!menu.contains(ev.target) && ev.target !== menu.currentTrigger) hideMenu();
    }

    menu.show = showMenu;
    menu.hide = hideMenu;

    menuBtn.addEventListener("click", e => {
      e.stopPropagation();
      if (menu.style.display === "block" && menu.currentTrigger === menuBtn) {
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
      gridEl.appendChild(clone);
      grid.makeWidget(clone);
      attachRemoveButton(clone);
      const cEditBtn = attachEditButton(clone, widgetDef);
      attachOptionsMenu(clone, widgetDef, cEditBtn);
      renderWidget(clone, widgetDef);
      menu.style.display = 'none';
    };
    menu.querySelector('.menu-template').onclick = () => {
      const defaultName = widgetDef.metadata?.label || widgetDef.id;
      const name = prompt('Template name:', defaultName);
      if (!name) { menu.style.display = 'none'; return; }
      let templates = [];
      try { templates = JSON.parse(localStorage.getItem('widgetTemplates') || '[]'); } catch {}
      const data = getItemData(el, codeMap);
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
    menu.querySelector('.menu-lock').onclick = () => {
      const locked = el.getAttribute('gs-locked') === 'true';
      el.setAttribute('gs-locked', (!locked).toString());
      grid.update(el, { locked: !locked, noMove: !locked, noResize: !locked });
      menu.style.display = 'none';
    };
    menu.querySelector('.menu-snap').onclick = () => {
      grid.update(el, {
        x: Math.round(+el.dataset.x || 0),
        y: Math.round(+el.dataset.y || 0),
        w: Math.round(+el.getAttribute('gs-w')),
        h: Math.round(+el.getAttribute('gs-h'))
      });
      if (pageId) scheduleAutosave();
      menu.style.display = 'none';
    };
    const globalBtn = menu.querySelector('.menu-global');
    function updateGlobalBtn() {
      const isGlobal = el.dataset.global === 'true';
      globalBtn.innerHTML = `<img src="/assets/icons/globe.svg" class="icon" alt="global" /> ${isGlobal ? 'Unset Global' : 'Set as Global Widget'}`;
    }
    globalBtn.onclick = () => {
      const isGlobal = el.dataset.global === 'true';
      if (isGlobal) {
        el.dataset.global = 'false';
        const newLocalId = genId();
        el.dataset.instanceId = newLocalId;
        el.id = `widget-${newLocalId}`;
      } else {
        el.dataset.global = 'true';
        el.dataset.instanceId = `global-${widgetDef.id}`;
        el.id = `widget-${el.dataset.instanceId}`;
      }
      updateGlobalBtn();
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

    el.appendChild(menuBtn);
    el.__optionsMenu = menu;
  }

  function attachLockOnClick(el) {
    el.addEventListener('click', e => {
      e.stopPropagation();
      if (state.activeWidgetEl === el) {
        const editable = getRegisteredEditable(el);
        if (editable) {
          editElement(editable, editable.__onSave);
          return;
        }
      }
      selectWidget(el);
    });
  }


  layoutLayers[0].layout = initialLayout;
  applyCompositeLayout(activeLayer);
  pushState(undoStack, redoStack, initialLayout);

  gridEl.addEventListener('dragover',  e => { e.preventDefault(); gridEl.classList.add('drag-over'); });
  gridEl.addEventListener('dragleave', () => gridEl.classList.remove('drag-over'));
  gridEl.addEventListener('drop', async e => {
    e.preventDefault();
    gridEl.classList.remove('drag-over');
    const widgetId = e.dataTransfer.getData('text/plain');
    const widgetDef = allWidgets.find(w => w.id === widgetId);
    if (!widgetDef) return;

    const rect = gridEl.getBoundingClientRect();
    let relX = 0, relY = 0;
    if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
      relX = e.clientX - rect.left;
      relY = e.clientY - rect.top;
    } else if (e.touches && e.touches[0]) {
      relX = e.touches[0].clientX - rect.left;
      relY = e.touches[0].clientY - rect.top;
    } else {
      relX = (e.offsetX || 0) - rect.left;
      relY = (e.offsetY || 0) - rect.top;
    }
    const [x, y, w, h] = [
      Math.floor((relX / rect.width) * 64) || 0,
      Math.floor((relY / rect.height) * DEFAULT_ROWS) || 0,
      8,
      DEFAULT_ROWS
    ];

    const instId = genId();

    const wrapper = document.createElement('div');
    wrapper.classList.add('canvas-item');
    wrapper.id = `widget-${instId}`;
    wrapper.dataset.widgetId = widgetDef.id;
    wrapper.dataset.instanceId = instId;
    wrapper.dataset.global = 'false';
    wrapper.dataset.layer = String(activeLayer);
    wrapper.dataset.x = x;
    wrapper.dataset.y = y;
    wrapper.style.zIndex = '0';
    wrapper.setAttribute('gs-w', w);
    wrapper.setAttribute('gs-h', h);
    wrapper.setAttribute('gs-min-w', 4);
    wrapper.setAttribute('gs-min-h', DEFAULT_ROWS);

    const content = document.createElement('div');
    content.className = 'canvas-item-content builder-themed';
    content.innerHTML = `${getWidgetIcon(widgetDef)}<span>${widgetDef.metadata?.label || widgetDef.id}</span>`;
    wrapper.appendChild(content);
    attachRemoveButton(wrapper);
    const editBtn2 = attachEditButton(wrapper, widgetDef);
    attachOptionsMenu(wrapper, widgetDef, editBtn2);
    attachLockOnClick(wrapper);
    gridEl.appendChild(wrapper);
    grid.makeWidget(wrapper);

    renderWidget(wrapper, widgetDef);
    if (pageId) scheduleAutosave();
  });

  const topBar = document.createElement('header');
  topBar.id = 'builder-header';
  topBar.className = 'builder-header';

  const backBtn = document.createElement('button');
  backBtn.className = 'builder-back-btn';
  backBtn.innerHTML = window.featherIcon ? window.featherIcon('arrow-left') :
    '<img src="/assets/icons/arrow-left.svg" alt="Back" />';
  backBtn.addEventListener('click', () => history.back());
  topBar.appendChild(backBtn);

  let pageSelect = null;
  const layoutName = pageData?.meta?.layoutTemplate || 'default';

  const infoWrap = document.createElement('div');
  infoWrap.className = 'layout-info';

  const nameInput = document.createElement('input');
  nameInput.id = 'layoutNameInput';
  nameInput.className = 'layout-name-input';
  nameInput.placeholder = 'Layout name…';
  nameInput.value = layoutName;
  infoWrap.appendChild(nameInput);

  // Global layout toggle moved to the layout bar

  const editFor = document.createElement('span');
  editFor.textContent = 'editing for';
  infoWrap.appendChild(editFor);

  if (pageData?.title) {
    const pageLink = document.createElement('a');
    pageLink.className = 'page-link';
    pageLink.href = `/admin/pages/edit/${pageId}`;
    pageLink.textContent = pageData.title;
    infoWrap.appendChild(pageLink);
  } else {
    const none = document.createElement('span');
    none.textContent = 'not attached to a page';
    infoWrap.appendChild(none);

    pageSelect = document.createElement('select');
    pageSelect.className = 'page-select';
    pageSelect.multiple = true;
    try {
      const { pages = [] } = await meltdownEmit('getPagesByLane', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'pagesManager',
        moduleType: 'core',
        lane: 'public'
      });
      (Array.isArray(pages) ? pages : []).forEach(p => {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.title;
        pageSelect.appendChild(o);
      });
    } catch (err) {
      console.warn('[Builder] failed to load pages', err);
    }
    infoWrap.appendChild(pageSelect);
  }

  topBar.appendChild(infoWrap);

  const saveBtn = document.createElement('button');
  saveBtn.id = 'saveLayoutBtn';
  saveBtn.className = 'builder-save-btn';
  saveBtn.innerHTML = window.featherIcon ? window.featherIcon('save') :
    '<img src="/assets/icons/save.svg" alt="Save" />';
  topBar.appendChild(saveBtn);

  const previewBtn = document.createElement('button');
  previewBtn.id = 'previewLayoutBtn';
  previewBtn.className = 'builder-preview-btn';
  previewBtn.innerHTML = window.featherIcon ? window.featherIcon('eye') :
    '<img src="/assets/icons/eye.svg" alt="Preview" />';
  topBar.appendChild(previewBtn);

  const headerMenuBtn = document.createElement('button');
  headerMenuBtn.className = 'builder-menu-btn';
  headerMenuBtn.innerHTML = window.featherIcon
    ? window.featherIcon('more-vertical')
    : '<img src="/assets/icons/more-vertical.svg" alt="menu" />';
  topBar.appendChild(headerMenuBtn);

  const headerMenu = document.createElement('div');
  headerMenu.className = 'builder-options-menu';
  headerMenu.innerHTML = `
    <button class="menu-undo"><img src="/assets/icons/rotate-ccw.svg" class="icon" alt="undo" /> Undo</button>
    <button class="menu-redo"><img src="/assets/icons/rotate-cw.svg" class="icon" alt="redo" /> Redo</button>
    <label class="menu-autosave"><input type="checkbox" class="autosave-toggle" checked /> Autosave</label>
    <label class="menu-pro"><input type="checkbox" class="pro-toggle" checked /> Pro Mode</label>
  `;
  headerMenu.style.display = 'none';
  document.body.appendChild(headerMenu);

  function hideHeaderMenu() {
    headerMenu.style.display = 'none';
    document.removeEventListener('click', outsideHeaderHandler);
  }

  function outsideHeaderHandler(e) {
    if (!headerMenu.contains(e.target) && e.target !== headerMenuBtn) hideHeaderMenu();
  }

  headerMenuBtn.addEventListener('click', e => {
    e.stopPropagation();
    if (headerMenu.style.display === 'block') { hideHeaderMenu(); return; }
    headerMenu.style.display = 'block';
    headerMenu.style.visibility = 'hidden';
    const rect = headerMenuBtn.getBoundingClientRect();
    headerMenu.style.top = `${rect.bottom + 4}px`;
    headerMenu.style.left = `${rect.right - headerMenu.offsetWidth}px`;
    headerMenu.style.visibility = '';
    document.addEventListener('click', outsideHeaderHandler);
  });

  headerMenu.querySelector('.menu-undo').addEventListener('click', () => { hideHeaderMenu(); undo(); });
  headerMenu.querySelector('.menu-redo').addEventListener('click', () => { hideHeaderMenu(); redo(); });
  const autosaveToggle = headerMenu.querySelector('.autosave-toggle');
  autosaveToggle.checked = state.autosaveEnabled;
  autosaveToggle.addEventListener('change', () => {
    state.autosaveEnabled = autosaveToggle.checked;
    startAutosaveFn(state, saveLayoutCtx);
  });
  const proToggle = headerMenu.querySelector('.pro-toggle');
  proToggle.checked = proMode;
  proToggle.addEventListener('change', () => {
    proMode = proToggle.checked;
    applyProMode();
  });

  const appScope = document.querySelector('.app-scope');
  if (appScope) {
    appScope.prepend(topBar);
  } else {
    document.body.prepend(topBar);
  }

  startAutosave();
  applyProMode();
  buildLayoutBar();

  saveBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) { alert('Enter a name'); return; }
    updateAllWidgetContents();
    const layout = getCurrentLayout(gridEl, codeMap);
    try {
      await meltdownEmit('saveLayoutTemplate', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'plainspace',
        name,
        lane: 'public',
        viewport: 'desktop',
        layout,
        isGlobal: globalToggle.checked
      });

      const targetIds = pageId
        ? [pageId]
        // Keep IDs as strings so MongoDB ObjectIds are preserved. Postgres
        // automatically casts numeric strings to integers.
        : Array.from(pageSelect?.selectedOptions || []).map(o => o.value);

      const events = targetIds.map(id => ({
        eventName: 'saveLayoutForViewport',
        payload: {
          jwt: window.ADMIN_TOKEN,
          moduleName: 'plainspace',
          moduleType: 'core',
          pageId: id,
          lane: 'public',
          viewport: 'desktop',
          layout
        }
      }));

      await meltdownEmitBatch(events);

      if (globalToggle.checked) {
        await meltdownEmit('setGlobalLayoutTemplate', {
          jwt: window.ADMIN_TOKEN,
          moduleName: 'plainspace',
          moduleType: 'core',
          name
        });
      }

      alert('Layout template saved');
    } catch (err) {
      console.error('[Builder] saveLayoutTemplate error', err);
      alert('Save failed: ' + err.message);
    }
  });

  previewBtn.addEventListener('click', () => {
    const active = document.body.classList.toggle('preview-mode');
    if (window.featherIcon) {
      previewBtn.innerHTML = window.featherIcon(active ? 'eye-off' : 'eye');
    } else {
      const icon = active ? 'eye-off' : 'eye';
      previewBtn.innerHTML = `<img src="/assets/icons/${icon}.svg" alt="Preview" />`;
    }
    if (active) {
      showPreviewHeader();
    } else {
      hidePreviewHeader();
    }
  });

  let versionEl = document.getElementById('builderVersion');
  if (!versionEl) {
    versionEl = document.createElement('div');
    versionEl.id = 'builderVersion';
    versionEl.className = 'builder-version';
    document.body.appendChild(versionEl);
  }

  const builderVersion = window.PLAINSPACE_VERSION;

  if (builderVersion) {
    versionEl.textContent = `${builderVersion} builder still in alpha expect breaking changes`;
  } else {
    versionEl.textContent = 'builder still in alpha expect breaking changes';
  }

  function saveActiveLayer() {
    layoutLayers[activeLayer].layout = getCurrentLayoutForLayer(gridEl, activeLayer, codeMap);
  }

  function updateLayoutBar() {
    if (!layoutBar) return;
    layoutBar.querySelectorAll('button').forEach((btn, idx) => {
      btn.classList.toggle('active', idx === activeLayer);
    });
  }

  function applyCompositeLayout(idx) {
    gridEl.innerHTML = '';
    Object.keys(codeMap).forEach(k => delete codeMap[k]);
    applyLayout(layoutLayers[0].layout, { gridEl, grid, codeMap, allWidgets, append: false, layerIndex: 0 });
    if (idx !== 0) {
      applyLayout(layoutLayers[idx].layout, { gridEl, grid, codeMap, allWidgets, append: true, layerIndex: idx });
    }
  }

  function switchLayer(idx) {
    if (idx === activeLayer) return;
    saveActiveLayer();
    activeLayer = idx;
    applyCompositeLayout(idx);
    updateLayoutBar();
  }

  function buildLayoutBar() {
    layoutBar = document.createElement('div');
    layoutBar.className = 'layout-bar';
    layoutLayers.forEach((layer, idx) => {
      const btn = document.createElement('button');
      btn.textContent = idx === 0 ? 'Global' : `Layer ${idx}`;
      if (idx === activeLayer) btn.classList.add('active');
      btn.addEventListener('click', () => switchLayer(idx));
      layoutBar.appendChild(btn);
    });
    const toggleWrap = document.createElement('label');
    toggleWrap.className = 'layout-global-toggle';
    globalToggle = document.createElement('input');
    globalToggle.type = 'checkbox';
    globalToggle.id = 'layoutIsGlobal';
    globalToggle.className = 'global-layout-toggle';
    if (layoutName === globalLayoutName) globalToggle.checked = true;
    toggleWrap.appendChild(globalToggle);
    toggleWrap.append(' Global');
    layoutBar.appendChild(toggleWrap);
    document.body.appendChild(layoutBar);
  }

