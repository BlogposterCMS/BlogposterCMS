import { errorMessage, fetchDesignSettings, fetchGeneralSettings, fetchSecuritySettings, fetchSeoSettings, pickMediaShareUrl, saveAllowRegistration, saveFaviconUrl, saveGeneralSettings, saveGoogleFontsApiKey, saveMaintenanceSettings, saveSeoSettings } from './settingsPanelsData.js';
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
    status.className = 'access-settings-status';
    root.appendChild(header);
    root.appendChild(tabs);
    root.appendChild(content);
    root.appendChild(status);
    return { root, tabs, content, status };
}
function createTabSystem(container, tabsHost) {
    const tabs = [];
    const select = (index) => {
        tabs.forEach((tab, i) => {
            const active = i === index;
            tab.button.classList.toggle('active', active);
            tab.button.setAttribute('aria-selected', String(active));
            tab.panel.hidden = !active;
        });
    };
    const addTab = (label) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button ghost sm';
        button.textContent = label;
        const panel = document.createElement('section');
        panel.className = 'settings-section';
        panel.hidden = true;
        button.addEventListener('click', () => {
            const idx = tabs.findIndex(tab => tab.button === button);
            if (idx >= 0)
                select(idx);
        });
        tabs.push({ button, panel });
        tabsHost.appendChild(button);
        container.appendChild(panel);
        if (tabs.length === 1)
            select(0);
        return panel;
    };
    return { addTab };
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
    const titleLabel = document.createElement('label');
    titleLabel.textContent = 'Site Title';
    const descLabel = document.createElement('label');
    descLabel.textContent = 'Site Description';
    identity.append(titleLabel, titleInput, descLabel, descInput, save);
    ctx.el.replaceChildren(shell.root);
}
async function renderDesign(ctx) {
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
        }
        catch (err) {
            shell.status.textContent = `Failed to save typography settings: ${errorMessage(err)}`;
        }
    });
    branding.append(favLabel, favInput, pickBtn, favSave);
    typography.append(fontLabel, fontInput, fontSave);
    ctx.el.replaceChildren(shell.root);
}
async function renderSeo(ctx) {
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
        }
        catch (err) {
            shell.status.textContent = `Failed to save SEO settings: ${errorMessage(err)}`;
        }
    });
    defaults.append(titleLabel, titleInput, descLabel, descInput, indexLabel, indexInput, save);
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
        }
        catch (err) {
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
        if (String(page.id) === String(securitySettings.maintenancePageId))
            option.selected = true;
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
        }
        catch (err) {
            shell.status.textContent = `Failed to save maintenance settings: ${errorMessage(err)}`;
        }
    });
    accessTab.append(allowLabel, allowRegistration, installState, accessSave);
    maintenanceTab.append(maintenanceLabel, maintenanceToggle, pageLabel, pageSelect, maintenanceSave);
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
    seo: renderSeo,
    security: renderSecurity,
    modules: renderModules,
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
