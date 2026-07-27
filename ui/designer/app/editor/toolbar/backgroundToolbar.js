import { state } from '../core/editor.js';
import { showBuilderPanel, hideBuilderPanel } from '../../managers/panelManager.js';

const MODE_SEQUENCE = ['free', 'auto', 'grid'];
const MODE_PRESENTATION = {
  free: {
    icon: 'mouse-pointer-2',
    label: 'Free placement'
  },
  auto: {
    icon: 'rows-3',
    label: 'Auto layout'
  },
  grid: {
    icon: 'grid-3x3',
    label: 'Grid'
  }
};

let toolbarsVisible = false;
let visibleSection = null;
let lastColorButton = null;

function sectionMode(section) {
  const mode = section?.dataset?.layoutMode || 'free';
  return mode === 'stack' || mode === 'row' ? 'auto' : (
    MODE_SEQUENCE.includes(mode) ? mode : 'free'
  );
}

function nextSectionMode(section) {
  const current = sectionMode(section);
  const index = MODE_SEQUENCE.indexOf(current);
  const next = MODE_SEQUENCE[(index + 1) % MODE_SEQUENCE.length];
  if (next !== 'auto') return next;
  return section.dataset.layoutAutoDirection === 'horizontal' ? 'row' : 'stack';
}

function notifyBackgroundChange(section) {
  section?.dispatchEvent(new CustomEvent('designerSectionBackgroundChanged', {
    bubbles: true,
    detail: {
      background: section.dataset.sectionBackground || 'transparent',
      backgroundImageUrl: section.dataset.bgImageUrl || '',
      backgroundImageId: section.dataset.bgImageId || ''
    }
  }));
  section?.dispatchEvent(new CustomEvent('designerContentChanged', { bubbles: true }));
}

function notifyModeChange(section, mode) {
  section?.dispatchEvent(new CustomEvent('designerSectionModeRequested', {
    bubbles: true,
    detail: { mode }
  }));
}

function closeColorPanel({ focus = true } = {}) {
  hideBuilderPanel();
  state.colorPicker?.el?.classList.add('hidden');
  if (focus) {
    try {
      lastColorButton?.focus();
    } catch {
      // Focus restoration is optional when the owning Section was removed.
    }
  }
}

async function openColorPanel() {
  const panelContainer = document.getElementById('builderPanel');
  if (!panelContainer) return false;
  let colorPanel = panelContainer.querySelector('.color-panel');
  if (!colorPanel) {
    try {
      const mod = await import('../../fetchPartial.js');
      const { sanitizeHtml } = await import('/ui/shared/sanitize/sanitizer.js');
      const html = await mod.fetchPartial('color-panel', 'builder');
      panelContainer.insertAdjacentHTML('beforeend', sanitizeHtml(html));
      colorPanel = panelContainer.querySelector('.color-panel');
    } catch (error) {
      console.warn('[BackgroundToolbar] DESIGNER_SECTION_COLOR_PANEL_LOAD_FAILED', error);
      return false;
    }
  }

  const heading = colorPanel.querySelector('h4');
  if (heading) heading.textContent = 'Section background color';
  showBuilderPanel('color-panel');
  const host = colorPanel.querySelector('.color-panel-content') || colorPanel;
  if (state.colorPicker.el.parentElement !== host) host.appendChild(state.colorPicker.el);
  state.colorPicker.el.classList.remove('hidden', 'floating');
  state.colorPicker.el.style.position = '';
  state.colorPicker.el.style.left = '';
  state.colorPicker.el.style.top = '';
  const collapseButton = colorPanel.querySelector('.collapse-btn');
  if (collapseButton && !collapseButton.__sectionBackgroundBound) {
    collapseButton.__sectionBackgroundBound = true;
    collapseButton.addEventListener('click', () => closeColorPanel());
  }
  return true;
}

function toolbarButton(className, title, iconName) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `tb-btn ${className}`;
  button.title = title;
  button.setAttribute('aria-label', title);
  button.innerHTML = `<img src="/assets/icons/${iconName}.svg" alt="" class="icon" />`;
  return button;
}

function syncModeButton(section, button) {
  if (!button) return;
  const presentation = MODE_PRESENTATION[sectionMode(section)];
  button.title = `${presentation.label} · click to change`;
  button.setAttribute('aria-label', button.title);
  button.dataset.sectionMode = sectionMode(section);
  const icon = button.querySelector('img');
  if (icon) icon.src = `/assets/icons/${presentation.icon}.svg`;
}

