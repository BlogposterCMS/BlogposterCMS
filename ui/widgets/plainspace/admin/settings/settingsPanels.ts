import { createBrandingFields } from './brandingFields.js';
import { createAnalyticsSettings } from './analyticsSettings.js';
import { createImageField } from '../../../../shared/media/imageField.js';
import {
  errorMessage,
  fetchDesignSettings,
  fetchGeneralSettings,
  fetchSecuritySettings,
  fetchSeoSettings,
  pickMediaShareUrl,
  saveFaviconUrl,
  saveSettingValue,
  saveGeneralSettings,
  saveGoogleFontsApiKey,
  saveMaintenanceSettings,
  saveSeoSettings
} from './settingsPanelsData.js';
import {
  approvedAccessDescriptors,
  fetchUpdateCenterRows,
  inspectUpdateCenterRow,
  installUpdateCenterRow,
  updateCenterRowLabel,
  updateInspectionLabel,
  updateInstallVersion,
  type UpdateCenterRow
} from './updateCenterData.js';
import type {
  ModuleAccessRequest,
  ModuleUpdateInspection
} from '../modulesListData.js';
import { renderUiKitGallery } from './uiKitGallery.js';
import { renderCoreUpdatePanel } from './coreUpdatePanel.js';
import { mountWebsiteDesignSettings } from './websiteDesignSettings.js';
import { createMediaStoragePanel } from '../../../../shared/media/mediaStoragePanel.js';
import {
  createFormActions,
  createFormChoice as createChoice,
  createFormField
} from '/ui/shared/forms/formField.js';
import { createTabSystem, type BpTabSystem } from '/ui/shared/navigation/tabs.js';
import { registerWorkspaceChanges } from '../../../../shared/navigation/workspaceChanges.js';
import { registerWorkspaceAgent, patchAgentForm, readAgentForm, agentString } from '../../../../shared/agent/workspaceAgent.js';

type SurfaceKey =
  | 'general'
  | 'design'
  | 'ui-kit'
  | 'seo'
  | 'security'
  | 'modules'
  | 'updates'
  | 'users-access'
  | 'user-edit'
  | 'provider-edit'
  | 'import-export';
type EmbeddedPanelKey = 'modules' | 'providers' | 'users' | 'access' | 'user-edit' | 'provider-edit';
type EmbeddedPanelModule = {
  render?: (target: HTMLElement, options?: { tabs?: BpTabSystem; tabsHost?: HTMLElement; actionsHost?: HTMLElement; userId?: string }) => Promise<void> | void;
};

type RenderCtx = {
  el: HTMLElement;
  page: any;
  jwt: string;
  meltdownEmit: (event: string, payload: Record<string, unknown>) => Promise<any>;
};

type DialogResult = {
  action?: string;
};

type DialogApi = {
  alert?: (message: string, options?: { title?: string }) => Promise<DialogResult>;
  confirm?: (message: string, options?: { title?: string; confirmLabel?: string; cancelLabel?: string }) => Promise<boolean>;
  open?: (options: {
    title: string;
    message?: string;
    body?: Node;
    kind?: string;
    actions?: Array<{ id: string; label: string; variant?: string }>;
    dismissable?: boolean;
  }) => Promise<DialogResult>;
};

const EMBEDDED_WIDGET_PANEL_PATHS = {
  modules: '/ui/widgets/plainspace/admin/modulesListWidget.js',
  providers: '/ui/widgets/plainspace/admin/loginStrategiesWidget.js',
  users: '/ui/widgets/plainspace/admin/usersListWidget.js',
  access: '/ui/widgets/plainspace/admin/accessSettingsWidget.js',
  'user-edit': '/ui/widgets/plainspace/admin/userEditWidget.js',
  'provider-edit': '/ui/widgets/plainspace/admin/loginStrategyEditWidget.js'
} as const satisfies Record<EmbeddedPanelKey, `/ui/widgets/plainspace/admin/${string}.js`>;
const embeddedWidgetPanelPromises = new Map<EmbeddedPanelKey, Promise<EmbeddedPanelModule>>();

