import {
  errorMessage,
  fetchDesignSettings,
  fetchGeneralSettings,
  fetchSecuritySettings,
  fetchSeoSettings,
  pickMediaShareUrl,
  saveAllowRegistration,
  saveFaviconUrl,
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

type SurfaceKey =
  | 'general'
  | 'design'
  | 'seo'
  | 'security'
  | 'modules'
  | 'updates'
  | 'users-access'
  | 'import-export';
type EmbeddedPanelKey = 'modules' | 'providers' | 'users' | 'access';
type EmbeddedPanelModule = {
  render?: (target: HTMLElement) => Promise<void> | void;
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
  access: '/ui/widgets/plainspace/admin/accessSettingsWidget.js'
} as const satisfies Record<EmbeddedPanelKey, `/ui/widgets/plainspace/admin/${string}.js`>;
const embeddedWidgetPanelPromises = new Map<EmbeddedPanelKey, Promise<EmbeddedPanelModule>>();

function createShell(title: string, subtitle: string) {
  const root = document.createElement('section');
  root.className = 'settings-surface page-list-card';

  const header = document.createElement('header');
  header.className = 'settings-surface-header page-title-bar';

  const h = document.createElement('div');
  h.className = 'page-title';
  h.textContent = title;

  const sub = document.createElement('p');
  sub.className = 'settings-hint';
  sub.textContent = subtitle;

  header.appendChild(h);
  header.appendChild(sub);

  const tabs = document.createElement('nav');
  tabs.className = 'settings-tabs';

  const content = document.createElement('div');
  content.className = 'settings-tab-panels';

  const status = document.createElement('div');
  status.className = 'access-settings-status';

  root.appendChild(header);
  root.appendChild(tabs);
  root.appendChild(content);
  root.appendChild(status);

  return { root, tabs, content, status };
}

function createTabSystem(container: HTMLElement, tabsHost: HTMLElement) {
  const tabs: Array<{ button: HTMLButtonElement; panel: HTMLElement }> = [];

  const select = (index: number) => {
    tabs.forEach((tab, i) => {
      const active = i === index;
      tab.button.classList.toggle('active', active);
      tab.button.setAttribute('aria-selected', String(active));
      tab.panel.hidden = !active;
    });
  };

  const addTab = (label: string): HTMLElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button ghost sm';
    button.textContent = label;

    const panel = document.createElement('section');
    panel.className = 'settings-section';
    panel.hidden = true;

    button.addEventListener('click', () => {
      const idx = tabs.findIndex(tab => tab.button === button);
      if (idx >= 0) select(idx);
    });

    tabs.push({ button, panel });
    tabsHost.appendChild(button);
    container.appendChild(panel);

    if (tabs.length === 1) select(0);
    return panel;
  };

  return { addTab };
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
  const shell = createShell('General Settings', 'Core site identity and default metadata.');
  const tabs = createTabSystem(shell.content, shell.tabs);
  const identity = tabs.addTab('Site identity');

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
  save.addEventListener('click', async () => {
    save.disabled = true;
    shell.status.textContent = 'Saving…';
    try {
      await saveGeneralSettings(ctx.meltdownEmit, ctx.jwt, {
        siteTitle: titleInput.value.trim(),
        siteDescription: descInput.value.trim()
      });
      shell.status.textContent = 'General settings saved.';
    } catch (err) {
      shell.status.textContent = `Failed to save general settings: ${errorMessage(err)}`;
    } finally {
      save.disabled = false;
    }
  });

  const titleLabel = document.createElement('label');
  titleLabel.textContent = 'Site Title';
  const descLabel = document.createElement('label');
  descLabel.textContent = 'Site Description';

  identity.append(titleLabel, titleInput, descLabel, descInput, save);
  ctx.el.replaceChildren(shell.root);
}

