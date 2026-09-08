// Shared website UI kit editor; canvas-specific actions are supplied by Designer.
import { bpDialog } from '/ui/shared/dialogs/bpDialog.js';
import { mountWebsiteDesignPreview } from '/ui/shared/design-system/websiteDesignPreview.js';
import { componentSupported } from '/ui/shared/design-system/componentDefinitions.js';
import {
  applySitePreset,
  createSitePreset,
  deleteSitePreset,
  getSitePresetsSnapshot,
  subscribeSitePresets,
  exportSitePresetJson,
  importSitePresetJson
} from '/ui/shared/presets/sitePresets.js';
import {
  getActiveColorScheme,
  refreshColorLibrary
} from '/ui/shared/colors/colorLibrary.js';
import {
  getActiveFontPackage,
  refreshFontPackages
} from '/ui/shared/fonts/fontPackages.js';

function sitePresetError(host, error) {
  const node = host.querySelector('[data-site-preset-error]');
  if (!node) return;
  node.textContent = error instanceof Error ? error.message : String(error || 'Unable to update Site Presets.');
  node.hidden = false;
}

export function mountSitePresetsPanel(ctx) {
  const host = ctx.sidebarEl.querySelector('[data-site-presets-host]');
  if (!host) return;
  ctx.cleanupSitePresetsPanel?.();
  let selectedPresetId = getSitePresetsSnapshot().lastAppliedId
    || getSitePresetsSnapshot().presets[0]?.id
    || '';
  let selectedDemoId = '';
  let jsonDraft = null;
  let jsonOpen = false;
  let nameDraft = '';
  let cleanupPreview = null;

  const render = () => {
    cleanupPreview?.();
    const library = getSitePresetsSnapshot();
    const preset = library.presets.find(entry => entry.id === selectedPresetId)
      || library.presets[0]
      || null;
    host.replaceChildren();

    const heading = document.createElement('h4');
    heading.textContent = 'UI kit';
    host.appendChild(heading);
    const intro = document.createElement('p');
    intro.className = 'style-library-intro';
    intro.textContent = 'Save your colors, typography and reusable starting blocks. Shared page structure stays in your linked designs.';
    const editStyles = document.createElement('button');
    editStyles.type = 'button'; editStyles.className = 'font-package-action';
    editStyles.textContent = 'Edit colors & typography';
    editStyles.addEventListener('click', () => ctx.setSidebarPanel?.('design'));
    host.append(intro, editStyles);
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
    presetSelect.setAttribute('aria-label', 'UI kit');
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
    applyButton.textContent = 'Use UI kit';
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
    nameInput.placeholder = 'UI kit name';
    nameInput.setAttribute('aria-label', 'New UI kit name');
    nameInput.dataset.uiKitDraft = 'true';
    nameInput.value = nameDraft;
    nameInput.addEventListener('input', () => { nameDraft = nameInput.value; });
    const saveButton = document.createElement('button');
    saveButton.type = 'submit';
    saveButton.textContent = 'Save current as UI kit';
    createForm.append(nameInput, saveButton);

    const errorNode = document.createElement('p');
    errorNode.className = 'font-package-error';
    errorNode.dataset.sitePresetError = 'true';
    errorNode.setAttribute('role', 'alert');
    errorNode.hidden = true;

    host.append(presetSelect, presetActions);
    // Settings can edit kits but never owns or replaces a Designer canvas.
    if (ctx.applySitePresetDemo) host.append(demoRow);
    host.append(createForm, errorNode);
    const jsonSection = document.createElement('details');
    jsonSection.className = 'site-preset-json'; jsonSection.open = jsonOpen;
    const summary = document.createElement('summary'); summary.textContent = 'JSON for agents & reuse';
    const jsonInput = document.createElement('textarea');
    jsonInput.rows = 9; jsonInput.setAttribute('aria-label', 'UI kit JSON'); jsonInput.dataset.uiKitDraft = 'true';
    jsonInput.spellcheck = false;
    jsonInput.value = jsonDraft ?? exportSitePresetJson(preset.id);
    jsonInput.addEventListener('input', () => { jsonDraft = jsonInput.value; });
    jsonSection.addEventListener('toggle', () => { jsonOpen = jsonSection.open; });
    const copy = document.createElement('button');
    copy.type = 'button'; copy.className = 'font-package-action'; copy.textContent = 'Copy selected kit JSON';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(exportSitePresetJson(preset.id)); copy.textContent = 'Copied'; }
      catch (error) { sitePresetError(host, new Error(`SITE_PRESETS_COPY_FAILED: ${error.message || error}`)); }
    });
    const importButton = document.createElement('button');
    importButton.type = 'button'; importButton.className = 'font-package-action'; importButton.textContent = 'Import as new UI kit';
    importButton.addEventListener('click', async () => {
      importButton.disabled = true;
      try {
        const created = await importSitePresetJson(jsonInput.value);
        if (created) { selectedPresetId = created.id; jsonDraft = null; render(); }
      } catch (error) { sitePresetError(host, error); importButton.disabled = false; }
    });
    const jsonHint = document.createElement('p'); jsonHint.className = 'style-library-intro';
    jsonHint.textContent = 'Use a unique name. Import creates a kit; Use UI kit applies its shared colors and typography.';
    const jsonActions = document.createElement('div'); jsonActions.className = 'font-package-actions'; jsonActions.append(copy, importButton);
    jsonSection.append(summary, jsonInput, jsonHint, jsonActions); host.append(jsonSection);
    const visual = document.createElement('details');
    const visualTitle = document.createElement('summary'); visualTitle.textContent = 'Selected UI kit — visual overview';
    const visualHost = document.createElement('div');
    visual.append(visualTitle, visualHost); host.appendChild(visual);
    cleanupPreview = mountWebsiteDesignPreview(visualHost, undefined, () => ({ colors: preset.colorScheme.colors, fontPackage: preset.fontPackage, components: preset.components }));
    if (ctx.insertUiKitComponent) (preset.components || []).forEach(component => {
      const insert = document.createElement('button'); insert.type = 'button'; insert.className = 'button secondary sm';
      insert.textContent = `Insert ${component.name}`;
      insert.disabled = !componentSupported(component);
      insert.addEventListener('click', async () => {
        try { await ctx.insertUiKitComponent(component, preset.id); }
        catch (error) { sitePresetError(host, error); }
      });
      visualHost.append(insert);
    });

    const applySelectedPreset = async () => {
      const result = await applySitePreset(preset.id);
      await Promise.all([refreshColorLibrary(), refreshFontPackages()]);
      ctx.applySitePresetSettings?.(result.builderSettings);
      return result;
    };

    presetSelect.addEventListener('change', () => {
      selectedPresetId = presetSelect.value;
      selectedDemoId = '';
      // Preserve pasted JSON while inspecting another kit.
      render();
    });
    demoSelect.addEventListener('change', () => {
      selectedDemoId = demoSelect.value;
    });
    applyButton.addEventListener('click', async () => {
      if (!(await bpDialog.confirm(`Use “${preset.name}” colors and typography on all linked content?`, { confirmLabel: 'Use UI kit' }))) return;
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
      if (!(await bpDialog.confirm(`Delete UI kit "${preset.name}"?`))) return;
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
          components: preset.components,
          pageDemos: [ctx.captureSitePresetDemo?.()].filter(Boolean)
        });
        if (created) { selectedPresetId = created.id; nameDraft = ''; render(); }
      } catch (error) {
        saveButton.disabled = false;
        sitePresetError(host, error);
      }
    });
  };

  const unsubscribe = subscribeSitePresets(render);
  ctx.cleanupSitePresetsPanel = () => { unsubscribe(); cleanupPreview?.(); };
  render();
}
