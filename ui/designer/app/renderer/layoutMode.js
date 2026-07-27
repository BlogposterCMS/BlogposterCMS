import { STRINGS } from '../i18n.js';
import { fetchPartial } from '../fetchPartial.js';
import { sanitizeHtml } from '/ui/shared/sanitize/sanitizer.js';
import { bpDialog } from '/ui/shared/dialogs/bpDialog.js';
import { getWidgetIcon } from './renderUtils.js';
import {
  applySitePreset,
  createSitePreset,
  deleteSitePreset,
  getSitePresetsSnapshot,
  subscribeSitePresets
} from '/ui/shared/presets/sitePresets.js';
import {
  getActiveColorScheme,
  refreshColorLibrary
} from '/ui/shared/colors/colorLibrary.js';
import {
  getActiveFontPackage,
  refreshFontPackages
} from '/ui/shared/fonts/fontPackages.js';

let widgetsPanelTemplate = '';
let layoutPanelHtml = null;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch] || ch));
}

function iconMarkup(icon) {
  const name = String(icon || 'square').replace(/[^a-z0-9_-]/gi, '');
  return `<img src="/assets/icons/${escapeHtml(name)}.svg" alt="" class="icon" />`;
}

function widgetAvailable(allWidgets, widgetId) {
  return !widgetId || allWidgets.some(widget => widget.id === widgetId);
}

function nativeAvailable(allWidgets, item) {
  if (!item?.nativeType) return true;
  if (item.nativeType === 'background') return true;
  if (!Array.isArray(item.preferredWidgetIds)) return true;
  return item.preferredWidgetIds.some(id => widgetAvailable(allWidgets, id));
}

function presetAvailable(allWidgets, preset) {
  return widgetAvailable(allWidgets, preset.widgetId) && nativeAvailable(allWidgets, preset);
}

function renderInsertGroups(sidebarEl, insertToolItems, allWidgets = []) {
  const groupWrap = sidebarEl.querySelector('.scene-native-elements');
  const panelWrap = sidebarEl.querySelector('.scene-insert-panels');
  if (!groupWrap || !panelWrap || !Array.isArray(insertToolItems)) return;

  const groups = insertToolItems
    .map(item => ({
      ...item,
      presets: (item.presets || []).filter(preset => presetAvailable(allWidgets, preset))
    }))
    .filter(item => item.presets.length || item.nativeType);

  groupWrap.innerHTML = groups.map(item => `
    <button
      type="button"
      class="scene-native-element scene-insert-group"
      data-insert-group="${escapeHtml(item.id)}"
      aria-label="${escapeHtml(item.title)}"
      aria-haspopup="dialog"
      aria-controls="sceneInsertPanel-${escapeHtml(item.id)}"
      aria-expanded="false"
      title="${escapeHtml(item.title)}"
    >
      ${iconMarkup(item.icon)}
      <span class="scene-widget-rail-label">${escapeHtml(item.title)}</span>
    </button>
  `).join('');

  panelWrap.innerHTML = groups.map(item => `
    <section
      id="sceneInsertPanel-${escapeHtml(item.id)}"
      class="scene-insert-panel"
      data-insert-group-panel="${escapeHtml(item.id)}"
      role="group"
      aria-label="${escapeHtml(item.title)} presets"
      hidden
    >
      <div class="scene-insert-panel-head">
        ${iconMarkup(item.icon)}
        <strong>${escapeHtml(item.title)}</strong>
      </div>
      <div class="scene-insert-preset-list">
        ${item.presets.map(preset => `
          <button
            type="button"
            class="scene-insert-preset"
            data-insert-preset="${escapeHtml(preset.id)}"
            ${preset.nativeType ? `data-native-element="${escapeHtml(preset.nativeType)}"` : ''}
            ${preset.widgetId ? `data-widget-id="${escapeHtml(preset.widgetId)}"` : ''}
            draggable="true"
            title="${escapeHtml(preset.title)}"
          >
            ${iconMarkup(preset.icon || item.icon)}
            <span>${escapeHtml(preset.title)}</span>
          </button>
        `).join('')}
      </div>
    </section>
  `).join('');
}

export function initLayoutMode(sidebarEl) {
  widgetsPanelTemplate = sidebarEl.innerHTML;
}

