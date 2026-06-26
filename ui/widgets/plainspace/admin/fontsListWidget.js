import { errorMessage, fetchFontProvidersState, refreshFontProviderCatalog, saveGoogleFontsKey, setFontProviderEnabled } from './fontsListData.js';
function icon(name) {
    return typeof window.featherIcon === 'function' ? window.featherIcon(name) : '';
}
export async function render(el) {
    const jwt = window.ADMIN_TOKEN;
    const meltdownEmit = window.meltdownEmit;
    if (!el)
        return;
    try {
        if (typeof meltdownEmit !== 'function')
            throw new Error('meltdownEmit unavailable');
        const state = await fetchFontProvidersState(meltdownEmit, jwt);
        const providers = state.providers;
        let googleFontsKey = state.googleFontsKey;
        const card = document.createElement('div');
        card.className = 'fonts-list-card page-list-card';
        const titleBar = document.createElement('div');
        titleBar.className = 'fonts-title-bar page-title-bar';
        const title = document.createElement('div');
        title.className = 'fonts-title page-title';
        title.textContent = 'Font Providers';
        titleBar.appendChild(title);
        card.appendChild(titleBar);
        const list = document.createElement('ul');
        list.className = 'fonts-list page-list';
        if (!providers.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'No font providers configured. Add one to use custom fonts.';
            list.appendChild(empty);
        }
        else {
            providers.forEach(provider => {
                const li = document.createElement('li');
                const nameRow = document.createElement('div');
                nameRow.className = 'font-name-row';
                const nameEl = document.createElement('span');
                nameEl.className = 'font-name';
                nameEl.textContent = provider.name;
                const actions = document.createElement('span');
                actions.className = 'font-actions';
                const toggleIcon = document.createElement('span');
                toggleIcon.className = 'icon font-toggle-icon';
                toggleIcon.innerHTML = icon(provider.isEnabled ? 'toggle-right' : 'toggle-left');
                toggleIcon.title = provider.isEnabled ? 'Disable' : 'Enable';
                toggleIcon.addEventListener('click', async (ev) => {
                    ev.stopPropagation();
                    try {
                        await setFontProviderEnabled(meltdownEmit, jwt, provider.name, !provider.isEnabled);
                        provider.isEnabled = !provider.isEnabled;
                        toggleIcon.innerHTML = icon(provider.isEnabled ? 'toggle-right' : 'toggle-left');
                        toggleIcon.title = provider.isEnabled ? 'Disable' : 'Enable';
                    }
                    catch (err) {
                        alert(`Error: ${errorMessage(err)}`);
                    }
                });
                actions.appendChild(toggleIcon);
                nameRow.appendChild(nameEl);
                nameRow.appendChild(actions);
                const desc = document.createElement('div');
                desc.className = 'font-desc';
                desc.textContent = provider.description || '';
                li.appendChild(nameRow);
                li.appendChild(desc);
                const details = document.createElement('div');
                details.className = 'font-provider-details';
                details.style.display = 'none';
                if (provider.name === 'googleFonts') {
                    const keyLabel = document.createElement('label');
                    keyLabel.textContent = 'Google Fonts API Key';
                    keyLabel.style.display = 'block';
                    const keyInput = document.createElement('input');
                    keyInput.type = 'text';
                    keyInput.placeholder = 'AIza...';
                    keyInput.value = googleFontsKey;
                    keyInput.style.minWidth = '320px';
                    const help = document.createElement('div');
                    help.className = 'settings-hint';
                    help.textContent = 'Paste your Webfonts API key to load the full catalog.';
                    const saveBtn = document.createElement('button');
                    saveBtn.type = 'button';
                    saveBtn.textContent = 'Save Key';
                    saveBtn.addEventListener('click', async (ev) => {
                        ev.stopPropagation();
                        try {
                            googleFontsKey = await saveGoogleFontsKey(meltdownEmit, jwt, keyInput.value);
                            alert('Saved Google Fonts API key. Click "Refresh Catalog" to update the list.');
                        }
                        catch (err) {
                            alert(`Error saving key: ${errorMessage(err)}`);
                        }
                    });
                    const refreshBtn = document.createElement('button');
                    refreshBtn.type = 'button';
                    refreshBtn.textContent = 'Refresh Catalog';
                    refreshBtn.style.marginLeft = '8px';
                    refreshBtn.addEventListener('click', async (ev) => {
                        ev.stopPropagation();
                        try {
                            const wasEnabled = Boolean(provider.isEnabled);
                            await refreshFontProviderCatalog(meltdownEmit, jwt, provider.name, wasEnabled);
                            provider.isEnabled = true;
                            toggleIcon.innerHTML = icon('toggle-right');
                            toggleIcon.title = 'Disable';
                            alert('Google Fonts catalog refresh triggered. Open the editor and try the font dropdown.');
                        }
                        catch (err) {
                            alert(`Error refreshing catalog: ${errorMessage(err)}`);
                        }
                    });
                    details.appendChild(keyLabel);
                    details.appendChild(keyInput);
                    details.appendChild(saveBtn);
                    details.appendChild(refreshBtn);
                    details.appendChild(help);
                }
                nameRow.addEventListener('click', () => {
                    details.style.display = details.style.display === 'none' ? '' : 'none';
                });
                li.appendChild(details);
                list.appendChild(li);
            });
        }
        card.appendChild(list);
        el.innerHTML = '';
        el.appendChild(card);
    }
    catch (err) {
        el.innerHTML = `<div class="error">Failed to load providers: ${errorMessage(err)}</div>`;
    }
}
