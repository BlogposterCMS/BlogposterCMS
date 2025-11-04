import { initPublishPanel } from './publishPanel.js';
import { initHeaderControls } from './headerControls.js';

async function loadHeaderPartial() {
  try {
    const res = await fetch('/apps/designer/partials/builder-header.html', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    const headerEl = tpl.content.firstElementChild;
    const appScope = document.querySelector('.app-scope');
    if (appScope) appScope.prepend(headerEl); else document.body.prepend(headerEl);
    return headerEl;
  } catch (err) {
    console.warn('[Designer] Failed to load builder-header.html, falling back to JS header shell', err);
    const fallback = document.createElement('header');
    fallback.id = 'builder-header';
    fallback.className = 'builder-header';
    const appScope = document.querySelector('.app-scope');
    if (appScope) appScope.prepend(fallback); else document.body.prepend(fallback);
    return fallback;
  }
}

export function createBuilderHeader({
  initialLayoutName,
  layoutNameParam,
  pageData,
  gridEl,
  viewportSizeEl,
  grid,
  saveDesign,
  getCurrentLayoutForLayer,
  getActiveLayer,
  ensureCodeMap,
  capturePreview,
  updateAllWidgetContents,
  getAdminUserId,
  pageId,
  layoutRoot,
  state,
  startAutosave,
  showPreviewHeader,
  hidePreviewHeader,
  undo,
  redo
}) {
  let topBar = null;
  let layoutName = initialLayoutName;

  async function renderHeader({ reload = false } = {}) {
    try {
      if (reload) {
        const old = document.getElementById('builder-header');
        if (old) {
          const oldInput = old.querySelector('#layoutNameInput');
          if (oldInput) layoutName = oldInput.value;
          old.remove();
        }
      }
      topBar = await loadHeaderPartial();
      const backBtn = topBar.querySelector('.builder-back-btn');
      if (backBtn) backBtn.addEventListener('click', () => {
        try {
          const ref = document.referrer;
          if (ref) {
            const url = new URL(ref, location.href);
            if (url.origin === location.origin && !url.pathname.startsWith('/login')) {
              history.back();
              return;
            }
          }
        } catch (e) { /* ignore malformed referrer */ }
        window.location.href = '/';
      });

      const nameInput = topBar.querySelector('#layoutNameInput');
      if (!layoutName) {
        layoutName = layoutNameParam || pageData?.meta?.layoutTemplate || pageData?.title || nameInput?.placeholder || 'layout-title';
      }
      if (nameInput) {
        try { nameInput.value = layoutName; } catch (_) {}
        nameInput.addEventListener('input', () => {
          layoutName = nameInput.value;
        });
      }

      const headerActions = topBar.querySelector('.header-actions') || topBar;
      const saveBtn = topBar.querySelector('#saveLayoutBtn');
      const previewBtn = topBar.querySelector('#previewLayoutBtn');
      const publishBtn = topBar.querySelector('#publishLayoutBtn');

      const saveWrapper = document.createElement('div');
      saveWrapper.className = 'builder-save-wrapper';
      if (saveBtn) {
        headerActions.insertBefore(saveWrapper, saveBtn);
        saveWrapper.appendChild(saveBtn);
      } else {
        headerActions.appendChild(saveWrapper);
      }

      const saveMenuBtn = document.createElement('button');
      saveMenuBtn.className = 'builder-save-dropdown-toggle';
      saveMenuBtn.innerHTML = window.featherIcon
        ? window.featherIcon('chevron-down')
        : '<img src="/assets/icons/chevron-down.svg" alt="more" />';
      saveWrapper.appendChild(saveMenuBtn);

      const saveDropdown = document.createElement('div');
      saveDropdown.className = 'builder-save-dropdown';
      saveDropdown.innerHTML = '<label class="autosave-option"><input type="checkbox" class="autosave-toggle" checked /> Autosave</label>';
      saveWrapper.appendChild(saveDropdown);

      initHeaderControls(topBar, gridEl, viewportSizeEl, grid, {
        undo,
        redo
      });

      saveMenuBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (saveDropdown.style.display === 'block') { hideSaveDropdown(); return; }
        saveDropdown.style.display = 'block';
        document.addEventListener('click', outsideSaveHandler);
      });

      function hideSaveDropdown() {
        saveDropdown.style.display = 'none';
        document.removeEventListener('click', outsideSaveHandler);
      }

      function outsideSaveHandler(e) {
        if (!saveWrapper.contains(e.target)) hideSaveDropdown();
      }

      const autosaveToggle = saveDropdown.querySelector('.autosave-toggle');
      autosaveToggle.checked = state.autosaveEnabled;
      autosaveToggle.addEventListener('change', () => {
        state.autosaveEnabled = autosaveToggle.checked;
        startAutosave();
      });

      startAutosave();

      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          try {
            await saveDesign({
              name: nameInput?.value?.trim() || layoutName,
              gridEl,
              layoutRoot,
              getCurrentLayoutForLayer,
              getActiveLayer,
              ensureCodeMap,
              capturePreview,
              updateAllWidgetContents,
              ownerId: getAdminUserId(),
              pageId,
              isLayout: getActiveLayer() === 0,
              isGlobal: getActiveLayer() === 0
            });
            alert(getActiveLayer() === 0 ? 'Layout template saved' : 'Design saved');
          } catch (err) {
            alert('Save failed: ' + err.message);
          }
        });
      }

      if (previewBtn) {
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
      }

      if (getActiveLayer() === 0 && publishBtn) {
        publishBtn.remove();
      } else if (publishBtn) {
        initPublishPanel({
          publishBtn,
          nameInput,
          gridEl,
          layoutRoot,
          updateAllWidgetContents,
          getAdminUserId,
          getCurrentLayoutForLayer,
          getActiveLayer,
          ensureCodeMap,
          capturePreview,
          pageId,
          saveDesign
        });
      }
    } catch (err) {
      console.error('[Designer] failed to render header', err);
    }
  }

  return {
    renderHeader,
    getLayoutName: () => layoutName,
    setLayoutName: value => { layoutName = value; },
    getTopBar: () => topBar
  };
}
