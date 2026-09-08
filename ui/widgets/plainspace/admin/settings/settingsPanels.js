import { errorMessage, fetchDesignSettings, fetchGeneralSettings, fetchSecuritySettings, fetchSeoSettings, pickMediaShareUrl, saveFaviconUrl, saveGeneralSettings, saveGoogleFontsApiKey, saveMaintenanceSettings, saveSeoSettings } from './settingsPanelsData.js';
import { approvedAccessDescriptors, fetchUpdateCenterRows, inspectUpdateCenterRow, installUpdateCenterRow, updateCenterRowLabel, updateInspectionLabel, updateInstallVersion } from './updateCenterData.js';
import { renderUiKitGallery } from './uiKitGallery.js';
import { renderCoreUpdatePanel } from './coreUpdatePanel.js';
import { createFormActions, createFormChoice as createChoice, createFormField } from '/ui/shared/forms/formField.js';
import { createTabSystem } from '/ui/shared/navigation/tabs.js';
import { registerWorkspaceChanges } from '../../../../shared/navigation/workspaceChanges.js';
import { registerWorkspaceAgent, patchAgentForm, readAgentForm, agentString } from '../../../../shared/agent/workspaceAgent.js';
const EMBEDDED_WIDGET_PANEL_PATHS = {
    modules: '/ui/widgets/plainspace/admin/modulesListWidget.js',
    providers: '/ui/widgets/plainspace/admin/loginStrategiesWidget.js',
    users: '/ui/widgets/plainspace/admin/usersListWidget.js',
    access: '/ui/widgets/plainspace/admin/accessSettingsWidget.js',
    'user-edit': '/ui/widgets/plainspace/admin/userEditWidget.js',
    'provider-edit': '/ui/widgets/plainspace/admin/loginStrategyEditWidget.js'
};
const embeddedWidgetPanelPromises = new Map();
function createShell(title, subtitle) {
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
    const savedValues = new Map();
    let saving = false;
    const agentGroups = [];
    const saveControls = [];
    const valueOf = (field) => field instanceof HTMLInputElement && field.type === 'checkbox'
        ? String(field.checked) : field.value;
    registerWorkspaceChanges(root, {
        isDirty: () => [...savedValues].some(([field, value]) => valueOf(field) !== value),
        isBusy: () => saving
    });
    // Each tab keeps its own saved baseline; saving branding must not clear a
    // pending typography edit. Lock the shared surface while a write is pending.
    function bindSave(button, fields, action, message, agent) {
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
            state.textContent = dirty ? 'Unsaved changes' : 'Saved';
        };
        fields.forEach(field => {
            field.addEventListener('input', refresh);
            field.addEventListener('change', refresh);
        });
        discard.addEventListener('click', () => {
            if (saving)
                return;
            fields.forEach(field => {
                const value = savedValues.get(field) || '';
                if (field instanceof HTMLInputElement && field.type === 'checkbox')
                    field.checked = value === 'true';
                else
                    field.value = value;
                field.dispatchEvent(new Event('change', { bubbles: true }));
            });
            status.textContent = '';
            refresh();
        });
        refresh();
        saveControls.push({ button, fields, discard, state });
        async function save(propagate = false) {
            if (saving)
                return;
            saving = true;
            content.inert = true;
            button.disabled = true;
            status.setAttribute('role', 'status');
            status.textContent = 'Saving…';
            try {
                await action();
                fields.forEach(field => savedValues.set(field, valueOf(field)));
                status.textContent = message;
            }
            catch (err) {
                status.setAttribute('role', 'alert');
                status.textContent = `SETTINGS_SAVE_FAILED: ${errorMessage(err)}`;
                if (propagate)
                    throw err;
            }
            finally {
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
    function mount(parent) {
        saveControls.forEach(({ button, discard, state }) => {
            button.parentElement?.classList.add('settings-save-bar');
            button.parentElement?.append(discard, state);
        });
        parent.replaceChildren(root);
        if (!agentGroups.length)
            return;
        registerWorkspaceAgent({ root, id: `settings-${agentGroups[0].id}`, title,
            read: () => ({ dirty: [...savedValues].some(([field, value]) => valueOf(field) !== value), busy: saving,
                error: status.getAttribute('role') === 'alert' ? status.textContent : null,
                groups: agentGroups.map(group => ({ id: group.id, fields: readAgentForm(root, group.fields) })) }),
            actions: [
                { action: 'settings.updateDraft', label: 'Update settings fields', acceptsDraft: true,
                    params: [{ name: 'group', type: 'string', required: true }, { name: 'fields', type: 'object', required: true }],
                    run: p => {
                        const group = agentGroups.find(group => group.id === agentString(p, 'group'));
                        if (!group)
                            throw new Error('SETTINGS_AGENT_GROUP_UNAVAILABLE');
                        patchAgentForm(root, p.fields, group.fields);
                    } },
                { action: 'settings.save', label: 'Save a settings group', acceptsDraft: true, confirm: true,
                    params: [{ name: 'group', type: 'string', required: true }], run: p => {
                        const group = agentGroups.find(group => group.id === agentString(p, 'group'));
                        if (!group)
                            throw new Error('SETTINGS_AGENT_GROUP_UNAVAILABLE');
                        return group.save();
                    } }
            ] });
    }
    return { root, tabs, content, status, bindSave, mount };
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
    const shell = createShell('General Settings', 'Set the name and description used across your website.');
    const tabs = createTabSystem(shell.content, shell.tabs, { variant: 'underline' });
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
    identity.append(createFormField('Site Title', titleInput, { hint: 'The name of your website.' }), createFormField('Site Description', descInput, { hint: 'A short description of what visitors will find here.' }), createFormActions(save));
    shell.mount(ctx.el);
}
async function renderDesign(ctx) {
    const shell = createShell('Design Settings', 'Manage your browser icon and font connection. Page layouts live in Design Studio.');
    const tabs = createTabSystem(shell.content, shell.tabs, { variant: 'underline' });
    const branding = tabs.addTab('Branding');
    branding.classList.add('settings-section--form');
    const typography = tabs.addTab('Typography');
    typography.classList.add('settings-section--form');
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
                favInput.dispatchEvent(new Event('input', { bubbles: true }));
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
    shell.bindSave(favSave, [favInput], () => saveFaviconUrl(ctx.meltdownEmit, ctx.jwt, favInput.value.trim()), 'Favicon updated.', { id: 'branding', fields: { faviconUrl: favInput } });
    const fontInput = document.createElement('input');
    fontInput.type = 'password';
    fontInput.autocomplete = 'off';
    fontInput.value = designSettings.googleFontsApiKey;
    const fontSave = document.createElement('button');
    fontSave.type = 'button';
    fontSave.className = 'button primary';
    fontSave.textContent = 'Save typography settings';
    shell.bindSave(fontSave, [fontInput], () => saveGoogleFontsApiKey(ctx.meltdownEmit, ctx.jwt, fontInput.value.trim()), 'Typography settings saved.');
    branding.append(createFormField('Favicon URL', favInput, { hint: 'The small icon shown in browser tabs. Choose an image from your media library or enter its URL.' }), createFormActions(pickBtn, favSave));
    typography.append(createFormField('Google Fonts API Key', fontInput, { hint: 'Optional connection for the font library. Leave empty if you do not use it.' }), createFormActions(fontSave));
    shell.mount(ctx.el);
}
async function renderSeo(ctx) {
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
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'button primary';
    save.textContent = 'Save SEO settings';
    shell.bindSave(save, [titleInput, descInput, indexInput], () => saveSeoSettings(ctx.meltdownEmit, ctx.jwt, {
        titleTemplate: titleInput.value.trim(), metaDescription: descInput.value.trim(), indexingEnabled: indexInput.checked
    }), 'SEO settings saved.', { id: 'seo', fields: { titleTemplate: titleInput, metaDescription: descInput, indexingEnabled: indexInput } });
    defaults.append(createFormField('SEO Title Template', titleInput, { hint: 'The default title pattern used by your SEO integration.' }), createFormField('Default Meta Description', descInput), createChoice('Allow Search Engine Indexing', indexInput), createFormActions(save));
    shell.mount(ctx.el);
}
async function renderSecurity(ctx) {
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
        if (String(page.id) === String(securitySettings.maintenancePageId))
            option.selected = true;
        pageSelect.appendChild(option);
    });
    const maintenanceSave = document.createElement('button');
    maintenanceSave.type = 'button';
    maintenanceSave.className = 'button primary';
    maintenanceSave.textContent = 'Save maintenance settings';
    shell.bindSave(maintenanceSave, [maintenanceToggle, pageSelect], () => saveMaintenanceSettings(ctx.meltdownEmit, ctx.jwt, maintenanceToggle.checked, pageSelect.value), 'Maintenance settings saved.', { id: 'maintenance', fields: { maintenanceMode: maintenanceToggle, maintenancePageId: pageSelect } });
    maintenanceTab.append(createChoice('Enable maintenance mode', maintenanceToggle), createFormField('Maintenance page', pageSelect, { hint: 'Visitors see this page while maintenance mode is enabled. Administrator access remains available.' }), createFormActions(maintenanceSave));
    shell.mount(ctx.el);
}
async function loadEmbeddedWidgetPanel(key) {
    const cached = embeddedWidgetPanelPromises.get(key);
    if (cached)
        return cached;
    const importPath = EMBEDDED_WIDGET_PANEL_PATHS[key];
    const promise = import(/* webpackIgnore: true */ importPath).catch(error => {
        embeddedWidgetPanelPromises.delete(key);
        throw error;
    });
    embeddedWidgetPanelPromises.set(key, promise);
    return promise;
}
async function renderEmbeddedWidgetPanel(target, key, options) {
    try {
        const mod = await loadEmbeddedWidgetPanel(key);
        if (typeof mod.render !== 'function')
            throw new Error('SETTINGS_PANEL_UNAVAILABLE');
        await mod.render(target, options);
    }
    catch (err) {
        // A renderer composing the page's tablist must retry the whole page, or
        // old tab buttons would retain references to detached panels.
        if (options?.tabs || options?.tabsHost)
            throw err;
        const error = document.createElement('p');
        error.setAttribute('role', 'alert');
        error.textContent = `SETTINGS_PANEL_LOAD_FAILED: ${errorMessage(err)}`;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'button ghost';
        retry.textContent = 'Retry';
        retry.addEventListener('click', () => {
            target.replaceChildren();
            void renderEmbeddedWidgetPanel(target, key, options);
        });
        target.append(error, retry);
    }
}
async function renderModules(ctx) {
    const shell = createShell('Modules', 'Manage installed extensions and inspect the core modules that power your site.');
    shell.mount(ctx.el);
    await renderEmbeddedWidgetPanel(shell.content, 'modules', { tabsHost: shell.tabs });
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
    const shell = createShell('Update Center', 'Keep Blogposter and your installed modules up to date.');
    const tabs = createTabSystem(shell.content, shell.tabs, { variant: 'underline' });
    const corePanel = tabs.addTab('Blogposter');
    corePanel.classList.add('settings-section--form');
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
    shell.mount(ctx.el);
    await renderCoreUpdatePanel(corePanel, ctx.meltdownEmit, ctx.jwt);
    await renderUpdateRows(rowsMount, shell.status, ctx);
}
async function renderUsersAccess(ctx) {
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
async function renderImportExport(ctx) {
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
async function renderAccountDetail(ctx, key) {
    const shell = createShell(key === 'user-edit' ? 'Edit user' : 'Configure sign-in', key === 'user-edit' ? 'Manage profile information and account permissions.' : 'Configure the selected sign-in provider.');
    const back = document.createElement('a');
    back.className = 'button ghost sm';
    back.textContent = 'Back to users & access';
    back.href = '/admin/settings/users-access';
    shell.tabs.append(back);
    shell.mount(ctx.el);
    await renderEmbeddedWidgetPanel(shell.content, key, key === 'user-edit' ? { userId: String(ctx.page.slug).split('/')[3] } : undefined);
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
    'user-edit': ctx => renderAccountDetail(ctx, 'user-edit'),
    'provider-edit': ctx => renderAccountDetail(ctx, 'provider-edit'),
    'import-export': renderImportExport
};
export async function renderSettingsSurface(el, page) {
    const jwt = window.ADMIN_TOKEN;
    const meltdownEmit = window.meltdownEmit;
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
            : slugParts[1] || 'general');
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
    }
    catch (err) {
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
