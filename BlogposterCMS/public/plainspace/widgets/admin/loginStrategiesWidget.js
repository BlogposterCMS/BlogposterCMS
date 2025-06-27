export async function render(el) {
  const jwt = window.ADMIN_TOKEN;
  const meltdownEmit = window.meltdownEmit;

  try {
    const res = await meltdownEmit('listLoginStrategies', {
      jwt,
      moduleName: 'auth',
      moduleType: 'core'
    });
    let strategies = Array.isArray(res) ? res : (res?.data ?? []);
    strategies = strategies.filter(s => s.name !== 'adminLocal');

    const card = document.createElement('div');
    card.className = 'login-strategies-card page-list-card';

    const titleBar = document.createElement('div');
    titleBar.className = 'login-strategy-title-bar page-title-bar';
    const title = document.createElement('div');
    title.className = 'login-strategy-title page-title';
    title.textContent = 'Login Strategies';
    titleBar.appendChild(title);
    card.appendChild(titleBar);

    const list = document.createElement('ul');
    list.className = 'login-strategies-list';

    if (!strategies.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No strategies found.';
      list.appendChild(empty);
    } else {
      strategies.forEach(s => {
        const li = document.createElement('li');

        const nameRow = document.createElement('div');
        nameRow.className = 'login-strategy-name-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'login-strategy-name';
        nameEl.textContent = s.name;

        const scopeEl = document.createElement('span');
        scopeEl.className = 'login-strategy-scope';
        scopeEl.textContent = `(${s.scope || 'admin'})`;

        const actions = document.createElement('span');
        actions.className = 'login-strategy-actions page-actions';

        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'icon toggle-strategy';
        toggleIcon.innerHTML = window.featherIcon(s.isEnabled ? 'toggle-right' : 'toggle-left');
        toggleIcon.title = s.isEnabled ? 'Disable' : 'Enable';
        toggleIcon.addEventListener('click', async () => {
          try {
            await meltdownEmit('setLoginStrategyEnabled', {
              jwt,
              moduleName: 'auth',
              moduleType: 'core',
              strategyName: s.name,
              enabled: !s.isEnabled
            });
            s.isEnabled = !s.isEnabled;
            toggleIcon.innerHTML = window.featherIcon(s.isEnabled ? 'toggle-right' : 'toggle-left');
            toggleIcon.title = s.isEnabled ? 'Disable' : 'Enable';
          } catch (err) {
            alert('Error: ' + err.message);
          }
        });

        const editIcon = document.createElement('span');
        editIcon.className = 'icon edit-strategy';
        editIcon.innerHTML = window.featherIcon('edit');
        editIcon.title = 'Edit strategy';
        editIcon.addEventListener('click', () => {
          const url = `/admin/settings/login/edit?strategy=${encodeURIComponent(s.name)}`;
          window.location.href = url;
        });

        actions.appendChild(toggleIcon);
        actions.appendChild(editIcon);

        nameRow.appendChild(nameEl);
        nameRow.appendChild(scopeEl);
        nameRow.appendChild(actions);

        const desc = document.createElement('div');
        desc.className = 'login-strategy-desc';
        desc.textContent = s.description || '';

        li.appendChild(nameRow);
        li.appendChild(desc);
        list.appendChild(li);
      });
    }

    card.appendChild(list);

    el.innerHTML = '';
    el.appendChild(card);
  } catch (err) {
    el.innerHTML = `<div class="error">Failed to load strategies: ${err.message}</div>`;
  }
}