function createShell(title: string, subtitle: string) {
  const root = document.createElement('section');
  root.className = 'settings-surface page-list-card';

  const header = document.createElement('header');
  header.className = 'settings-surface-header page-title-bar';

  const h = document.createElement('h1');
  h.className = 'page-title';
  h.textContent = title;

  const sub = document.createElement('p');
  sub.className = 'settings-hint';
  sub.textContent = subtitle;

  header.appendChild(h);
  header.appendChild(sub);

  const tabs = document.createElement('nav');
  tabs.className = 'settings-tabs';
  tabs.setAttribute('aria-label', `${title} sections`);

  const content = document.createElement('div');
  content.className = 'settings-tab-panels';

  const status = document.createElement('div');
  status.className = 'access-settings-status form-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  root.appendChild(header);
  root.appendChild(tabs);
  root.appendChild(content);
  root.appendChild(status);

  type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  const savedValues = new Map<Control, string>();
  let saving = false;
  const agentGroups: { id: string; fields: string[]; save: () => Promise<void> }[] = [];
  const saveControls: { button: HTMLButtonElement; fields: Control[]; discard: HTMLButtonElement; state: HTMLElement }[] = [];
  const valueOf = (field: Control) => field instanceof HTMLInputElement && field.type === 'checkbox'
    ? String(field.checked) : field.value;
  registerWorkspaceChanges(root, {
    isDirty: () => [...savedValues].some(([field, value]) => valueOf(field) !== value),
    isBusy: () => saving
  });

  // Each tab keeps its own saved baseline; saving branding must not clear a
  // pending typography edit. Lock the shared surface while a write is pending.
  function bindSave(button: HTMLButtonElement, fields: Control[], action: () => Promise<unknown>, message: string,
    agent?: { id: string; fields: Record<string, Control> }, disablePristine = false) {
    fields.forEach(field => savedValues.set(field, valueOf(field)));
    const discard = document.createElement('button');
    discard.type = 'button';
    discard.className = 'button ghost';
    discard.textContent = 'Discard changes';
    const state = document.createElement('span');
    state.className = 'settings-save-state';
    state.setAttribute('role', 'status');
    const refresh = () => {
      const dirty = fields.some(field => valueOf(field) !== savedValues.get(field));
      discard.hidden = !dirty;
      if (disablePristine) button.disabled = saving || !dirty;
      state.textContent = dirty ? 'Unsaved changes' : 'Saved';
    };
    fields.forEach(field => {
      field.addEventListener('input', refresh);
      field.addEventListener('change', refresh);
    });
    discard.addEventListener('click', () => {
      if (saving) return;
      fields.forEach(field => {
        const value = savedValues.get(field) || '';
        if (field instanceof HTMLInputElement && field.type === 'checkbox') field.checked = value === 'true';
        else field.value = value;
        field.dispatchEvent(new Event('change', { bubbles: true }));
      });
      status.textContent = '';
      refresh();
    });
    refresh();
    saveControls.push({ button, fields, discard, state });
    async function save(propagate = false) {
      if (saving) return;
      saving = true;
      content.inert = true;
      button.disabled = true;
      status.setAttribute('role', 'status');
      status.textContent = 'Saving…';
      try {
        await action();
        fields.forEach(field => savedValues.set(field, valueOf(field)));
        status.textContent = message;
      } catch (err) {
        status.setAttribute('role', 'alert');
        status.textContent = `SETTINGS_SAVE_FAILED: ${errorMessage(err)}`;
        if (propagate) throw err;
      } finally {
        saving = false;
        content.inert = false;
        button.disabled = false;
        refresh();
      }
    }
    button.addEventListener('click', () => void save());
    // Only explicitly declared non-secret fields enter the agent surface.
    // Credential controls keep their existing dedicated management workflow.
    if (agent) {
      Object.entries(agent.fields).forEach(([name, input]) => { input.name = name; });
      agentGroups.push({ id: agent.id, fields: Object.keys(agent.fields), save: () => save(true) });
    }
  }
  function mount(parent: HTMLElement) {
    saveControls.forEach(({ button, discard, state }) => {
      button.parentElement?.classList.add('settings-save-bar');
      button.parentElement?.append(discard, state);
    });
    parent.replaceChildren(root);
    if (!agentGroups.length) return;
    registerWorkspaceAgent({ root, id: `settings-${agentGroups[0]!.id}`, title,
      read: () => ({ dirty: [...savedValues].some(([field, value]) => valueOf(field) !== value), busy: saving,
        error: status.getAttribute('role') === 'alert' ? status.textContent : null,
        groups: agentGroups.map(group => ({ id: group.id, fields: readAgentForm(root, group.fields) })) }),
      actions: [
        { action: 'settings.updateDraft', label: 'Update settings fields', acceptsDraft: true,
          params: [{ name: 'group', type: 'string', required: true }, { name: 'fields', type: 'object', required: true }],
          run: p => {
            const group = agentGroups.find(group => group.id === agentString(p, 'group'));
            if (!group) throw new Error('SETTINGS_AGENT_GROUP_UNAVAILABLE');
            patchAgentForm(root, p.fields, group.fields);
          } },
        { action: 'settings.save', label: 'Save a settings group', acceptsDraft: true, confirm: true,
          params: [{ name: 'group', type: 'string', required: true }], run: p => {
            const group = agentGroups.find(group => group.id === agentString(p, 'group'));
            if (!group) throw new Error('SETTINGS_AGENT_GROUP_UNAVAILABLE');
            return group.save();
          } }
      ]
    });
  }
  return { root, tabs, content, status, bindSave, mount };
}