async function renderDesign(ctx: RenderCtx) {
  const shell = createShell('Design Settings', 'Branding assets and typography integrations.');
  const tabs = createTabSystem(shell.content, shell.tabs);
  const branding = tabs.addTab('Branding');
  const typography = tabs.addTab('Typography');

  const designSettings = await fetchDesignSettings(ctx.meltdownEmit, ctx.jwt);

  const favLabel = document.createElement('label');
  favLabel.textContent = 'Favicon URL';
  const favInput = document.createElement('input');
  favInput.type = 'text';
  favInput.value = designSettings.faviconUrl;
  const pickBtn = document.createElement('button');
  pickBtn.type = 'button';
  pickBtn.className = 'button ghost';
  pickBtn.textContent = 'Choose from media';
  pickBtn.addEventListener('click', async () => {
    try {
      const pickedUrl = await pickMediaShareUrl(ctx.meltdownEmit, ctx.jwt);
      if (pickedUrl) {
        favInput.value = pickedUrl;
      }
    } catch (err) {
      shell.status.textContent = `Unable to open media explorer: ${errorMessage(err)}`;
    }
  });
  const favSave = document.createElement('button');
  favSave.type = 'button';
  favSave.className = 'button primary';
  favSave.textContent = 'Save favicon';
  favSave.addEventListener('click', async () => {
    try {
      await saveFaviconUrl(ctx.meltdownEmit, ctx.jwt, favInput.value.trim());
      shell.status.textContent = 'Favicon updated.';
    } catch (err) {
      shell.status.textContent = `Failed to save favicon: ${errorMessage(err)}`;
    }
  });

  const fontLabel = document.createElement('label');
  fontLabel.textContent = 'Google Fonts API Key';
  const fontInput = document.createElement('input');
  fontInput.type = 'text';
  fontInput.value = designSettings.googleFontsApiKey;
  const fontSave = document.createElement('button');
  fontSave.type = 'button';
  fontSave.className = 'button primary';
  fontSave.textContent = 'Save typography settings';
  fontSave.addEventListener('click', async () => {
    try {
      await saveGoogleFontsApiKey(ctx.meltdownEmit, ctx.jwt, fontInput.value.trim());
      shell.status.textContent = 'Typography settings saved.';
    } catch (err) {
      shell.status.textContent = `Failed to save typography settings: ${errorMessage(err)}`;
    }
  });

  branding.append(favLabel, favInput, pickBtn, favSave);
  typography.append(fontLabel, fontInput, fontSave);
  ctx.el.replaceChildren(shell.root);
}

async function renderSeo(ctx: RenderCtx) {
  const shell = createShell('SEO Settings', 'Search visibility and metadata defaults.');
  const tabs = createTabSystem(shell.content, shell.tabs);
  const defaults = tabs.addTab('Defaults');

  const seoSettings = await fetchSeoSettings(ctx.meltdownEmit, ctx.jwt);

  const titleLabel = document.createElement('label');
  titleLabel.textContent = 'SEO Title Template';
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.value = seoSettings.titleTemplate;

  const descLabel = document.createElement('label');
  descLabel.textContent = 'Default Meta Description';
  const descInput = document.createElement('textarea');
  descInput.value = seoSettings.metaDescription;

  const indexLabel = document.createElement('label');
  indexLabel.textContent = 'Allow Search Engine Indexing';
  const indexInput = document.createElement('input');
  indexInput.type = 'checkbox';
  indexInput.checked = seoSettings.indexingEnabled;

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'button primary';
  save.textContent = 'Save SEO settings';
  save.addEventListener('click', async () => {
    try {
      await saveSeoSettings(ctx.meltdownEmit, ctx.jwt, {
        titleTemplate: titleInput.value.trim(),
        metaDescription: descInput.value.trim(),
        indexingEnabled: indexInput.checked
      });
      shell.status.textContent = 'SEO settings saved.';
    } catch (err) {
      shell.status.textContent = `Failed to save SEO settings: ${errorMessage(err)}`;
    }
  });

  defaults.append(titleLabel, titleInput, descLabel, descInput, indexLabel, indexInput, save);
  ctx.el.replaceChildren(shell.root);
}

