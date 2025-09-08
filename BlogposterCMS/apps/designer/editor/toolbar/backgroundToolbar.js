import { state } from '../core/editor.js';
import { showBuilderPanel, hideBuilderPanel } from '../../managers/panelManager.js';
import { designerState } from '../../managers/designerState.js';

let bgToolbar = null;
let listenersAttached = false;
const BGLOG = (...args) => { try { console.log('[BG/TB]', ...args); } catch (_) {} };

function getGridEl() {
  return document.getElementById('builderGrid');
}

function getLayoutRootEl() {
  return document.getElementById('layoutRoot');
}

function updateToolbarPosition() {
  if (!bgToolbar) return;
  const header = document.querySelector('.builder-header');
  if (!header) return;
  const rect = header.getBoundingClientRect();
  bgToolbar.style.top = rect.bottom + 'px';
  bgToolbar.style.left = '';
}

function ensureListeners() {
  if (listenersAttached) return;
  window.addEventListener('scroll', updateToolbarPosition);
  window.addEventListener('resize', updateToolbarPosition);
  listenersAttached = true;
}

function removeListeners() {
  if (!listenersAttached) return;
  window.removeEventListener('scroll', updateToolbarPosition);
  window.removeEventListener('resize', updateToolbarPosition);
  listenersAttached = false;
}