function dialogApi(): DialogApi | null {
  return (window as Window & { bpDialog?: DialogApi }).bpDialog || null;
}

async function alertError(message: string): Promise<void> {
  const dialog = dialogApi();
  if (dialog?.alert) {
    await dialog.alert(message, { title: 'Error' });
    return;
  }
  alert(message);
}

async function confirmSimple(title: string, message: string, confirmLabel: string): Promise<boolean> {
  const dialog = dialogApi();
  if (dialog?.confirm) {
    return await dialog.confirm(message, { title, confirmLabel, cancelLabel: 'Cancel' });
  }
  return confirm(message);
}

function makeBadge(text: string, tone = 'neutral'): HTMLSpanElement {
  const badge = document.createElement('span');
  badge.className = `module-access-badge module-access-badge--${tone}`;
  badge.textContent = text;
  return badge;
}

function accessLabel(access: ModuleAccessRequest): string {
  return access.resource && access.action
    ? `${access.resource}.${access.action}`
    : access.event || '';
}

function buildUpdateAccessReviewBody(accessList: ModuleAccessRequest[]): HTMLDivElement {
  const body = document.createElement('div');
  body.className = 'module-access-review';

  const section = document.createElement('div');
  section.className = 'module-access-section';
  const title = document.createElement('strong');
  title.textContent = 'New core access';
  section.appendChild(title);

  accessList.forEach(access => {
    const label = document.createElement('label');
    label.className = 'module-access-option';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = access.allowPermanent !== false && access.protected !== true;
    checkbox.disabled = access.allowPermanent === false || access.protected === true;
    checkbox.dataset.moduleAccessKey = accessLabel(access);

    const text = document.createElement('span');
    text.textContent = accessLabel(access);
    label.append(checkbox, text);
    if (access.reason) {
      const reason = document.createElement('small');
      reason.textContent = access.reason;
      label.appendChild(reason);
    }
    section.appendChild(label);
  });

  body.appendChild(section);
  return body;
}

async function reviewUpdateAccess(inspection: ModuleUpdateInspection): Promise<ModuleAccessRequest[] | null> {
  const newAccess = Array.isArray(inspection.newRequestedAccess)
    ? inspection.newRequestedAccess
    : [];
  if (!newAccess.length) return [];

  const dialog = dialogApi();
  if (!dialog?.open) {
    const message = newAccess.map(accessLabel).join(', ');
    return confirm(`Update requests new core access:\n\n${message}`)
      ? approvedAccessDescriptors(newAccess)
      : null;
  }

  const body = buildUpdateAccessReviewBody(newAccess);
  const result = await dialog.open({
    kind: 'warning',
    title: `Update ${updateInspectionLabel(inspection)}`,
    message: 'Review new core access before installing this update.',
    body,
    dismissable: true,
    actions: [
      { id: 'cancel', label: 'Cancel' },
      { id: 'confirm', label: 'Install update', variant: 'primary' }
    ]
  });
  if (result.action !== 'confirm') return null;

  const selected = new Set(Array.from(body.querySelectorAll<HTMLInputElement>('input[data-module-access-key]'))
    .filter(input => input.checked)
    .map(input => input.dataset.moduleAccessKey || ''));
  return approvedAccessDescriptors(newAccess.filter(access => selected.has(accessLabel(access))));
}