export function populateWidgetsPanel(sidebarEl, allWidgets, iconMap = {}, switchToLayout, insertToolItems = []) {
  sidebarEl.innerHTML = widgetsPanelTemplate;
  renderInsertGroups(sidebarEl, insertToolItems, allWidgets);
  const dragWrap = sidebarEl.querySelector('.drag-icons');
  if (dragWrap) {
    const hasGroupedInsertPanel = Boolean(sidebarEl.querySelector('.scene-insert-panels'));
    const visibleWidgets = hasGroupedInsertPanel
      ? []
      : allWidgets.filter(w => !w.metadata?.hiddenFromCatalog);
    dragWrap.innerHTML = visibleWidgets.map(w => `
    <div class="sidebar-item drag-widget-icon" draggable="true" data-widget-id="${w.id}" title="${w.metadata.label}">
      ${getWidgetIcon(w, iconMap)}
      <span class="label">${w.metadata.label}</span>
    </div>
  `).join('');

    if (typeof switchToLayout === 'function' && !sidebarEl.querySelector('[data-sidebar-panel-target="layout"]')) {
      const layoutSwitcher = document.createElement('div');
      layoutSwitcher.className = 'sidebar-item layout-switcher';
      layoutSwitcher.innerHTML = `${window.featherIcon ? window.featherIcon('panels-top-left') : ''}<span class="label">${STRINGS.layoutEditor}</span>`;
      layoutSwitcher.setAttribute('draggable', 'false');
      layoutSwitcher.addEventListener('click', switchToLayout);
      dragWrap.prepend(layoutSwitcher);
    }

    dragWrap.querySelectorAll('.drag-widget-icon').forEach(icon => {
      icon.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', icon.dataset.widgetId);
      });
    });
  }
}

async function showLayoutPanel(sidebarEl) {
  if (!layoutPanelHtml) {
    try {
      layoutPanelHtml = sanitizeHtml(await fetchPartial('layout-panel'));
    } catch {
      layoutPanelHtml = '<nav class="sidebar-nav layout-panel"></nav>';
    }
  }
  const layoutHost = sidebarEl.querySelector('.layout-panel-host');
  if (layoutHost && !layoutHost.querySelector('.layout-panel')) {
    layoutHost.innerHTML = layoutPanelHtml;
  } else if (!layoutHost) {
    sidebarEl.innerHTML = layoutPanelHtml;
  }
  const targetEl = layoutHost || sidebarEl;
  const titleEl = targetEl.querySelector('.layout-panel-title');
  if (titleEl) titleEl.textContent = STRINGS.layoutPanelTitle;
  const soonEl = targetEl.querySelector('.layout-panel-coming-soon');
  if (soonEl) soonEl.textContent = STRINGS.layoutPanelComingSoon;
  const arrangeText = targetEl.querySelector('.arrange-label-text');
  if (arrangeText) arrangeText.textContent = STRINGS.arrangeMode;
}

function sitePresetError(host, error) {
  const node = host.querySelector('[data-site-preset-error]');
  if (!node) return;
  node.textContent = error instanceof Error ? error.message : String(error || 'Unable to update Site Presets.');
  node.hidden = false;
}

