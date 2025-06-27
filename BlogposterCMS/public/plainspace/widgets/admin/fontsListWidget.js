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
        toggleIcon.addEventListener('click', async () => {
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