async function renderGeneral(ctx: RenderCtx) {
  const shell = createShell('General Settings', 'Manage your website identity and connected storage.');
  let storage: HTMLElement | undefined;
  const tabs = createTabSystem(shell.content, shell.tabs, { variant: 'underline', onSelect: index => {
    // Fetch connection settings only when their tab is opened.
    if (index === 1 && storage && !storage.childElementCount) storage.append(createMediaStoragePanel({
      mode: 'settings', request: window.fetch.bind(window), csrfToken: window.CSRF_TOKEN
    }));
  } });
  const identity = tabs.addTab('Site identity');
  identity.classList.add('settings-section--form');

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  const descInput = document.createElement('textarea');

  const generalSettings = await fetchGeneralSettings(ctx.meltdownEmit, ctx.jwt);

  titleInput.value = generalSettings.siteTitle;
  descInput.value = generalSettings.siteDescription;

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'button primary';
  save.textContent = 'Save general settings';
  shell.bindSave(save, [titleInput, descInput], () => saveGeneralSettings(ctx.meltdownEmit, ctx.jwt, {
    siteTitle: titleInput.value.trim(), siteDescription: descInput.value.trim()
  }), 'General settings saved.', { id: 'general', fields: { siteTitle: titleInput, siteDescription: descInput } });

  identity.append(
    createFormField('Site Title', titleInput, { hint: 'The name of your website.' }),
    createFormField('Site Description', descInput, { hint: 'A short description of what visitors will find here.' }),
    createFormActions(save)
  );
  // Storage is site configuration; keep it on the existing Settings route and tab contract.
  storage = tabs.addTab('Storage');
  storage.classList.add('settings-section--form');
  const privacy = tabs.addTab('Privacy & analytics');
  const privacyEditor = await createAnalyticsSettings(ctx.meltdownEmit, ctx.jwt);
  const privacySave = document.createElement('button'); privacySave.type = 'button'; privacySave.className = 'button primary'; privacySave.textContent = 'Save privacy & analytics';
  shell.bindSave(privacySave, Object.values(privacyEditor.fields), privacyEditor.save, 'Privacy & analytics saved.', { id: 'privacy', fields: privacyEditor.fields });
  privacy.append(privacyEditor.root, createFormActions(privacySave));
  if (new URLSearchParams(window.location.search).get('tab') === 'storage') tabs.select(1);
  if (new URLSearchParams(window.location.search).get('tab') === 'privacy') tabs.select(2);
  shell.mount(ctx.el);
}

