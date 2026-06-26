import {
  errorMessage,
  fetchLoginStrategySettings,
  loginStrategyScopes,
  saveLoginStrategySettings,
  type LoginStrategyScope
} from './loginStrategyEditData.js';

interface LoginStrategyWindow extends Window {
  saveLoginStrategy?: () => Promise<void>;
}

export async function render(el: HTMLElement | null): Promise<void> {
  const jwt = window.ADMIN_TOKEN;
  const meltdownEmit = window.meltdownEmit;
  const params = new URLSearchParams(window.location.search);
  const strategy = params.get('strategy');

  if (!el) return;

  if (!strategy) {
    el.innerHTML = '<p>Missing strategy parameter.</p>';
    return;
  }
  const strategyName = strategy;

  if (typeof meltdownEmit !== 'function') {
    el.textContent = 'Unable to load login strategy settings without an admin session.';
    return;
  }

  let settings = {
    clientId: '',
    clientSecret: '',
    scope: 'admin' as LoginStrategyScope
  };

  try {
    settings = await fetchLoginStrategySettings(meltdownEmit, jwt, strategyName);
  } catch (err) {
    console.error('Failed to load settings', err);
  }

  const container = document.createElement('div');
  container.className = 'login-strategy-edit';

  const scopeLabel = document.createElement('label');
  scopeLabel.textContent = 'Scope';
  const scopeSelect = document.createElement('select');
  loginStrategyScopes.forEach(value => {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    if (value === settings.scope) opt.selected = true;
    scopeSelect.appendChild(opt);
  });
  container.appendChild(scopeLabel);
  container.appendChild(scopeSelect);

  const idLabel = document.createElement('label');
  idLabel.textContent = 'Client ID';
  const idInput = document.createElement('input');
  idInput.type = 'text';
  idInput.value = settings.clientId;
  container.appendChild(idLabel);
  container.appendChild(idInput);

  const secretLabel = document.createElement('label');
  secretLabel.textContent = 'Client Secret';
  const secretInput = document.createElement('input');
  secretInput.type = 'password';
  secretInput.value = settings.clientSecret;
  container.appendChild(secretLabel);
  container.appendChild(secretInput);

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';

  async function save(): Promise<void> {
    try {
      await saveLoginStrategySettings(meltdownEmit, jwt, strategyName, {
        clientId: idInput.value,
        clientSecret: secretInput.value,
        scope: scopeSelect.value as LoginStrategyScope
      });
      alert('Saved');
    } catch (err) {
      alert(`Error: ${errorMessage(err)}`);
    }
  }

  saveBtn.addEventListener('click', save);
  (window as LoginStrategyWindow).saveLoginStrategy = save;
  container.appendChild(saveBtn);

  el.innerHTML = '';
  el.appendChild(container);
}
