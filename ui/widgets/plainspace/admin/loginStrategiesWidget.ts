import {
  errorMessage,
  fetchLoginStrategies,
  setLoginStrategyEnabled
} from './loginStrategiesData.js';

export async function render(el: HTMLElement | null): Promise<void> {
  const jwt = window.ADMIN_TOKEN;
  const meltdownEmit = window.meltdownEmit;
  if (!el) return;

  try {
    if (typeof meltdownEmit !== 'function') throw new Error('meltdownEmit unavailable');
    const strategies = await fetchLoginStrategies(meltdownEmit, jwt);

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
      strategies.forEach(strategy => {
        const li = document.createElement('li');

        const nameRow = document.createElement('div');
        nameRow.className = 'login-strategy-name-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'login-strategy-name';
        nameEl.textContent = strategy.name;

        const scopeEl = document.createElement('span');
        scopeEl.className = 'login-strategy-scope';
        scopeEl.textContent = `(${strategy.scope || 'admin'})`;

        const actions = document.createElement('span');
        actions.className = 'login-strategy-actions page-actions';

        const status = document.createElement('span');
        status.className = 'module-access-badge';
        const toggleIcon = document.createElement('button');
        toggleIcon.type = 'button';
        toggleIcon.className = 'button ghost sm';
        const sync = () => {
          status.textContent = strategy.isEnabled ? 'Enabled' : 'Disabled';
          toggleIcon.textContent = strategy.isEnabled ? 'Disable' : 'Enable';
        };
        sync();
        const error = document.createElement('p');
        error.className = 'form-field__error'; error.setAttribute('role', 'alert');
        toggleIcon.addEventListener('click', async () => {
          if (toggleIcon.disabled) return;
          toggleIcon.disabled = true; error.textContent = '';
          try {
            await setLoginStrategyEnabled(meltdownEmit, jwt, strategy.name, !strategy.isEnabled);
            strategy.isEnabled = !strategy.isEnabled;
            sync();
          } catch (err) {
            error.textContent = `SETTINGS_SIGN_IN_SAVE_FAILED: ${errorMessage(err)}`;
          } finally {
            toggleIcon.disabled = false;
          }
        });

        const editIcon = document.createElement('a');
        editIcon.className = 'button ghost sm';
        editIcon.textContent = 'Configure';
        editIcon.href = `/admin/settings/login/edit?strategy=${encodeURIComponent(strategy.name)}`;

        actions.appendChild(toggleIcon);
        actions.appendChild(editIcon);

        nameRow.appendChild(nameEl);
        nameRow.appendChild(scopeEl);
        nameRow.appendChild(status);
        nameRow.appendChild(actions);

        const desc = document.createElement('div');
        desc.className = 'login-strategy-desc';
        desc.textContent = strategy.description || '';

        li.appendChild(nameRow);
        li.appendChild(desc);
        li.appendChild(error);
        list.appendChild(li);
      });
    }

    card.appendChild(list);

    el.innerHTML = '';
    el.appendChild(card);
  } catch (err) {
    const error = document.createElement('p'); error.setAttribute('role', 'alert');
    error.textContent = `SETTINGS_SIGN_IN_LOAD_FAILED: ${errorMessage(err)}`;
    const retry = document.createElement('button'); retry.type = 'button';
    retry.className = 'button ghost sm'; retry.textContent = 'Retry';
    retry.addEventListener('click', () => void render(el));
    el.replaceChildren(error, retry);
  }
}