async function renderSecurity(ctx: RenderCtx) {
  const shell = createShell('Security Settings', 'Registration controls and maintenance safety options.');
  const tabs = createTabSystem(shell.content, shell.tabs);
  const accessTab = tabs.addTab('Access controls');
  const maintenanceTab = tabs.addTab('Maintenance');

  const securitySettings = await fetchSecuritySettings(ctx.meltdownEmit, ctx.jwt);

  const allowRegistration = document.createElement('input');
  allowRegistration.type = 'checkbox';
  allowRegistration.checked = securitySettings.allowRegistration;

  const installState = document.createElement('p');
  installState.className = 'settings-hint';
  installState.textContent = securitySettings.firstInstallDone
    ? 'Initial setup is complete.'
    : 'Initial setup is still pending.';

  const allowLabel = document.createElement('label');
  allowLabel.textContent = 'Allow public registration';
  const accessSave = document.createElement('button');
  accessSave.type = 'button';
  accessSave.className = 'button primary';
  accessSave.textContent = 'Save access settings';
  accessSave.addEventListener('click', async () => {
    try {
      await saveAllowRegistration(ctx.meltdownEmit, ctx.jwt, allowRegistration.checked);
      shell.status.textContent = 'Access settings saved.';
    } catch (err) {
      shell.status.textContent = `Failed to save access settings: ${errorMessage(err)}`;
    }
  });

  const maintenanceToggle = document.createElement('input');
  maintenanceToggle.type = 'checkbox';
  maintenanceToggle.checked = securitySettings.maintenanceMode;
  const maintenanceLabel = document.createElement('label');
  maintenanceLabel.textContent = 'Enable maintenance mode';

  const pageSelect = document.createElement('select');
  const none = document.createElement('option');
  none.value = '';
  none.textContent = '-- select page --';
  pageSelect.appendChild(none);
  securitySettings.publicPages.forEach(page => {
    const option = document.createElement('option');
    option.value = String(page.id ?? '');
    option.textContent = String(page.title ?? page.slug ?? page.id);
    if (String(page.id) === String(securitySettings.maintenancePageId)) option.selected = true;
    pageSelect.appendChild(option);
  });
  const pageLabel = document.createElement('label');
  pageLabel.textContent = 'Maintenance page';

  const maintenanceSave = document.createElement('button');
  maintenanceSave.type = 'button';
  maintenanceSave.className = 'button primary';
  maintenanceSave.textContent = 'Save maintenance settings';
  maintenanceSave.addEventListener('click', async () => {
    try {
      await saveMaintenanceSettings(ctx.meltdownEmit, ctx.jwt, maintenanceToggle.checked, pageSelect.value);
      shell.status.textContent = 'Maintenance settings saved.';
    } catch (err) {
      shell.status.textContent = `Failed to save maintenance settings: ${errorMessage(err)}`;
    }
  });

  accessTab.append(allowLabel, allowRegistration, installState, accessSave);
  maintenanceTab.append(maintenanceLabel, maintenanceToggle, pageLabel, pageSelect, maintenanceSave);
  ctx.el.replaceChildren(shell.root);
}

async function loadEmbeddedWidgetPanel(key: EmbeddedPanelKey): Promise<EmbeddedPanelModule> {
  const cached = embeddedWidgetPanelPromises.get(key);
  if (cached) return cached;
  const importPath = EMBEDDED_WIDGET_PANEL_PATHS[key];
  const promise = import(/* webpackIgnore: true */ importPath) as Promise<EmbeddedPanelModule>;
  embeddedWidgetPanelPromises.set(key, promise);
  return promise;
}

async function renderEmbeddedWidgetPanel(target: HTMLElement, key: EmbeddedPanelKey) {
  const mod = await loadEmbeddedWidgetPanel(key);
  if (typeof mod.render === 'function') {
    await mod.render(target);
  } else {
    target.textContent = 'This panel is temporarily unavailable.';
  }
}

async function renderModules(ctx: RenderCtx) {
  const shell = createShell('Module Settings', 'Module management and provider integrations.');
  const tabs = createTabSystem(shell.content, shell.tabs);
  const modulesPanel = tabs.addTab('Installed modules');
  const providersPanel = tabs.addTab('Auth providers');

  await renderEmbeddedWidgetPanel(modulesPanel, 'modules');
  await renderEmbeddedWidgetPanel(providersPanel, 'providers');

  ctx.el.replaceChildren(shell.root);
}

