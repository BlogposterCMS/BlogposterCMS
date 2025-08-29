export async function render(el) {
  const jwt = window.ADMIN_TOKEN;
  const meltdownEmit = window.meltdownEmit;

  try {
    const [title, desc, isMaint, pageId, faviconUrl, pagesRes, googleFontsKey] = await Promise.all([
      meltdownEmit('getSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'SITE_TITLE' }),
      meltdownEmit('getSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'SITE_DESC' }),
      meltdownEmit('getSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'MAINTENANCE_MODE' }),
      meltdownEmit('getSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'MAINTENANCE_PAGE_ID' }),
      meltdownEmit('getSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'FAVICON_URL' }),
      meltdownEmit('getAllPages', { jwt, moduleName: 'pagesManager', moduleType: 'core' }),
      meltdownEmit('getSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'GOOGLE_FONTS_API_KEY' })
    ]);

    const pages = Array.isArray(pagesRes) ? pagesRes : (pagesRes?.data ?? []);
    const maintenancePage = pages.find(p => String(p.id) === String(pageId));

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
    titleInput.value = title || '';
    titleInput.addEventListener('change', async () => {
      try {
        await meltdownEmit('setSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'SITE_TITLE', value: titleInput.value });
      } catch (err) {
        alert('Error saving site title: ' + err.message);
      }
    });

    const descLabel = document.createElement('label');
    descLabel.textContent = 'Site Description';
    const descInput = document.createElement('textarea');
    descInput.value = desc || '';
    descInput.addEventListener('change', async () => {
      try {
        await meltdownEmit('setSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'SITE_DESC', value: descInput.value });
      } catch (err) {
        alert('Error saving description: ' + err.message);
      }
    });

    const maintToggleLabel = document.createElement('label');
    maintToggleLabel.textContent = 'Maintenance Mode';
    const maintToggle = document.createElement('input');
    maintToggle.type = 'checkbox';
    maintToggle.checked = isMaint === 'true';
    maintToggle.addEventListener('change', async () => {
      try {
        await meltdownEmit('setSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'MAINTENANCE_MODE', value: maintToggle.checked ? 'true' : 'false' });
      } catch (err) {
        alert('Error toggling maintenance mode: ' + err.message);
      }
    });

    const pageLabel = document.createElement('label');
    pageLabel.textContent = 'Maintenance Page';
    const pageSelect = document.createElement('select');
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '-- select page --';
    pageSelect.appendChild(emptyOpt);

    pages.filter(p => p.lane === 'public').forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.title;
      if (maintenancePage && String(p.id) === String(maintenancePage.id)) {
        opt.selected = true;
      }
      pageSelect.appendChild(opt);
    });

    pageSelect.addEventListener('change', async () => {
      try {
        await meltdownEmit('setSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'MAINTENANCE_PAGE_ID', value: pageSelect.value });
      } catch (err) {
        alert('Error setting maintenance page: ' + err.message);
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
    if (faviconUrl) favImg.src = faviconUrl;
    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.textContent = 'Choose...';
    favBtn.addEventListener('click', async () => {
      try {
        const { shareURL, cancelled } = await meltdownEmit('openMediaExplorer', { jwt });
        if (!cancelled && shareURL) {
          favImg.src = shareURL;
          await meltdownEmit('setSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'FAVICON_URL', value: shareURL });
        }
      } catch (err) {
        alert('Error selecting favicon: ' + err.message);
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

    // Google Fonts API key (optional)
    const gKeyLabel = document.createElement('label');
    gKeyLabel.textContent = 'Google Fonts API Key (optional)';
    const gKeyInput = document.createElement('input');
    gKeyInput.type = 'text';
    gKeyInput.placeholder = 'AIza...';
    gKeyInput.value = (googleFontsKey || '').trim();
    const gKeyHelp = document.createElement('div');
    gKeyHelp.className = 'settings-hint';
    gKeyHelp.textContent = 'Used to fetch the full Google Fonts catalog. Leave empty to use defaults.';
    gKeyInput.addEventListener('change', async () => {
      try {
        await meltdownEmit('setSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'GOOGLE_FONTS_API_KEY', value: gKeyInput.value.trim() });
        alert('Saved. Re-enable Google Fonts provider to refresh the catalog.');
      } catch (err) {
        alert('Error saving API key: ' + err.message);
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
  } catch (err) {
    el.innerHTML = `<div class="error">Failed to load settings: ${err.message}</div>`;
  }
}
