import { state } from '../core/editor.js';

let bgToolbar = null;
let listenersAttached = false;
const BGLOG = (...args) => { try { console.log('[BG/TB]', ...args); } catch (_) {} };

function getGridEl() {
  return document.getElementById('builderGrid');
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
  colorBtn.title = 'Hintergrundfarbe';
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
  imageBtn.title = 'Hintergrundbild';
  try {
    imageBtn.innerHTML = window.featherIcon ? window.featherIcon('image') : '<img src="/assets/icons/image.svg" alt="Bild" />';
  } catch (e) {
    imageBtn.textContent = 'Bild';
  }

  // Optional: clear button
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'tb-btn';
  clearBtn.title = 'Hintergrund zurücksetzen';
  try {
    clearBtn.innerHTML = window.featherIcon ? window.featherIcon('x') : '<img src="/assets/icons/x.svg" alt="Clear" />';
  } catch (e) {
    clearBtn.textContent = 'Clear';
  }

  // Ensure global color picker starts hidden for background use
  state.colorPicker?.el?.classList.add('hidden');

  async function openColorPanel() {
    const sidebar = document.getElementById('sidebar');
    const panelContainer = sidebar?.querySelector('#builderPanel');
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
    if (h4) h4.textContent = 'Hintergrundfarbe';

    panelContainer.querySelectorAll('.builder-panel').forEach(p => {
      p.style.display = p.classList.contains('color-panel') ? '' : 'none';
    });
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
    document.body.classList.add('panel-open', 'panel-opening');
    setTimeout(() => document.body.classList.remove('panel-opening'), 200);
    return true;
  }

  function closeColorPanel() {
    const sidebar = document.getElementById('sidebar');
    const panelContainer = sidebar?.querySelector('#builderPanel');
    panelContainer?.querySelectorAll('.builder-panel').forEach(p => {
      if (p.classList.contains('color-panel')) {
        p.style.display = 'none';
      } else {
        p.style.display = '';
      }
    });
    state.colorPicker.hide();
    document.body.classList.add('panel-closing');
    document.body.classList.remove('panel-open');
    setTimeout(() => document.body.classList.remove('panel-closing'), 200);
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
        g.style.backgroundColor = c;
        colorIcon.style.textDecorationColor = c;
      },
      onClose: () => colorBtn.focus(),
      hideCloseButton: true
    });
    const sidebar = document.getElementById('sidebar');
    const panelContainer = sidebar?.querySelector('#builderPanel');
    const colorPanel = panelContainer?.querySelector('.color-panel');
    const colorPanelVisible = !!(
      colorPanel &&
      colorPanel.style.display !== 'none' &&
      document.body.classList.contains('panel-open') &&
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
      const { shareURL } = await window.meltdownEmit('openMediaExplorer', { jwt: window.ADMIN_TOKEN });
      if (shareURL) {
        const grid = getGridEl();
        if (!grid) return;
        const safeUrl = String(shareURL).replace(/"/g, '&quot;');
        grid.style.backgroundImage = `url("${safeUrl}")`;
        grid.style.backgroundSize = 'cover';
        grid.style.backgroundRepeat = 'no-repeat';
        grid.style.backgroundPosition = 'center';
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
  });

  // Prevent background clicks from deselecting while interacting with toolbar
  bgToolbar.addEventListener('pointerdown', ev => {
    ev.stopPropagation();
  }, true);

  bgToolbar.appendChild(colorBtn);
  bgToolbar.appendChild(imageBtn);
  bgToolbar.appendChild(clearBtn);

  const content = document.getElementById('content');
  if (content) { content.prepend(bgToolbar); BGLOG('toolbar appended to #content'); }
  else { document.body.appendChild(bgToolbar); BGLOG('toolbar appended to body'); }
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
