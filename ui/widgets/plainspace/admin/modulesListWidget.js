import { errorMessage, fetchModuleLists, installModuleZip, renderModuleMeta, toggleModuleRegistryActivation, zipDataFromDataUrl } from './modulesListData.js';
function readFileInputFiles(input) {
    return input instanceof HTMLInputElement ? input.files : null;
}
export async function render(el) {
    const jwt = window.ADMIN_TOKEN;
    const meltdownEmit = window.meltdownEmit;
    if (!el)
        return;
    try {
        const { installed, system } = await fetchModuleLists(meltdownEmit, jwt);
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
        }
        else {
            installed.forEach(moduleRecord => {
                const li = document.createElement('li');
                const info = moduleRecord.module_info || {};
                const name = info.moduleName || moduleRecord.module_name || '';
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
                toggleBtn.textContent = moduleRecord.is_active ? 'Deactivate' : 'Activate';
                toggleBtn.addEventListener('click', async () => {
                    try {
                        moduleRecord.is_active = await toggleModuleRegistryActivation(meltdownEmit, jwt, moduleRecord);
                        toggleBtn.textContent = moduleRecord.is_active ? 'Deactivate' : 'Activate';
                    }
                    catch (err) {
                        alert(`Error: ${errorMessage(err)}`);
                    }
                });
                actions.appendChild(toggleBtn);
                nameRow.appendChild(nameEl);
                nameRow.appendChild(actions);
                const meta = document.createElement('div');
                meta.className = 'module-meta';
                meta.textContent = renderModuleMeta(info);
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
        }
        else {
            system.forEach(moduleRecord => {
                const li = document.createElement('li');
                const info = moduleRecord.moduleInfo || {};
                const name = info.moduleName || moduleRecord.module_name || '';
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
                meta.textContent = renderModuleMeta(info);
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
    }
    catch (err) {
        el.innerHTML = `<div class="error">Failed to load modules: ${errorMessage(err)}</div>`;
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
    cancelBtn?.addEventListener('click', remove);
    function handleFiles(files) {
        const file = files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const zipData = zipDataFromDataUrl(reader.result);
                const emit = window.meltdownEmit;
                if (typeof emit !== 'function')
                    throw new Error('meltdownEmit unavailable');
                await installModuleZip(emit, window.ADMIN_TOKEN, zipData);
                window.location.reload();
            }
            catch (err) {
                alert(`Upload failed: ${errorMessage(err)}`);
            }
        };
        reader.readAsDataURL(file);
    }
    input?.addEventListener('change', event => {
        handleFiles(readFileInputFiles(event.target));
    });
    box.addEventListener('dragover', event => {
        event.preventDefault();
        box.classList.add('dragover');
    });
    box.addEventListener('dragleave', () => box.classList.remove('dragover'));
    box.addEventListener('drop', event => {
        event.preventDefault();
        box.classList.remove('dragover');
        handleFiles(event.dataTransfer?.files || null);
    });
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}
window.openUploadPopup = openUploadPopup;
