export async function render(el) {
  const jwt = window.ADMIN_TOKEN;
  const meltdownEmit = window.meltdownEmit;

  try {
    const res = await meltdownEmit('listFontProviders', {
      jwt,
      moduleName: 'fontsManager',
      moduleType: 'core'
    });
    const providers = Array.isArray(res) ? res : (res?.data ?? []);

    // Prefetch current Google Fonts API key from settings (if present)
    let googleFontsKey = '';
    try {
      const keyRes = await meltdownEmit('getSetting', {
        jwt,
        moduleName: 'settingsManager',
        moduleType: 'core',
        key: 'GOOGLE_FONTS_API_KEY'
      });
      googleFontsKey = String(keyRes || '').trim();
    } catch (_) {}

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
    } else {
      providers.forEach(p => {
        const li = document.createElement('li');

        const nameRow = document.createElement('div');
        nameRow.className = 'font-name-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'font-name';
        nameEl.textContent = p.name;

        const actions = document.createElement('span');
        actions.className = 'font-actions';

        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'icon font-toggle-icon';
        toggleIcon.innerHTML = window.featherIcon(p.isEnabled ? 'toggle-right' : 'toggle-left');
        toggleIcon.title = p.isEnabled ? 'Disable' : 'Enable';
        toggleIcon.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          try {
            await meltdownEmit('setFontProviderEnabled', {
              jwt,
              moduleName: 'fontsManager',
              moduleType: 'core',
              providerName: p.name,
              enabled: !p.isEnabled
            });
            p.isEnabled = !p.isEnabled;
            toggleIcon.innerHTML = window.featherIcon(p.isEnabled ? 'toggle-right' : 'toggle-left');
            toggleIcon.title = p.isEnabled ? 'Disable' : 'Enable';
          } catch (err) {
            alert('Error: ' + err.message);
          }
        });

        actions.appendChild(toggleIcon);
        nameRow.appendChild(nameEl);
        nameRow.appendChild(actions);

        const desc = document.createElement('div');
        desc.className = 'font-desc';
        desc.textContent = p.description || '';

        li.appendChild(nameRow);
        li.appendChild(desc);

        // Details panel for provider-specific settings
        const details = document.createElement('div');
        details.className = 'font-provider-details';
        details.style.display = 'none';

        // Show Google Fonts API key field within this widget (user-friendly)
        if (p.name === 'googleFonts') {
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
              await meltdownEmit('setSetting', {
                jwt,
                moduleName: 'settingsManager',
                moduleType: 'core',
                key: 'GOOGLE_FONTS_API_KEY',
                value: keyInput.value.trim()
              });
              googleFontsKey = keyInput.value.trim();
              alert('Saved Google Fonts API key. Click “Refresh Catalog” to update the list.');
            } catch (err) {
              alert('Error saving key: ' + err.message);
            }
          });

          const refreshBtn = document.createElement('button');
          refreshBtn.type = 'button';
          refreshBtn.textContent = 'Refresh Catalog';
          refreshBtn.style.marginLeft = '8px';
          refreshBtn.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            try {
              // Toggle provider to trigger init (catalog fetch)
              const wasEnabled = !!p.isEnabled;
              if (wasEnabled) {
                await meltdownEmit('setFontProviderEnabled', { jwt, moduleName: 'fontsManager', moduleType: 'core', providerName: p.name, enabled: false });
              }
              await meltdownEmit('setFontProviderEnabled', { jwt, moduleName: 'fontsManager', moduleType: 'core', providerName: p.name, enabled: true });
              p.isEnabled = true;
              toggleIcon.innerHTML = window.featherIcon('toggle-right');
              toggleIcon.title = 'Disable';
              alert('Google Fonts catalog refresh triggered. Open the editor and try the font dropdown.');
            } catch (err) {
              alert('Error refreshing catalog: ' + err.message);
            }
          });

          details.appendChild(keyLabel);
          details.appendChild(keyInput);
          details.appendChild(saveBtn);
          details.appendChild(refreshBtn);
          details.appendChild(help);
        }

        // Toggle details on name row click
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
  } catch (err) {
    el.innerHTML = `<div class="error">Failed to load providers: ${err.message}</div>`;
  }
}
