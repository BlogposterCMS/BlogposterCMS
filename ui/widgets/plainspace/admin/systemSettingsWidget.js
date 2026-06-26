import { errorMessage, fetchSystemSettings, pickFaviconUrl, setSystemSetting } from './systemSettingsData.js';
export async function render(el) {
    const jwt = window.ADMIN_TOKEN;
    const meltdownEmit = window.meltdownEmit;
    if (!el)
        return;
    try {
        if (typeof meltdownEmit !== 'function')
            throw new Error('meltdownEmit unavailable');
        const settings = await fetchSystemSettings(meltdownEmit, jwt);
        const card = document.createElement('div');
        card.className = 'system-settings-card page-list-card';
        const titleBar = document.createElement('div');
        titleBar.className = 'system-settings-title-bar page-title-bar';
        const hTitle = document.createElement('div');
        hTitle.className = 'system-settings-title page-title';
        hTitle.textContent = 'System Settings';
        titleBar.appendChild(hTitle);
        card.appendChild(titleBar);
        const section = document.createElement('div');
        section.className = 'settings-section';
        const titleLabel = document.createElement('label');
        titleLabel.textContent = 'Site Title';
        const titleInput = document.createElement('input');
        titleInput.type = 'text';
        titleInput.value = settings.siteTitle;
        titleInput.addEventListener('change', async () => {
            try {
                await setSystemSetting(meltdownEmit, jwt, 'SITE_TITLE', titleInput.value);
            }
            catch (err) {
                alert(`Error saving site title: ${errorMessage(err)}`);
            }
        });
        const descLabel = document.createElement('label');
        descLabel.textContent = 'Site Description';
        const descInput = document.createElement('textarea');
        descInput.value = settings.siteDescription;
        descInput.addEventListener('change', async () => {
            try {
                await setSystemSetting(meltdownEmit, jwt, 'SITE_DESC', descInput.value);
            }
            catch (err) {
                alert(`Error saving description: ${errorMessage(err)}`);
            }
        });
        const maintToggleLabel = document.createElement('label');
        maintToggleLabel.textContent = 'Maintenance Mode';
        const maintToggle = document.createElement('input');
        maintToggle.type = 'checkbox';
        maintToggle.checked = settings.maintenanceMode;
        maintToggle.addEventListener('change', async () => {
            try {
                await setSystemSetting(meltdownEmit, jwt, 'MAINTENANCE_MODE', maintToggle.checked ? 'true' : 'false');
            }
            catch (err) {
                alert(`Error toggling maintenance mode: ${errorMessage(err)}`);
            }
        });
        const pageLabel = document.createElement('label');
        pageLabel.textContent = 'Maintenance Page';
        const pageSelect = document.createElement('select');
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '-- select page --';
        pageSelect.appendChild(emptyOpt);
        settings.pages.filter(page => page.lane === 'public').forEach(page => {
            const opt = document.createElement('option');
            opt.value = String(page.id ?? '');
            opt.textContent = page.title || String(page.id ?? '');
            if (settings.maintenancePage && String(page.id) === String(settings.maintenancePage.id)) {
                opt.selected = true;
            }
            pageSelect.appendChild(opt);
        });
        pageSelect.addEventListener('change', async () => {
            try {
                await setSystemSetting(meltdownEmit, jwt, 'MAINTENANCE_PAGE_ID', pageSelect.value);
            }
            catch (err) {
                alert(`Error setting maintenance page: ${errorMessage(err)}`);
            }
        });
        const titleDiv = document.createElement('div');
        titleDiv.appendChild(titleLabel);
        titleDiv.appendChild(titleInput);
        const descDiv = document.createElement('div');
        descDiv.appendChild(descLabel);
        descDiv.appendChild(descInput);
        const maintDiv = document.createElement('div');
        maintDiv.appendChild(maintToggleLabel);
        maintDiv.appendChild(maintToggle);
        const pageDiv = document.createElement('div');
        pageDiv.appendChild(pageLabel);
        pageDiv.appendChild(pageSelect);
        const favLabel = document.createElement('label');
        favLabel.textContent = 'Favicon';
        const favWrapper = document.createElement('div');
        favWrapper.className = 'favicon-picker';
        const favImg = document.createElement('img');
        favImg.className = 'favicon-preview';
        const favicon = settings.faviconUrl;
        if (favicon)
            favImg.src = favicon;
        const favBtn = document.createElement('button');
        favBtn.type = 'button';
        favBtn.textContent = 'Choose...';
        favBtn.addEventListener('click', async () => {
            try {
                const shareURL = await pickFaviconUrl(meltdownEmit, jwt);
                if (shareURL) {
                    favImg.src = shareURL;
                    await setSystemSetting(meltdownEmit, jwt, 'FAVICON_URL', shareURL);
                }
            }
            catch (err) {
                alert(`Error selecting favicon: ${errorMessage(err)}`);
            }
        });
        favWrapper.appendChild(favImg);
        favWrapper.appendChild(favBtn);
        const favDiv = document.createElement('div');
        favDiv.appendChild(favLabel);
        favDiv.appendChild(favWrapper);
        section.appendChild(titleDiv);
        section.appendChild(descDiv);
        section.appendChild(maintDiv);
        section.appendChild(pageDiv);
        section.appendChild(favDiv);
        const gKeyLabel = document.createElement('label');
        gKeyLabel.textContent = 'Google Fonts API Key (optional)';
        const gKeyInput = document.createElement('input');
        gKeyInput.type = 'text';
        gKeyInput.placeholder = 'AIza...';
        gKeyInput.value = settings.googleFontsApiKey;
        const gKeyHelp = document.createElement('div');
        gKeyHelp.className = 'settings-hint';
        gKeyHelp.textContent = 'Used to fetch the full Google Fonts catalog. Leave empty to use defaults.';
        gKeyInput.addEventListener('change', async () => {
            try {
                await setSystemSetting(meltdownEmit, jwt, 'GOOGLE_FONTS_API_KEY', gKeyInput.value.trim());
                alert('Saved. Re-enable Google Fonts provider to refresh the catalog.');
            }
            catch (err) {
                alert(`Error saving API key: ${errorMessage(err)}`);
            }
        });
        const gKeyDiv = document.createElement('div');
        gKeyDiv.appendChild(gKeyLabel);
        gKeyDiv.appendChild(gKeyInput);
        gKeyDiv.appendChild(gKeyHelp);
        section.appendChild(gKeyDiv);
        card.appendChild(section);
        el.innerHTML = '';
        el.appendChild(card);
    }
    catch (err) {
        el.innerHTML = `<div class="error">Failed to load settings: ${errorMessage(err)}</div>`;
    }
}