function mountSitePresetsPanel(ctx) {
  const host = ctx.sidebarEl.querySelector('[data-site-presets-host]');
  if (!host) return;
  ctx.cleanupSitePresetsPanel?.();
  let selectedPresetId = getSitePresetsSnapshot().lastAppliedId
    || getSitePresetsSnapshot().presets[0]?.id
    || '';
  let selectedDemoId = '';

  const render = () => {
    const library = getSitePresetsSnapshot();
    const preset = library.presets.find(entry => entry.id === selectedPresetId)
      || library.presets[0]
      || null;
    host.replaceChildren();

    const heading = document.createElement('h4');
    heading.textContent = 'Site preset';
    host.appendChild(heading);
    if (!preset) {
      const empty = document.createElement('p');
      empty.className = 'style-library-intro';
      empty.textContent = 'No Site Preset is available.';
      host.appendChild(empty);
      return;
    }
    selectedPresetId = preset.id;
    const selectedDemo = (preset.pageDemos || []).find(demo => demo.id === selectedDemoId)
      || preset.pageDemos?.[0]
      || null;
    selectedDemoId = selectedDemo?.id || '';

    const presetSelect = document.createElement('select');
    presetSelect.setAttribute('aria-label', 'Site preset');
    library.presets.forEach(entry => {
      const option = document.createElement('option');
      option.value = entry.id;
      option.textContent = entry.name;
      option.selected = entry.id === preset.id;
      presetSelect.appendChild(option);
    });

    const applyButton = document.createElement('button');
    applyButton.type = 'button';
    applyButton.className = 'font-package-action font-package-action--primary';
    applyButton.textContent = 'Apply';
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'font-package-action font-package-action--danger';
    deleteButton.textContent = 'Delete';
    deleteButton.disabled = preset.source !== 'user';
    const presetActions = document.createElement('div');
    presetActions.className = 'font-package-actions';
    presetActions.append(applyButton, deleteButton);

    const demoSelect = document.createElement('select');
    demoSelect.setAttribute('aria-label', 'Page demo');
    (preset.pageDemos || []).forEach(demo => {
      const option = document.createElement('option');
      option.value = demo.id;
      option.textContent = demo.name;
      option.selected = demo.id === selectedDemo?.id;
      demoSelect.appendChild(option);
    });
    demoSelect.disabled = !selectedDemo;
    const useDemoButton = document.createElement('button');
    useDemoButton.type = 'button';
    useDemoButton.className = 'font-package-action';
    useDemoButton.textContent = 'Use demo';
    useDemoButton.disabled = !selectedDemo;
    const demoRow = document.createElement('div');
    demoRow.className = 'site-preset-demo';
    demoRow.append(demoSelect, useDemoButton);

    const createForm = document.createElement('form');
    createForm.className = 'font-package-create';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 80;
    nameInput.placeholder = 'Preset name';
    nameInput.setAttribute('aria-label', 'New Site Preset name');
    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.textContent = 'Save current';
    createForm.append(nameInput, saveButton);

    const errorNode = document.createElement('p');
    errorNode.className = 'font-package-error';
    errorNode.dataset.sitePresetError = 'true';
    errorNode.setAttribute('role', 'alert');
    errorNode.hidden = true;

    host.append(presetSelect, presetActions, demoRow, createForm, errorNode);

    const applySelectedPreset = async () => {
      const result = await applySitePreset(preset.id);
      await Promise.all([refreshColorLibrary(), refreshFontPackages()]);
      ctx.applySitePresetSettings?.(result.builderSettings);
      return result;
    };

    presetSelect.addEventListener('change', () => {
      selectedPresetId = presetSelect.value;
      selectedDemoId = '';
      render();
    });
    demoSelect.addEventListener('change', () => {
      selectedDemoId = demoSelect.value;
    });
    applyButton.addEventListener('click', async () => {
      applyButton.disabled = true;
      try {
        await applySelectedPreset();
      } catch (error) {
        applyButton.disabled = false;
        sitePresetError(host, error);
      }
    });
    useDemoButton.addEventListener('click', async () => {
      if (!selectedDemo || !(await bpDialog.confirm('Replace the current scene with this page demo?'))) return;
      useDemoButton.disabled = true;
      try {
        const result = await applySelectedPreset();
        const demo = result.pageDemos.find(entry => entry.id === selectedDemo.id) || selectedDemo;
        await ctx.applySitePresetDemo?.(demo);
      } catch (error) {
        useDemoButton.disabled = false;
        sitePresetError(host, error);
      }
    });
    deleteButton.addEventListener('click', async () => {
      if (!(await bpDialog.confirm(`Delete Site Preset "${preset.name}"?`))) return;
      try {
        await deleteSitePreset(preset.id);
        selectedPresetId = getSitePresetsSnapshot().lastAppliedId
          || getSitePresetsSnapshot().presets[0]?.id
          || '';
      } catch (error) {
        sitePresetError(host, error);
      }
    });
    createForm.addEventListener('submit', async event => {
      event.preventDefault();
      const colorScheme = getActiveColorScheme();
      const fontPackage = getActiveFontPackage();
      if (!colorScheme || !fontPackage) {
        sitePresetError(host, new Error('SITE_PRESETS_DEFAULTS_UNAVAILABLE: Select a color and font scheme first.'));
        return;
      }
      saveButton.disabled = true;
      try {
        const created = await createSitePreset({
          name: nameInput.value,
          version: '1.0.0',
          developer: 'User',
          builderSettings: ctx.getSitePresetSettings?.() || {},
          colorScheme,
          fontPackage,
          pageDemos: [ctx.captureSitePresetDemo?.()].filter(Boolean)
        });
        if (created) selectedPresetId = created.id;
      } catch (error) {
        saveButton.disabled = false;
        sitePresetError(host, error);
      }
    });
  };

  ctx.cleanupSitePresetsPanel = subscribeSitePresets(render);
  render();
}

export async function startLayoutMode(ctx) {
  await showLayoutPanel(ctx.sidebarEl);
  mountSitePresetsPanel(ctx);
  ctx.setSidebarPanel?.('layout');
  ctx.hideToolbar();
  if (ctx.gridEl) ctx.gridEl.style.pointerEvents = 'none';
  try { ctx.refreshContainerBars?.(); } catch { }
  try { ctx.refreshLayoutTree?.(); } catch { }
}

export function stopLayoutMode(ctx) {
  // The rail shell owns the rendered section/layer panels; rebuilding it here
  // would erase those lists when leaving Layout mode.
  if (!ctx.sidebarEl.querySelector('.scene-panel-shell')) {
    populateWidgetsPanel(ctx.sidebarEl, ctx.allWidgets, ctx.ICON_MAP, () => ctx.switchLayer(0), ctx.INSERT_TOOL_ITEMS);
  }
  if (typeof ctx.closeSidebarPanel === 'function') {
    ctx.closeSidebarPanel();
  } else {
    ctx.setSidebarPanel?.('insert');
  }
  if (ctx.gridEl) ctx.gridEl.style.pointerEvents = '';
  // Returning to the design layer must respect the current selection; a
  // toolbar without a selected editable element creates phantom local styles.
  if (typeof ctx.syncToolbarForSelection === 'function') {
    ctx.syncToolbarForSelection();
  } else {
    ctx.showToolbar();
  }
}