async function renderUpdateRows(
  mount: HTMLElement,
  status: HTMLElement,
  ctx: RenderCtx
): Promise<void> {
  mount.textContent = 'Checking module updates...';
  const rows = await fetchUpdateCenterRows(ctx.meltdownEmit, ctx.jwt);
  mount.innerHTML = '';

  if (!rows.length) {
    const empty = document.createElement('p');
    empty.className = 'settings-hint';
    empty.textContent = 'No installed community modules found.';
    mount.appendChild(empty);
    return;
  }

  const availableCount = rows.filter(row => row.available).length;
  const summary = document.createElement('p');
  summary.className = 'settings-hint';
  summary.textContent = availableCount
    ? `${availableCount} module update${availableCount === 1 ? '' : 's'} available.`
    : 'All configured module update sources are current.';

  const list = document.createElement('ul');
  list.className = 'modules-list page-list';

  rows.forEach(row => {
    list.appendChild(renderUpdateRow(row, status, mount, ctx));
  });

  mount.append(summary, list);
}

function renderUpdateRow(
  row: UpdateCenterRow,
  status: HTMLElement,
  mount: HTMLElement,
  ctx: RenderCtx
): HTMLLIElement {
  const item = document.createElement('li');

  const details = document.createElement('div');
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
  nameRow.append(name, badge, actions);

  const meta = document.createElement('div');
  meta.className = 'module-meta';
  meta.textContent = row.latestVersion && row.latestVersion !== row.currentVersion
    ? `${row.meta} -> v${row.latestVersion}`
    : row.meta;

  details.append(nameRow, meta);
  item.appendChild(details);
  return item;
}

async function renderUpdates(ctx: RenderCtx) {
  const shell = createShell('Update Center', 'GitHub release updates for installed community modules.');
  const tabs = createTabSystem(shell.content, shell.tabs);
  const updatesPanel = tabs.addTab('Module updates');

  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'button ghost sm';
  refresh.textContent = 'Check updates';

  const rowsMount = document.createElement('div');
  rowsMount.className = 'modules-list-mount';

  refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    try {
      await renderUpdateRows(rowsMount, shell.status, ctx);
      shell.status.textContent = 'Update check completed.';
    } catch (err) {
      shell.status.textContent = `Update check failed: ${errorMessage(err)}`;
    } finally {
      refresh.disabled = false;
    }
  });

  updatesPanel.append(refresh, rowsMount);
  ctx.el.replaceChildren(shell.root);
  await renderUpdateRows(rowsMount, shell.status, ctx);
}

async function renderUsersAccess(ctx: RenderCtx) {
  const shell = createShell('Users & Access', 'User accounts, roles and registration flow.');
  const tabs = createTabSystem(shell.content, shell.tabs);
  const usersPanel = tabs.addTab('Users');
  const accessPanel = tabs.addTab('Registration');

  await renderEmbeddedWidgetPanel(usersPanel, 'users');
  await renderEmbeddedWidgetPanel(accessPanel, 'access');

  ctx.el.replaceChildren(shell.root);
}

async function renderImportExport(ctx: RenderCtx) {
  const shell = createShell('Import / Export', 'Operational data portability and backups.');
  const tabs = createTabSystem(shell.content, shell.tabs);
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
  ctx.el.replaceChildren(shell.root);
}

const SURFACE_RENDERERS: Record<SurfaceKey, (ctx: RenderCtx) => Promise<void>> = {
  general: renderGeneral,
  design: renderDesign,
  seo: renderSeo,
  security: renderSecurity,
  modules: renderModules,
  updates: renderUpdates,
  'users-access': renderUsersAccess,
  'import-export': renderImportExport
};

export async function renderSettingsSurface(el: HTMLElement, page: any): Promise<boolean> {
  const jwt = (window as any).ADMIN_TOKEN as string;
  const meltdownEmit = (window as any).meltdownEmit as RenderCtx['meltdownEmit'];

  if (!el || !jwt || typeof meltdownEmit !== 'function') {
    return false;
  }

  const slugParts = String(page?.slug || '').split('/').filter(Boolean);
  if (slugParts[0] !== 'settings' || !slugParts[1]) {
    return false;
  }

  const surfaceKey = slugParts[1] as SurfaceKey;
  const renderer = SURFACE_RENDERERS[surfaceKey];
  if (!renderer) {
    return false;
  }

  try {
    await renderer({ el, page, jwt, meltdownEmit });
    return true;
  } catch (err) {
    el.innerHTML = '';
    const error = document.createElement('div');
    error.className = 'error';
    error.textContent = `Failed to load settings surface: ${errorMessage(err)}`;
    el.appendChild(error);
    return true;
  }
}
