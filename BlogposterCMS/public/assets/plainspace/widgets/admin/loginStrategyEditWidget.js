export async function render(el) {
  const jwt = window.ADMIN_TOKEN;
  const meltdownEmit = window.meltdownEmit;
  const params = new URLSearchParams(window.location.search);
  const strategy = params.get('strategy');

  if (!strategy) {
    el.innerHTML = '<p>Missing strategy parameter.</p>';
    return;
  }

  let clientId = '';
  let clientSecret = '';
  let scope = 'admin';
  try {
    const id = await meltdownEmit('getSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: `${strategy.toUpperCase()}_CLIENT_ID` });
    const sec = await meltdownEmit('getSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: `${strategy.toUpperCase()}_CLIENT_SECRET` });
    const scp = await meltdownEmit('getSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: `${strategy.toUpperCase()}_SCOPE` });
    clientId = id || '';
    clientSecret = sec || '';
    scope = scp || 'admin';
  } catch (err) {
    console.error('Failed to load settings', err);
  }

  const container = document.createElement('div');
  container.className = 'login-strategy-edit';

  const scopeLabel = document.createElement('label');
  scopeLabel.textContent = 'Scope';
  const scopeSelect = document.createElement('select');
  ['admin', 'public', 'both'].forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    if (v === scope) opt.selected = true;
    scopeSelect.appendChild(opt);
  });
  container.appendChild(scopeLabel);
  container.appendChild(scopeSelect);

  const idLabel = document.createElement('label');
  idLabel.textContent = 'Client ID';
  const idInput = document.createElement('input');
  idInput.type = 'text';
  idInput.value = clientId;
  container.appendChild(idLabel);
  container.appendChild(idInput);

  const secretLabel = document.createElement('label');
  secretLabel.textContent = 'Client Secret';
  const secretInput = document.createElement('input');
  secretInput.type = 'password';
  secretInput.value = clientSecret;
  container.appendChild(secretLabel);
  container.appendChild(secretInput);

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  async function save() {
    try {
      await meltdownEmit('setSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: `${strategy.toUpperCase()}_CLIENT_ID`, value: idInput.value });
      await meltdownEmit('setSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: `${strategy.toUpperCase()}_CLIENT_SECRET`, value: secretInput.value });
      await meltdownEmit('setSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: `${strategy.toUpperCase()}_SCOPE`, value: scopeSelect.value });
      alert('Saved');
    } catch (err) {
      alert('Error: ' + err.message);
    }
  }
  saveBtn.addEventListener('click', save);
  window.saveLoginStrategy = save;
  container.appendChild(saveBtn);

  el.innerHTML = '';
  el.appendChild(container);
}