function createSectionToolbar(section) {
  const toolbar = document.createElement('div');
  toolbar.className = 'bg-editor-toolbar layout-section-toolbar';
  toolbar.dataset.sectionToolbar = section.dataset.sectionId || '';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', `${section.dataset.sectionTitle || 'Section'} controls`);
  toolbar.style.display = 'none';

  const modeButton = toolbarButton('section-mode-cycle', 'Free placement · click to change', 'mouse-pointer-2');
  syncModeButton(section, modeButton);
  modeButton.addEventListener('click', event => {
    event.stopPropagation();
    notifyModeChange(section, nextSectionMode(section));
    syncModeButton(section, modeButton);
  });

  const colorButton = toolbarButton('section-background-color', 'Background color', 'type');
  colorButton.replaceChildren();
  const colorIcon = document.createElement('span');
  colorIcon.className = 'color-icon';
  colorIcon.textContent = 'A';
  const currentBackground = section.style.backgroundColor ||
    getComputedStyle(section).backgroundColor ||
    '#ffffff';
  colorIcon.style.textDecorationColor = currentBackground;
  colorButton.appendChild(colorIcon);
  colorButton.addEventListener('click', async event => {
    event.stopPropagation();
    lastColorButton = colorButton;
    const currentColor = section.style.backgroundColor ||
      getComputedStyle(section).backgroundColor ||
      '#ffffff';
    state.colorPicker.updateOptions({
      initialColor: currentColor,
      onSelect: color => {
        section.style.backgroundImage = '';
        delete section.dataset.bgImageId;
        delete section.dataset.bgImageUrl;
        section.style.backgroundColor = color;
        section.dataset.layoutBackground = color;
        section.dataset.sectionBackground = color;
        colorIcon.style.textDecorationColor = color;
        notifyBackgroundChange(section);
      },
      onClose: () => closeColorPanel()
    });

    const panel = document.getElementById('builderPanel');
    const colorPanel = panel?.querySelector('.color-panel');
    const panelVisible = Boolean(
      colorPanel &&
      colorPanel.style.display !== 'none' &&
      panel && !panel.classList.contains('hidden') &&
      !state.colorPicker.el.classList.contains('hidden')
    );
    if (panelVisible) {
      closeColorPanel();
      return;
    }
    if (!(await openColorPanel())) {
      if (!document.body.contains(state.colorPicker.el)) {
        state.colorPicker.el.classList.add('floating');
        document.body.appendChild(state.colorPicker.el);
      }
      const bounds = colorButton.getBoundingClientRect();
      state.colorPicker.showAt(bounds.left + window.scrollX, bounds.bottom + window.scrollY);
    }
  });

  const imageButton = toolbarButton('section-background-image', 'Background image', 'image');
  imageButton.addEventListener('click', async event => {
    event.stopPropagation();
    try {
      const { shareURL, objectId } = await window.meltdownEmit('openMediaExplorer', {
        jwt: window.ADMIN_TOKEN
      });
      if (!shareURL) return;
      const safeUrl = String(shareURL).replace(/"/g, '&quot;');
      section.style.backgroundImage = `url("${safeUrl}")`;
      section.style.backgroundSize = 'cover';
      section.style.backgroundRepeat = 'no-repeat';
      section.style.backgroundPosition = 'center';
      if (objectId) section.dataset.bgImageId = objectId;
      section.dataset.bgImageUrl = shareURL;
      notifyBackgroundChange(section);
    } catch (error) {
      console.error('[BackgroundToolbar] DESIGNER_SECTION_MEDIA_PICK_FAILED', error);
    }
  });

  const clearButton = toolbarButton('section-background-clear', 'Reset background', 'x');
  clearButton.addEventListener('click', event => {
    event.stopPropagation();
    section.style.backgroundImage = '';
    section.style.backgroundColor = '';
    delete section.dataset.bgImageId;
    delete section.dataset.bgImageUrl;
    delete section.dataset.layoutBackground;
    delete section.dataset.sectionBackground;
    notifyBackgroundChange(section);
  });

  const deleteButton = toolbarButton('section-delete', 'Delete section', 'trash-2');

  toolbar.addEventListener('pointerdown', event => {
    event.stopPropagation();
  }, true);
  toolbar.append(modeButton, colorButton, imageButton, clearButton, deleteButton);
  section.prepend(toolbar);
  return toolbar;
}

export function refreshBackgroundToolbars(layoutRoot = document.getElementById('layoutRoot')) {
  if (!layoutRoot) return [];
  const sections = Array.from(
    layoutRoot.querySelectorAll(':scope > .layout-section[data-section-id]')
  );
  sections.forEach(section => {
    const toolbar = section.querySelector(':scope > .layout-section-toolbar') ||
      createSectionToolbar(section);
    syncModeButton(section, toolbar.querySelector('.section-mode-cycle'));
    const deleteButton = toolbar.querySelector('.section-delete');
    if (deleteButton) {
      const canDelete = sections.length > 1;
      deleteButton.disabled = !canDelete;
      deleteButton.title = canDelete
        ? 'Delete section'
        : 'The last section cannot be deleted';
      deleteButton.setAttribute('aria-label', deleteButton.title);
    }
    const selected = toolbarsVisible && (
      section === visibleSection ||
      (!visibleSection && section.classList.contains('layout-section--active'))
    );
    toolbar.style.display = selected ? 'flex' : 'none';
  });
  return sections;
}

export function initBackgroundToolbar() {
  state.colorPicker?.el?.classList.add('hidden');
  refreshBackgroundToolbars();
}

export function showBackgroundToolbar(section = null) {
  toolbarsVisible = true;
  visibleSection = section?.closest?.('.layout-section[data-section-id]') ||
    document.querySelector('#layoutRoot > .layout-section.layout-section--active') ||
    document.querySelector('#layoutRoot > .layout-section');
  refreshBackgroundToolbars();
}

export function hideBackgroundToolbar() {
  toolbarsVisible = false;
  visibleSection = null;
  document.querySelectorAll('.layout-section-toolbar').forEach(toolbar => {
    toolbar.style.display = 'none';
  });
  try {
    state.colorPicker?.hide?.();
  } catch {
    // The picker may not be initialized during early Designer bootstrap.
  }
}

export function isBackgroundToolbar(element) {
  return Boolean(element?.closest?.('.bg-editor-toolbar'));
}