async function renderDesign(ctx: RenderCtx) {
  const shell = createShell('Design Settings', 'Shared website branding, theme and component defaults for Design Studio.');
  const tabs = createTabSystem(shell.content, shell.tabs, { variant: 'underline' });
  const overview = tabs.addTab('Overview');
  const branding = tabs.addTab('Branding');
  branding.classList.add('settings-section--form');
  const theme = tabs.addTab('Theme');
  const typography = tabs.addTab('Typography & components');
  typography.classList.add('settings-section--form');
  const presets = tabs.addTab('UI kits');

  const designSettings = await fetchDesignSettings(ctx.meltdownEmit, ctx.jwt);
  branding.classList.add('branding-settings');
  const editor = createBrandingFields(designSettings,
    () => pickMediaShareUrl(ctx.meltdownEmit, ctx.jwt), message => { shell.status.textContent = message; });
  const logoInputs = editor.fields;
  const saveBranding = document.createElement('button');
  saveBranding.type = 'button'; saveBranding.className = 'button primary'; saveBranding.textContent = 'Save changes';
  const footer = createFormActions(saveBranding); footer.classList.add('branding-save');
  branding.append(editor.root, footer);
  // Reuse the existing save/dirty/agent contract and settings persistence.
  shell.bindSave(saveBranding, Object.values(editor.fields), async () => {
    await saveSettingValue(ctx.meltdownEmit, ctx.jwt, 'SITE_LOGO_URL', editor.fields.logoUrl!.value.trim());
    await saveSettingValue(ctx.meltdownEmit, ctx.jwt, 'SITE_LOGO_DARK_URL', editor.fields.logoDarkUrl!.value.trim());
    await saveFaviconUrl(ctx.meltdownEmit, ctx.jwt, editor.fields.faviconUrl!.value.trim());
  }, 'Branding saved.', { id: 'branding', fields: editor.fields }, true);

  const fontInput = document.createElement('input');
  fontInput.type = 'password';
  fontInput.autocomplete = 'off';
  fontInput.value = designSettings.googleFontsApiKey;
  const fontSave = document.createElement('button');
  fontSave.type = 'button';
  fontSave.className = 'button primary';
  fontSave.textContent = 'Save typography settings';
  shell.bindSave(fontSave, [fontInput], () => saveGoogleFontsApiKey(ctx.meltdownEmit, ctx.jwt, fontInput.value.trim()), 'Typography settings saved.');

  typography.append(
    createFormField('Google Fonts API Key', fontInput, { hint: 'Optional connection for the font library. Leave empty if you do not use it.' }),
    createFormActions(fontSave)
  );
  shell.mount(ctx.el);
  try {
    const dispose = await mountWebsiteDesignSettings({
      root: shell.content, overview, theme, components: typography, presets,
      emit: ctx.meltdownEmit, jwt: ctx.jwt,
      branding: () => ({ logoUrl: logoInputs.logoUrl?.value || '', logoDarkUrl: logoInputs.logoDarkUrl?.value || '' }),
      editTheme: () => { shell.tabs.querySelectorAll<HTMLButtonElement>('[role="tab"]')[2]?.click(); }
    });
    // Dedicated Settings pages are replaced by the existing page loader.
    const observer = new MutationObserver(() => {
      if (!shell.content.isConnected) { dispose(); observer.disconnect(); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  } catch (error) {
    overview.textContent = `WEBSITE_DESIGN_LOAD_FAILED: ${errorMessage(error)}`;
  }
}

async function renderSeo(ctx: RenderCtx) {
  const shell = createShell('SEO Settings', 'Set search defaults for your website. Individual pages can override their metadata.');
  const tabs = createTabSystem(shell.content, shell.tabs, { variant: 'underline' });
  const defaults = tabs.addTab('Defaults');
  defaults.classList.add('settings-section--form');

  const seoSettings = await fetchSeoSettings(ctx.meltdownEmit, ctx.jwt);

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.value = seoSettings.titleTemplate;

  const descInput = document.createElement('textarea');
  descInput.value = seoSettings.metaDescription;

  const indexInput = document.createElement('input');
  indexInput.type = 'checkbox';
  indexInput.checked = seoSettings.indexingEnabled;

  const imageInput = document.createElement('input'); imageInput.type = 'text';
  imageInput.value = seoSettings.defaultImage || '';
  const imageField = createImageField('Default link preview image', imageInput, {
    emit: ctx.meltdownEmit, jwt: ctx.jwt,
    hint: 'Used when a page has neither a link preview image nor a featured image.',
    reportError: message => { shell.status.textContent = message; shell.status.setAttribute('role', 'alert'); }
  });

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'button primary';
  save.textContent = 'Save SEO settings';
  shell.bindSave(save, [titleInput, descInput, indexInput, imageInput], () => saveSeoSettings(ctx.meltdownEmit, ctx.jwt, {
    titleTemplate: titleInput.value.trim(), metaDescription: descInput.value.trim(), indexingEnabled: indexInput.checked,
    defaultImage: imageInput.value.trim()
  }), 'SEO settings saved.', { id: 'seo', fields: { titleTemplate: titleInput, metaDescription: descInput, indexingEnabled: indexInput, defaultImage: imageInput } });

  defaults.append(
    createFormField('SEO Title Template', titleInput, { hint: 'Use %title% for the page title, e.g. %title% | My website. A page SEO title overrides this pattern.' }),
    createFormField('Default Meta Description', descInput),
    imageField.root,
    createChoice('Allow Search Engine Indexing', indexInput),
    createFormActions(save)
  );
  shell.mount(ctx.el);
}

async function renderSecurity(ctx: RenderCtx) {
  const shell = createShell('Site availability', 'Control what visitors see while you work on your website.');
  const tabs = createTabSystem(shell.content, shell.tabs, { variant: 'underline' });
  const maintenanceTab = tabs.addTab('Maintenance');
  maintenanceTab.classList.add('settings-section--form');
  const securitySettings = await fetchSecuritySettings(ctx.meltdownEmit, ctx.jwt);

  const maintenanceToggle = document.createElement('input');
  maintenanceToggle.type = 'checkbox';
  maintenanceToggle.checked = securitySettings.maintenanceMode;
  const pageSelect = document.createElement('select');
  const none = document.createElement('option');
  none.value = '';
  none.textContent = 'Choose a page';
  pageSelect.appendChild(none);
  securitySettings.publicPages.forEach(page => {
    const option = document.createElement('option');
    option.value = String(page.id ?? '');
    option.textContent = String(page.title ?? page.slug ?? page.id);
    if (String(page.id) === String(securitySettings.maintenancePageId)) option.selected = true;
    pageSelect.appendChild(option);
  });
  const maintenanceSave = document.createElement('button');
  maintenanceSave.type = 'button';
  maintenanceSave.className = 'button primary';
  maintenanceSave.textContent = 'Save maintenance settings';
  shell.bindSave(maintenanceSave, [maintenanceToggle, pageSelect], () => saveMaintenanceSettings(ctx.meltdownEmit, ctx.jwt, maintenanceToggle.checked, pageSelect.value), 'Maintenance settings saved.', { id: 'maintenance', fields: { maintenanceMode: maintenanceToggle, maintenancePageId: pageSelect } });

  maintenanceTab.append(
    createChoice('Enable maintenance mode', maintenanceToggle),
    createFormField('Maintenance page', pageSelect, { hint: 'Visitors see this page while maintenance mode is enabled. Administrator access remains available.' }),
    createFormActions(maintenanceSave)
  );
  shell.mount(ctx.el);
}

async function loadEmbeddedWidgetPanel(key: EmbeddedPanelKey): Promise<EmbeddedPanelModule> {
  const cached = embeddedWidgetPanelPromises.get(key);
  if (cached) return cached;
  const importPath = EMBEDDED_WIDGET_PANEL_PATHS[key];
  const promise = (import(/* webpackIgnore: true */ importPath) as Promise<EmbeddedPanelModule>).catch(error => {
    embeddedWidgetPanelPromises.delete(key);
    throw error;
  });
  embeddedWidgetPanelPromises.set(key, promise);
  return promise;
}

async function renderEmbeddedWidgetPanel(target: HTMLElement, key: EmbeddedPanelKey,
  options?: { tabs?: BpTabSystem; tabsHost?: HTMLElement; actionsHost?: HTMLElement; userId?: string }) {
  try {
    const mod = await loadEmbeddedWidgetPanel(key);
    if (typeof mod.render !== 'function') throw new Error('SETTINGS_PANEL_UNAVAILABLE');
    await mod.render(target, options);
  } catch (err) {
    // A renderer composing the page's tablist must retry the whole page, or
    // old tab buttons would retain references to detached panels.
    if (options?.tabs || options?.tabsHost) throw err;
    const error = document.createElement('p');
    error.setAttribute('role', 'alert');
    error.textContent = `SETTINGS_PANEL_LOAD_FAILED: ${errorMessage(err)}`;
    const retry = document.createElement('button');
    retry.type = 'button'; retry.className = 'button ghost'; retry.textContent = 'Retry';
    retry.addEventListener('click', () => {
      target.replaceChildren();
      void renderEmbeddedWidgetPanel(target, key, options);
    });
    target.append(error, retry);
  }
}

async function renderModules(ctx: RenderCtx) {
  const shell = createShell('Modules', 'Manage installed extensions and inspect the core modules that power your site.');
  shell.mount(ctx.el);
  await renderEmbeddedWidgetPanel(shell.content, 'modules', { tabsHost: shell.tabs });
}

async function renderUiKit(ctx: RenderCtx) {
  renderUiKitGallery(ctx.el);
}

async function renderUpdateRows(
  mount: HTMLElement,
  status: HTMLElement,
  ctx: RenderCtx
): Promise<void> {
  mount.textContent = 'Checking module updates...';
  const checkedRows = await fetchUpdateCenterRows(ctx.meltdownEmit, ctx.jwt);
  const rows = checkedRows.filter(row => row.available);
  mount.innerHTML = '';

  const heading = document.createElement('h4'); heading.textContent = 'Installed module updates';
  const summary = document.createElement('p'); summary.className = 'settings-hint';
  summary.textContent = rows.length ? `${rows.length} module updates available`
    : !checkedRows.length ? 'No installed modules'
    : checkedRows.every(row => row.status === 'current') ? 'Up to date' : 'Some modules could not be checked';
  const checked = document.createElement('p'); checked.className = 'settings-hint';
  checked.textContent = `Last checked: ${new Date().toLocaleString()}`;
  mount.append(heading, summary, checked);

  const list = document.createElement('ul');
  list.className = 'modules-list page-list';

  rows.forEach(row => {
    list.appendChild(renderUpdateRow(row, status, mount, ctx));
  });

  mount.append(list);
}

function renderUpdateRow(
  row: UpdateCenterRow,
  status: HTMLElement,
  mount: HTMLElement,
  ctx: RenderCtx
): HTMLLIElement {
  const item = document.createElement('li');

  const details = document.createElement('details');
  details.className = 'module-details';

  const nameRow = document.createElement('div');
  nameRow.className = 'module-name-row';

  const name = document.createElement('span');
  name.className = 'module-name';
  name.textContent = updateCenterRowLabel(row);

  const badge = makeBadge(row.statusLabel, row.statusTone);
  if (row.updateStatus?.errorMessage) {
    badge.title = row.updateStatus.errorMessage;
  }

  const actions = document.createElement('span');
  actions.className = 'module-actions';

  const updateButton = document.createElement('button');
  updateButton.type = 'button';
  updateButton.className = 'module-toggle-btn';
  updateButton.textContent = 'Update';
  updateButton.hidden = !row.available;
  updateButton.addEventListener('click', async event => {
    event.stopPropagation();
    updateButton.disabled = true;
    const rowLabel = updateCenterRowLabel(row);
    status.textContent = `Inspecting ${rowLabel} update...`;
    try {
      const inspection = await inspectUpdateCenterRow(ctx.meltdownEmit, ctx.jwt, row);
      let approvedAccess: ModuleAccessRequest[] = [];
      if (inspection.requiresAdminApproval) {
        const reviewed = await reviewUpdateAccess(inspection);
        if (reviewed === null) {
          status.textContent = 'Update cancelled.';
          return;
        }
        approvedAccess = reviewed;
      } else if (!await confirmSimple(
        `Update ${rowLabel}`,
        `Install update ${updateInstallVersion(row, inspection)}?`,
        'Update'
      )) {
        status.textContent = 'Update cancelled.';
        return;
      }
      status.textContent = `Installing ${rowLabel} update...`;
      await installUpdateCenterRow(ctx.meltdownEmit, ctx.jwt, row, approvedAccess);
      status.textContent = `${rowLabel} update installed.`;
      await renderUpdateRows(mount, status, ctx);
    } catch (err) {
      status.textContent = `Update failed: ${errorMessage(err)}`;
      await alertError(`Update failed: ${errorMessage(err)}`);
    } finally {
      updateButton.disabled = false;
    }
  });

  actions.appendChild(updateButton);
  const versions = document.createElement('span'); versions.className = 'update-versions';
  versions.textContent = `${row.currentVersion} → ${row.latestVersion}`;
  nameRow.append(name, versions);

  const meta = document.createElement('div');
  meta.className = 'module-meta';
  meta.textContent = row.latestVersion && row.latestVersion !== row.currentVersion
    ? `${row.meta} -> v${row.latestVersion}`
    : row.meta;

  const heading = document.createElement('summary');
  heading.append(nameRow);
  const notes = document.createElement('p');
  notes.textContent = 'No module-specific release notes were provided.';
  details.append(heading, meta, notes, actions);
  item.appendChild(details);
  return item;
}

async function renderUpdates(ctx: RenderCtx) {
  const shell = createShell('Update Center', 'Keep Blogposter and your installed modules up to date.');
  const tabs = createTabSystem(shell.content, shell.tabs, { variant: 'underline' });
  const corePanel = tabs.addTab('System');
  const updatesPanel = tabs.addTab('Installed');
  updatesPanel.classList.add('installed-update-panel');
  const modulesPanel = document.createElement('section');
  modulesPanel.setAttribute('aria-label', 'Modules');
  const widgetsPanel = document.createElement('section');
  widgetsPanel.setAttribute('aria-label', 'Widgets');
  widgetsPanel.className = 'core-module-updates';
  updatesPanel.append(modulesPanel, widgetsPanel);
  // Official bundled widgets share signed release discovery. Community ZIP
  // packages retain their existing reviewed installation and sandbox contracts.
  const widgetStatus = document.createElement('p'); widgetStatus.className = 'settings-hint';
  widgetStatus.textContent = 'Community widgets are updated by installing a reviewed ZIP package.';
  widgetsPanel.append(widgetStatus);

  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'icon-button';
  refresh.setAttribute('aria-label', 'Check all updates');
  refresh.title = 'Check all updates';
  refresh.innerHTML = '<img src="/assets/icons/refresh-cw.svg" width="18" height="18" alt="" />';
  let checkCore: (() => Promise<void>) | undefined;
  refresh.disabled = true;
  const toolbar = document.createElement('div'); toolbar.className = 'settings-update-toolbar';
  shell.tabs.before(toolbar); toolbar.append(shell.tabs, refresh);

  const rowsMount = document.createElement('div');
  rowsMount.className = 'modules-list-mount';

  refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    try {
      await Promise.all([checkCore?.(), renderUpdateRows(rowsMount, shell.status, ctx)]);
      shell.status.textContent = 'Update checks requested. See each source for its status.';
    } catch (err) {
      shell.status.textContent = `Update check failed: ${errorMessage(err)}`;
    } finally {
      refresh.disabled = false;
    }
  });

  modulesPanel.append(rowsMount);
  shell.mount(ctx.el);
  checkCore = await renderCoreUpdatePanel(corePanel, ctx.meltdownEmit, ctx.jwt, true, widgetsPanel, toolbar);
  await renderUpdateRows(rowsMount, shell.status, ctx);
  refresh.disabled = false;
}

async function renderUsersAccess(ctx: RenderCtx) {
  const shell = createShell('Users & access', 'Manage people, permission groups, sign-in methods and access for agents.');
  const tabs = createTabSystem(shell.content, shell.tabs, { variant: 'underline' });
  shell.mount(ctx.el);
  await renderEmbeddedWidgetPanel(shell.content, 'users', { tabs });
  const providersPanel = tabs.addTab('Sign-in methods');
  const accessPanel = tabs.addTab('Registration & agents');
  await Promise.all([
    renderEmbeddedWidgetPanel(providersPanel, 'providers'),
    renderEmbeddedWidgetPanel(accessPanel, 'access')
  ]);
}

async function renderImportExport(ctx: RenderCtx) {
  const shell = createShell('Import / Export', 'Operational data portability and backups.');
  const tabs = createTabSystem(shell.content, shell.tabs, { variant: 'underline' });
  const exportTab = tabs.addTab('Export');
  const importTab = tabs.addTab('Import');

  const exportNote = document.createElement('p');
  exportNote.className = 'settings-hint';
  exportNote.textContent = 'Export tooling is controlled by modules. Enable an import/export module to activate this screen.';

  const importNote = document.createElement('p');
  importNote.className = 'settings-hint';
  importNote.textContent = 'Import actions are intentionally disabled by default for security. Install a trusted module before enabling writes.';

  exportTab.append(exportNote);
  importTab.append(importNote);
  shell.mount(ctx.el);
}

async function renderAccountDetail(ctx: RenderCtx, key: 'user-edit' | 'provider-edit') {
  const shell = createShell(key === 'user-edit' ? 'Edit user' : 'Configure sign-in',
    key === 'user-edit' ? 'Manage profile information and account permissions.' : 'Configure the selected sign-in provider.');
  const back = document.createElement('a');
  back.className = 'button ghost sm'; back.textContent = 'Back to users & access';
  back.href = '/admin/settings/users-access';
  shell.tabs.append(back);
  shell.mount(ctx.el);
  await renderEmbeddedWidgetPanel(shell.content, key,
    key === 'user-edit' ? { userId: String(ctx.page.slug).split('/')[3] } : undefined);
}

const SURFACE_RENDERERS: Record<SurfaceKey, (ctx: RenderCtx) => Promise<void>> = {
  general: renderGeneral,
  design: renderDesign,
  'ui-kit': renderUiKit,
  seo: renderSeo,
  security: renderSecurity,
  modules: renderModules,
  updates: renderUpdates,
  'users-access': renderUsersAccess,
  'user-edit': ctx => renderAccountDetail(ctx, 'user-edit'),
  'provider-edit': ctx => renderAccountDetail(ctx, 'provider-edit'),
  'import-export': renderImportExport
};

export async function renderSettingsSurface(el: HTMLElement, page: any): Promise<boolean> {
  const jwt = (window as any).ADMIN_TOKEN as string;
  const meltdownEmit = (window as any).meltdownEmit as RenderCtx['meltdownEmit'];

  if (!el || !jwt || typeof meltdownEmit !== 'function') {
    return false;
  }

  const slugParts = String(page?.slug || '').split('/').filter(Boolean);
  if (slugParts[0] !== 'settings') {
    return false;
  }

  // The account-menu entry points at /settings; it must open an actual panel.
  const surfaceKey = (/^settings\/users\/edit\/\d+$/.test(String(page.slug)) ? 'user-edit'
    : String(page.slug) === 'settings/login/edit' ? 'provider-edit'
    : slugParts[1] || 'general') as SurfaceKey;
  const renderer = SURFACE_RENDERERS[surfaceKey];
  if (!renderer) {
    return false;
  }

  // Dedicated settings own their full workspace even on existing installations
  // whose saved page metadata still describes a customizable dashboard.
  el.dataset.dashboardLayout = 'fixed';
  const loading = document.createElement('section');
  loading.className = 'settings-surface settings-loading';
  loading.setAttribute('role', 'status');
  loading.textContent = 'Loading settings…';
  el.replaceChildren(loading);
  try {
    await renderer({ el, page, jwt, meltdownEmit });
    return true;
  } catch (err) {
    el.innerHTML = '';
    const error = document.createElement('div');
    error.className = 'error';
    error.setAttribute('role', 'alert');
    error.textContent = `SETTINGS_LOAD_FAILED: ${errorMessage(err)}`;
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'button secondary';
    retry.textContent = 'Retry';
    retry.addEventListener('click', () => { void renderSettingsSurface(el, page); });
    const failure = document.createElement('section');
    failure.className = 'settings-surface settings-loading';
    failure.append(error, retry);
    el.append(failure);
    return true;
  }
}
