import { errorMessage, fetchDesignSettings, fetchGeneralSettings, fetchSecuritySettings, fetchSeoSettings, pickMediaShareUrl, saveAllowRegistration, saveFaviconUrl, saveGeneralSettings, saveGoogleFontsApiKey, saveMaintenanceSettings, saveSeoSettings } from './settingsPanelsData.js';
import { approvedAccessDescriptors, fetchUpdateCenterRows, inspectUpdateCenterRow, installUpdateCenterRow, updateCenterRowLabel, updateInspectionLabel, updateInstallVersion } from './updateCenterData.js';
import { renderUiKitGallery } from './uiKitGallery.js';
import { createFormActions, createFormChoice as createChoice, createFormField } from '/ui/shared/forms/formField.js';
import { createTabSystem } from '/ui/shared/navigation/tabs.js';
const EMBEDDED_WIDGET_PANEL_PATHS = {
    modules: '/ui/widgets/plainspace/admin/modulesListWidget.js',
    providers: '/ui/widgets/plainspace/admin/loginStrategiesWidget.js',
    users: '/ui/widgets/plainspace/admin/usersListWidget.js',
    access: '/ui/widgets/plainspace/admin/accessSettingsWidget.js'
};
const embeddedWidgetPanelPromises = new Map();
function createShell(title, subtitle) {
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
    status.className = 'access-settings-status form-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    root.appendChild(header);
    root.appendChild(tabs);
    root.appendChild(content);
    root.appendChild(status);
    return { root, tabs, content, status };
}
function dialogApi() {
    return window.bpDialog || null;
}
async function alertError(message) {
    const dialog = dialogApi();
    if (dialog?.alert) {
        await dialog.alert(message, { title: 'Error' });
        return;
    }
    alert(message);
}
async function confirmSimple(title, message, confirmLabel) {
    const dialog = dialogApi();
    if (dialog?.confirm) {
        return await dialog.confirm(message, { title, confirmLabel, cancelLabel: 'Cancel' });
    }
    return confirm(message);
}
function makeBadge(text, tone = 'neutral') {
    const badge = document.createElement('span');
    badge.className = `module-access-badge module-access-badge--${tone}`;
    badge.textContent = text;
    return badge;
}
function accessLabel(access) {
    return access.resource && access.action
        ? `${access.resource}.${access.action}`
        : access.event || '';
}
function buildUpdateAccessReviewBody(accessList) {
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
async function reviewUpdateAccess(inspection) {
    const newAccess = Array.isArray(inspection.newRequestedAccess)
        ? inspection.newRequestedAccess
        : [];
    if (!newAccess.length)
        return [];
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
    if (result.action !== 'confirm')
        return null;
    const selected = new Set(Array.from(body.querySelectorAll('input[data-module-access-key]'))
        .filter(input => input.checked)
        .map(input => input.dataset.moduleAccessKey || ''));
    return approvedAccessDescriptors(newAccess.filter(access => selected.has(accessLabel(access))));
}
async function renderGeneral(ctx) {
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
        }
        catch (err) {
            shell.status.textContent = `Failed to save general settings: ${errorMessage(err)}`;
        }
        finally {
            save.disabled = false;
        }
    });
    identity.append(createFormField('Site Title', titleInput), createFormField('Site Description', descInput), createFormActions(save));
    ctx.el.replaceChildren(shell.root);
}
async function renderDesign(ctx) {
    const shell = createShell('Design Settings', 'Branding assets and typography integrations.');
    const tabs = createTabSystem(shell.content, shell.tabs);
    const branding = tabs.addTab('Branding');
    const typography = tabs.addTab('Typography');
    const designSettings = await fetchDesignSettings(ctx.meltdownEmit, ctx.jwt);
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
        }
        catch (err) {
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
        }
        catch (err) {
            shell.status.textContent = `Failed to save favicon: ${errorMessage(err)}`;
        }
    });
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
        }
        catch (err) {
            shell.status.textContent = `Failed to save typography settings: ${errorMessage(err)}`;
        }
    });
    branding.append(createFormField('Favicon URL', favInput), createFormActions(pickBtn, favSave));
    typography.append(createFormField('Google Fonts API Key', fontInput), createFormActions(fontSave));
    ctx.el.replaceChildren(shell.root);
}
async function renderSeo(ctx) {
    const shell = createShell('SEO Settings', 'Search visibility and metadata defaults.');
    const tabs = createTabSystem(shell.content, shell.tabs);
    const defaults = tabs.addTab('Defaults');
    const seoSettings = await fetchSeoSettings(ctx.meltdownEmit, ctx.jwt);
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = seoSettings.titleTemplate;
    const descInput = document.createElement('textarea');
    descInput.value = seoSettings.metaDescription;
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
        }
        catch (err) {
            shell.status.textContent = `Failed to save SEO settings: ${errorMessage(err)}`;
        }
    });
    defaults.append(createFormField('SEO Title Template', titleInput), createFormField('Default Meta Description', descInput), createChoice('Allow Search Engine Indexing', indexInput), createFormActions(save));
    ctx.el.replaceChildren(shell.root);
}
async function renderSecurity(ctx) {
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
    const accessSave = document.createElement('button');
    accessSave.type = 'button';
    accessSave.className = 'button primary';
    accessSave.textContent = 'Save access settings';
    accessSave.addEventListener('click', async () => {
        try {
            await saveAllowRegistration(ctx.meltdownEmit, ctx.jwt, allowRegistration.checked);
            shell.status.textContent = 'Access settings saved.';
        }
        catch (err) {
            shell.status.textContent = `Failed to save access settings: ${errorMessage(err)}`;
        }
    });
    const maintenanceToggle = document.createElement('input');
    maintenanceToggle.type = 'checkbox';
    maintenanceToggle.checked = securitySettings.maintenanceMode;
    const pageSelect = document.createElement('select');
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '-- select page --';
    pageSelect.appendChild(none);
    securitySettings.publicPages.forEach(page => {
        const option = document.createElement('option');
        option.value = String(page.id ?? '');
        option.textContent = String(page.title ?? page.slug ?? page.id);
        if (String(page.id) === String(securitySettings.maintenancePageId))
            option.selected = true;
        pageSelect.appendChild(option);
    });
    const maintenanceSave = document.createElement('button');
    maintenanceSave.type = 'button';
    maintenanceSave.className = 'button primary';
    maintenanceSave.textContent = 'Save maintenance settings';
    maintenanceSave.addEventListener('click', async () => {
        try {
            await saveMaintenanceSettings(ctx.meltdownEmit, ctx.jwt, maintenanceToggle.checked, pageSelect.value);
            shell.status.textContent = 'Maintenance settings saved.';
        }
        catch (err) {
            shell.status.textContent = `Failed to save maintenance settings: ${errorMessage(err)}`;
        }
    });
    accessTab.append(createChoice('Allow public registration', allowRegistration), installState, createFormActions(accessSave));
    maintenanceTab.append(createChoice('Enable maintenance mode', maintenanceToggle), createFormField('Maintenance page', pageSelect), createFormActions(maintenanceSave));
    ctx.el.replaceChildren(shell.root);
}
async function loadEmbeddedWidgetPanel(key) {
    const cached = embeddedWidgetPanelPromises.get(key);
    if (cached)
        return cached;
    const importPath = EMBEDDED_WIDGET_PANEL_PATHS[key];
    const promise = import(/* webpackIgnore: true */ importPath);
    embeddedWidgetPanelPromises.set(key, promise);
    return promise;
}
async function renderEmbeddedWidgetPanel(target, key) {
    const mod = await loadEmbeddedWidgetPanel(key);
    if (typeof mod.render === 'function') {
        await mod.render(target);
    }
    else {
        target.textContent = 'This panel is temporarily unavailable.';
    }
}
async function renderModules(ctx) {
    const shell = createShell('Module Settings', 'Module management and provider integrations.');
    const tabs = createTabSystem(shell.content, shell.tabs);
    const modulesPanel = tabs.addTab('Installed modules');
    const providersPanel = tabs.addTab('Auth providers');
    await renderEmbeddedWidgetPanel(modulesPanel, 'modules');
    await renderEmbeddedWidgetPanel(providersPanel, 'providers');
    ctx.el.replaceChildren(shell.root);
}
async function renderUiKit(ctx) {
    renderUiKitGallery(ctx.el);
}
async function renderUpdateRows(mount, status, ctx) {
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
function renderUpdateRow(row, status, mount, ctx) {
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
    updateButton.addEventListener('click', async (event) => {
        event.stopPropagation();
        updateButton.disabled = true;
        const rowLabel = updateCenterRowLabel(row);
        status.textContent = `Inspecting ${rowLabel} update...`;
        try {
            const inspection = await inspectUpdateCenterRow(ctx.meltdownEmit, ctx.jwt, row);
            let approvedAccess = [];
            if (inspection.requiresAdminApproval) {
                const reviewed = await reviewUpdateAccess(inspection);
                if (reviewed === null) {
                    status.textContent = 'Update cancelled.';
                    return;
                }
                approvedAccess = reviewed;
            }
            else if (!await confirmSimple(`Update ${rowLabel}`, `Install update ${updateInstallVersion(row, inspection)}?`, 'Update')) {
                status.textContent = 'Update cancelled.';
                return;
            }
            status.textContent = `Installing ${rowLabel} update...`;
            await installUpdateCenterRow(ctx.meltdownEmit, ctx.jwt, row, approvedAccess);
            status.textContent = `${rowLabel} update installed.`;
            await renderUpdateRows(mount, status, ctx);
        }
        catch (err) {
            status.textContent = `Update failed: ${errorMessage(err)}`;
            await alertError(`Update failed: ${errorMessage(err)}`);
        }
        finally {
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
async function renderUpdates(ctx) {
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
        }
        catch (err) {
            shell.status.textContent = `Update check failed: ${errorMessage(err)}`;
        }
        finally {
            refresh.disabled = false;
        }
    });
    updatesPanel.append(refresh, rowsMount);
    ctx.el.replaceChildren(shell.root);
    await renderUpdateRows(rowsMount, shell.status, ctx);
}
async function renderUsersAccess(ctx) {
    const shell = createShell('Users & Access', 'User accounts, roles and registration flow.');
    const tabs = createTabSystem(shell.content, shell.tabs);
    const usersPanel = tabs.addTab('Users');
    const accessPanel = tabs.addTab('Registration');
    await renderEmbeddedWidgetPanel(usersPanel, 'users');
    await renderEmbeddedWidgetPanel(accessPanel, 'access');
    ctx.el.replaceChildren(shell.root);
}
async function renderImportExport(ctx) {
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
const SURFACE_RENDERERS = {
    general: renderGeneral,
    design: renderDesign,
    'ui-kit': renderUiKit,
    seo: renderSeo,
    security: renderSecurity,
    modules: renderModules,
    updates: renderUpdates,
    'users-access': renderUsersAccess,
    'import-export': renderImportExport
};
export async function renderSettingsSurface(el, page) {
    const jwt = window.ADMIN_TOKEN;
    const meltdownEmit = window.meltdownEmit;
    if (!el || !jwt || typeof meltdownEmit !== 'function') {
        return false;
    }
    const slugParts = String(page?.slug || '').split('/').filter(Boolean);
    if (slugParts[0] !== 'settings' || !slugParts[1]) {
        return false;
    }
    const surfaceKey = slugParts[1];
    const renderer = SURFACE_RENDERERS[surfaceKey];
    if (!renderer) {
        return false;
    }
    try {
        await renderer({ el, page, jwt, meltdownEmit });
        return true;
    }
    catch (err) {
        el.innerHTML = '';
        const error = document.createElement('div');
        error.className = 'error';
        error.textContent = `Failed to load settings surface: ${errorMessage(err)}`;
        el.appendChild(error);
        return true;
    }
}
