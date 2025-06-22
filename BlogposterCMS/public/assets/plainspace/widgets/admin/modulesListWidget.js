export async function render(el) {
  const jwt = window.ADMIN_TOKEN;
  const meltdownEmit = window.meltdownEmit;

  try {
    const [installedRes, systemRes] = await Promise.all([
      meltdownEmit('getModuleRegistry', {
        jwt,
        moduleName: 'moduleLoader',
        moduleType: 'core'
      }),
      meltdownEmit('listSystemModules', {
        jwt,
        moduleName: 'moduleLoader',
        moduleType: 'core'
      })
    ]);

    const installed = Array.isArray(installedRes) ? installedRes : (installedRes?.data ?? []);
    const system = Array.isArray(systemRes) ? systemRes : (systemRes?.data ?? []);

    const card = document.createElement('div');
    card.className = 'modules-list-card page-list-card';

    const titleBar = document.createElement('div');
    titleBar.className = 'modules-title-bar page-title-bar';

    const title = document.createElement('div');
    title.className = 'modules-title page-title';
    title.textContent = 'Modules';

    titleBar.appendChild(title);


    const tabs = document.createElement('div');
    tabs.className = 'modules-tabs';

    const installedBtn = document.createElement('button');
    installedBtn.className = 'modules-tab active';
    installedBtn.textContent = 'Installed';

    const systemBtn = document.createElement('button');
    systemBtn.className = 'modules-tab';
    systemBtn.textContent = 'System';

    tabs.appendChild(installedBtn);
    tabs.appendChild(systemBtn);
    titleBar.appendChild(tabs);
    card.appendChild(titleBar);

    const installedList = document.createElement('ul');
    installedList.className = 'modules-list page-list';

    if (!installed.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No modules found.';
      installedList.appendChild(empty);
    } else {
      installed.forEach(m => {
        const li = document.createElement('li');
        const info = m.module_info || {};
        const name = info.moduleName || m.module_name;
        const version = info.version ? `v${info.version}` : '';
        const developer = info.developer || 'Unknown Developer';
        const desc = info.description || '';

        const details = document.createElement('div');
        details.className = 'module-details';

        const nameRow = document.createElement('div');
        nameRow.className = 'module-name-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'module-name';
        nameEl.textContent = name;

        const actions = document.createElement('span');
        actions.className = 'module-actions';

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'module-toggle-btn';
        toggleBtn.textContent = m.is_active ? 'Deactivate' : 'Activate';
        toggleBtn.addEventListener('click', async () => {
          try {
            await meltdownEmit(m.is_active ? 'deactivateModuleInRegistry' : 'activateModuleInRegistry', {
              jwt,
              moduleName: 'moduleLoader',
              moduleType: 'core',
              targetModuleName: m.module_name
            });
            m.is_active = !m.is_active;
            toggleBtn.textContent = m.is_active ? 'Deactivate' : 'Activate';
          } catch (err) {
            alert('Error: ' + err.message);
          }
        });

        actions.appendChild(toggleBtn);
        nameRow.appendChild(nameEl);
        nameRow.appendChild(actions);

        const meta = document.createElement('div');
        meta.className = 'module-meta';
        const pieces = [];
        if (version) pieces.push(version);
        if (developer) pieces.push(developer);
        if (desc) pieces.push(desc);
        meta.textContent = pieces.join(' \u2022 ');

        details.appendChild(nameRow);
        details.appendChild(meta);
        li.appendChild(details);

        installedList.appendChild(li);
      });
    }

    const systemList = document.createElement('ul');
    systemList.className = 'modules-list page-list';
    systemList.style.display = 'none';

    if (!system.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'No modules found.';
      systemList.appendChild(empty);
    } else {
      system.forEach(m => {
        const li = document.createElement('li');
        const info = m.moduleInfo || {};
        const name = info.moduleName || m.module_name;
        const version = info.version ? `v${info.version}` : '';
        const developer = info.developer || 'Unknown Developer';
        const desc = info.description || '';

        const details = document.createElement('div');
        details.className = 'module-details';

        const nameRow = document.createElement('div');
        nameRow.className = 'module-name-row';

        const nameEl = document.createElement('span');
        nameEl.className = 'module-name';
        nameEl.textContent = name;

        nameRow.appendChild(nameEl);

        const meta = document.createElement('div');
        meta.className = 'module-meta';
        const pieces = [];
        if (version) pieces.push(version);
        if (developer) pieces.push(developer);
        if (desc) pieces.push(desc);
        meta.textContent = pieces.join(' \u2022 ');

        details.appendChild(nameRow);
        details.appendChild(meta);
        li.appendChild(details);

        systemList.appendChild(li);
      });
    }

    card.appendChild(installedList);
    card.appendChild(systemList);

    installedBtn.addEventListener('click', () => {
      installedBtn.classList.add('active');
      systemBtn.classList.remove('active');
      installedList.style.display = '';
      systemList.style.display = 'none';
    });

    systemBtn.addEventListener('click', () => {
      systemBtn.classList.add('active');
      installedBtn.classList.remove('active');
      installedList.style.display = 'none';
      systemList.style.display = '';
    });

    el.innerHTML = '';
    el.appendChild(card);
  } catch (err) {
    el.innerHTML = `<div class="error">Failed to load modules: ${err.message}</div>`;
  }
}

function openUploadPopup() {
  const overlay = document.createElement('div');
  overlay.className = 'module-upload-overlay';

  const box = document.createElement('div');
  box.className = 'module-upload-box';
  box.innerHTML = `
    <p>Drop a ZIP file here or select one</p>
    <input type="file" accept=".zip" />
    <div style="margin-top:10px;">
      <button class="cancel-btn">Cancel</button>
    </div>`;

  const input = box.querySelector('input');
  const cancelBtn = box.querySelector('.cancel-btn');

  const remove = () => overlay.remove();
  cancelBtn.addEventListener('click', remove);

  function handleFiles(files) {
    const file = files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await window.meltdownEmit('installModuleFromZip', {
          jwt: window.ADMIN_TOKEN,
          moduleName: 'moduleLoader',
          moduleType: 'core',
          zipData: reader.result.split(',')[1]
        });
        window.location.reload();
      } catch (err) {
        alert('Upload failed: ' + err.message);
      }
    };
    reader.readAsDataURL(file);
  }

  input.addEventListener('change', e => handleFiles(e.target.files));

  box.addEventListener('dragover', e => {
    e.preventDefault();
    box.classList.add('dragover');
  });
  box.addEventListener('dragleave', () => box.classList.remove('dragover'));
  box.addEventListener('drop', e => {
    e.preventDefault();
    box.classList.remove('dragover');
    handleFiles(e.dataTransfer.files);
  });

  overlay.appendChild(box);
  document.body.appendChild(overlay);
}

// Expose for page action button
window.openUploadPopup = openUploadPopup;