export function initBackgroundToolbar() {
  if (bgToolbar) return;
  bgToolbar = document.createElement('div');
  bgToolbar.className = 'bg-editor-toolbar';
  bgToolbar.style.display = 'none';
  BGLOG('init toolbar');

  // Color button
  const colorBtn = document.createElement('button');
  colorBtn.type = 'button';
  colorBtn.className = 'tb-btn';
  colorBtn.title = 'Background color';
  // Use same visual language: underlined A with current color
  const colorIcon = document.createElement('span');
  colorIcon.className = 'color-icon';
  colorIcon.textContent = 'A';
  colorIcon.style.textDecoration = 'underline';
  colorIcon.style.textDecorationThickness = '3px';
  colorIcon.style.textUnderlineOffset = '2px';
  const currentBg = getComputedStyle(getGridEl() || document.body).backgroundColor;
  colorIcon.style.textDecorationColor = currentBg || '#ffffff';
  colorBtn.appendChild(colorIcon);

  // Image button
  const imageBtn = document.createElement('button');
  imageBtn.type = 'button';
  imageBtn.className = 'tb-btn';
  imageBtn.title = 'Background image';
  try {
    imageBtn.innerHTML = window.featherIcon ? window.featherIcon('image') : '<img src="/assets/icons/image.svg" alt="Image" />';
  } catch (e) {
    imageBtn.textContent = 'Image';
  }

  // Optional: clear button
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'tb-btn';
  clearBtn.title = 'Reset background';
  try {
    clearBtn.innerHTML = window.featherIcon ? window.featherIcon('x') : '<img src="/assets/icons/x.svg" alt="Clear" />';
  } catch (e) {
    clearBtn.textContent = 'Clear';
  }

  // Layout button
  const layoutBtn = document.createElement('button');
  layoutBtn.type = 'button';
  layoutBtn.className = 'tb-btn';
  layoutBtn.title = 'Split layout';
  try {
    layoutBtn.innerHTML = window.featherIcon
      ? window.featherIcon('square-split-vertical')
      : '<img src="/assets/icons/square-split-vertical.svg" alt="Split" />';
  } catch (e) {
    layoutBtn.textContent = 'Split';
  }

    layoutBtn.addEventListener('click', ev => {
      ev.stopPropagation();
      const workspace = getLayoutRootEl();
      document.dispatchEvent(
        new CustomEvent('designer.openLayoutPanel', {
          detail: {
            rootEl: workspace,
            onChange: () => {
              try { designerState.pendingSave = true; } catch (e) {}
              try {
                const root = getLayoutRootEl();
                const grid = getGridEl();
                if (root && grid) {
                  const wa = root.querySelector('.layout-container[data-workarea="true"]') || root;
                  if (grid.parentNode !== wa) wa.appendChild(grid);
                }
              } catch (_) {}
            }
          }
        })
      );
    });

  // Ensure global color picker starts hidden for background use
  state.colorPicker?.el?.classList.add('hidden');

  async function openColorPanel() {
    const panelContainer = document.getElementById('builderPanel');
    if (!panelContainer) return false;
    let colorPanel = panelContainer.querySelector('.color-panel');
    if (!colorPanel) {
      try {
        const mod = await import('../../fetchPartial.js');
        const { sanitizeHtml } = await import('../../../../public/plainspace/sanitizer.js');
        const html = await mod.fetchPartial('color-panel', 'builder');
        panelContainer.insertAdjacentHTML('beforeend', sanitizeHtml(html));
        colorPanel = panelContainer.querySelector('.color-panel');
      } catch (e) {
        console.warn('[BackgroundToolbar] Failed to fetch color panel:', e);
        return false;
      }
    }
    // Update title to reflect background context (non-destructive for text flow)
    const h4 = colorPanel.querySelector('h4');
    if (h4) h4.textContent = 'Background color';

    showBuilderPanel('color-panel');
    const host = colorPanel.querySelector('.color-panel-content') || colorPanel;
    if (state.colorPicker.el.parentElement !== host) host.appendChild(state.colorPicker.el);
    state.colorPicker.el.classList.remove('hidden');
    state.colorPicker.el.classList.remove('floating');
    state.colorPicker.el.style.position = '';
    state.colorPicker.el.style.left = '';
    state.colorPicker.el.style.top = '';
    const collapseBtn = colorPanel.querySelector('.collapse-btn');
    if (collapseBtn && !collapseBtn.__bgBound) {
      collapseBtn.__bgBound = true;
      collapseBtn.addEventListener('click', () => closeColorPanel());
    }
    return true;
  }

  function closeColorPanel() {
    hideBuilderPanel();
    state.colorPicker.el.classList.add('hidden');
    try { colorBtn.focus(); } catch (e) {}
  }

  colorBtn.addEventListener('click', async ev => {
    ev.stopPropagation();
    const grid = getGridEl();
    const currentBg = getComputedStyle(grid || document.body).backgroundColor;
    state.colorPicker.updateOptions({
      initialColor: currentBg || '#ffffff',
      onSelect: c => {
        const g = getGridEl();
        if (!g) return;
        g.style.backgroundImage = '';
        delete g.dataset.bgImageId;
        delete g.dataset.bgImageUrl;
        designerState.bgMediaId = '';
        designerState.bgMediaUrl = '';
        g.style.backgroundColor = c;
        colorIcon.style.textDecorationColor = c;
      },
      onClose: () => closeColorPanel()
    });
    const panelContainer = document.getElementById('builderPanel');
    const colorPanel = panelContainer?.querySelector('.color-panel');
    const colorPanelVisible = !!(
      colorPanel &&
      colorPanel.style.display !== 'none' &&
      panelContainer && !panelContainer.classList.contains('hidden') &&
      !state.colorPicker.el.classList.contains('hidden')
    );
    if (colorPanelVisible) { closeColorPanel(); return; }
    if (!(await openColorPanel())) {
      if (!document.body.contains(state.colorPicker.el)) {
        state.colorPicker.el.classList.add('floating');
        document.body.appendChild(state.colorPicker.el);
      }
      if (state.colorPicker.el.classList.contains('hidden')) {
        const rect = colorBtn.getBoundingClientRect();
        state.colorPicker.showAt(rect.left + window.scrollX, rect.bottom + window.scrollY);
      } else {
        state.colorPicker.hide();
      }
    }
  });

  imageBtn.addEventListener('click', async ev => {
    ev.stopPropagation();
    try {
      const { shareURL, objectId } = await window.meltdownEmit('openMediaExplorer', { jwt: window.ADMIN_TOKEN });
      if (shareURL) {
        const grid = getGridEl();
        if (!grid) return;
        const safeUrl = String(shareURL).replace(/"/g, '&quot;');
        grid.style.backgroundImage = `url("${safeUrl}")`;
        grid.style.backgroundSize = 'cover';
        grid.style.backgroundRepeat = 'no-repeat';
        grid.style.backgroundPosition = 'center';
        if (objectId) grid.dataset.bgImageId = objectId;
        grid.dataset.bgImageUrl = shareURL;
        designerState.bgMediaId = objectId || '';
        designerState.bgMediaUrl = shareURL || '';
      }
    } catch (err) {
      console.error('[BackgroundToolbar] openMediaExplorer error', err);
    }
  });

  clearBtn.addEventListener('click', ev => {
    ev.stopPropagation();
    const grid = getGridEl();
    if (!grid) return;
    grid.style.backgroundImage = '';
    grid.style.backgroundColor = '';
    delete grid.dataset.bgImageId;
    delete grid.dataset.bgImageUrl;
    designerState.bgMediaId = '';
    designerState.bgMediaUrl = '';
  });

  // Prevent background clicks from deselecting while interacting with toolbar
  bgToolbar.addEventListener('pointerdown', ev => {
    ev.stopPropagation();
  }, true);

  bgToolbar.appendChild(colorBtn);
  bgToolbar.appendChild(imageBtn);
  bgToolbar.appendChild(layoutBtn);
  bgToolbar.appendChild(clearBtn);

  document.body.prepend(bgToolbar);
  BGLOG('toolbar appended to body');
}

export function showBackgroundToolbar() {
  if (!bgToolbar) initBackgroundToolbar();
  updateToolbarPosition();
  ensureListeners();
  bgToolbar.style.display = 'flex';
  BGLOG('show toolbar');
}

export function hideBackgroundToolbar() {
  if (!bgToolbar) return;
  bgToolbar.style.display = 'none';
  removeListeners();
  try { state.colorPicker?.hide?.(); } catch (_) {}
  BGLOG('hide toolbar');
}

export function isBackgroundToolbar(el) {
  return !!(el && (el === bgToolbar || el.closest?.('.bg-editor-toolbar')));
}
