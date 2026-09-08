import { openExtensionUpload } from '../../../shared/module-access/extensionUpload.js';
import { createTabSystem } from '../../../shared/navigation/tabs.js';
import { errorMessage, fetchModuleLists, fetchModuleUpdateStatuses, fetchPendingModuleAccessRequests, inspectModuleZip, inspectModuleUpdate, installModuleUpdate, installModuleZip, mergeModuleUpdateStatuses, moduleHasModification, moduleHasUpdate, moduleUpdateStatus, renderModuleMeta, toggleModuleRegistryActivation, setModuleAccess } from './modulesListData.js';
function dialogApi() {
    return window.bpDialog || null;
}
function accessEventLabel(access) {
    const event = access.event || '';
    const resource = access.resource && access.action ? `${access.resource}.${access.action}` : '';
    return resource ? `${event} (${resource})` : event;
}
function approvedAccessDescriptor(access) {
    if (!access.resource || !access.action)
        return null;
    return {
        resource: access.resource,
        action: access.action
    };
}
function buildAccessReviewBody(info, checkedEvents = new Set()) {
    const source = 'moduleInfo' in info ? info.moduleInfo || {} : info;
    const permissions = 'permissions' in info && Array.isArray(info.permissions)
        ? info.permissions
        : source.permissions || [];
    const requestedAccess = 'requestedAccess' in info && Array.isArray(info.requestedAccess)
        ? info.requestedAccess
        : source.requestedAccess || [];
    const grantedEvents = new Set((source.trustedAccessGrants || [])
        .filter(grant => grant.granted && grant.event)
        .map(grant => grant.event));
    const body = document.createElement('div');
    body.className = 'module-access-review';
    if (permissions.length) {
        const section = document.createElement('div');
        section.className = 'module-access-section';
        const title = document.createElement('strong');
        title.textContent = 'Module permissions';
        section.appendChild(title);
        const list = document.createElement('ul');
        permissions.forEach(permission => {
            const item = document.createElement('li');
            item.textContent = `${permission.permission_key || permission.key || ''}: ${permission.description || ''}`;
            list.appendChild(item);
        });
        section.appendChild(list);
        body.appendChild(section);
    }
    const accessSection = document.createElement('div');
    accessSection.className = 'module-access-section';
    const accessTitle = document.createElement('strong');
    accessTitle.textContent = 'Core event access';
    accessSection.appendChild(accessTitle);
    if (!requestedAccess.length) {
        const empty = document.createElement('p');
        empty.textContent = 'No core event access requested.';
        accessSection.appendChild(empty);
    }
    else {
        requestedAccess.forEach(access => {
            const label = document.createElement('label');
            label.className = 'module-access-option';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = access.event || '';
            checkbox.disabled = access.allowPermanent === false || access.protected === true;
            checkbox.checked = !checkbox.disabled && (checkedEvents.has(access.event || '') || grantedEvents.has(access.event || ''));
            checkbox.dataset.moduleAccessEvent = access.event || '';
            label.classList.toggle('is-disabled', checkbox.disabled);
            const text = document.createElement('span');
            text.textContent = accessEventLabel(access) + (access.required ? ' (required by this module)' : ' (optional)');
            label.appendChild(checkbox);
            label.appendChild(text);
            if (access.reason) {
                const reason = document.createElement('small');
                reason.textContent = access.reason;
                label.appendChild(reason);
            }
            if (checkbox.disabled) {
                const note = document.createElement('small');
                note.textContent = 'Protected: unavailable for permanent approval';
                label.appendChild(note);
            }
            accessSection.appendChild(label);
        });
    }
    body.appendChild(accessSection);
    return body;
}
async function alertError(message) {
    const dialog = dialogApi();
    if (dialog?.alert) {
        await dialog.alert(message, { title: 'Error' });
        return;
    }
    alert(message);
}
async function confirmSimple(title, message, confirmLabel) {
    const dialog = dialogApi();
    if (dialog?.confirm) {
        return await dialog.confirm(message, { title, confirmLabel, cancelLabel: 'Cancel' });
    }
    return confirm(message);
}
async function reviewModuleAccess(title, message, inspection, confirmLabel, defaultApproved = true) {
    const requestedAccess = 'requestedAccess' in inspection && Array.isArray(inspection.requestedAccess)
        ? inspection.requestedAccess
        : inspection.requestedAccess || [];
    const checkedEvents = new Set(defaultApproved
        ? requestedAccess
            .filter(access => access.allowPermanent !== false && access.protected !== true)
            .map(access => access.event || '')
            .filter(Boolean)
        : []);
    const body = buildAccessReviewBody(inspection, checkedEvents);
    const dialog = dialogApi();
    if (!dialog?.open) {
        throw new Error('EXTENSION_REVIEW_UNAVAILABLE: The access review dialog is unavailable. Reload before installing.');
    }
    const result = await dialog.open({
        kind: 'warning',
        title,
        message,
        body,
        dismissable: true,
        actions: [
            { id: 'cancel', label: 'Cancel' },
            { id: 'confirm', label: confirmLabel, variant: 'primary' }
        ]
    });
    if (result.action !== 'confirm')
        return null;
    const selectedEvents = new Set(Array.from(body.querySelectorAll('input[data-module-access-event]'))
        .filter(input => input.checked)
        .map(input => input.value));
    return requestedAccess
        .filter(access => selectedEvents.has(access.event || ''))
        .map(approvedAccessDescriptor)
        .filter((access) => Boolean(access));
}
function moduleInfoFromRecord(moduleRecord) {
    return moduleRecord.module_info || moduleRecord.moduleInfo || {};
}
function moduleNameFromRecord(moduleRecord) {
    const info = moduleInfoFromRecord(moduleRecord);
    return info.moduleName || moduleRecord.module_name || '';
}
function accessStatusLabel(access, info, pendingAccess) {
    const eventName = access.event || '';
    if (pendingAccess.some(request => request.event === eventName)) {
        return 'Waiting';
    }
    if (access.allowPermanent === false || access.protected) {
        return info.accessPolicyVersion === 1 ? 'Blocked (protected)' : 'One-time only';
    }
    if ((info.trustedAccessGrants || []).some(grant => grant.granted && grant.event === eventName)) {
        return 'Permanent';
    }
    return 'Not granted';
}
function makeBadge(text, tone = 'neutral') {
    const badge = document.createElement('span');
    badge.className = `module-access-badge module-access-badge--${tone}`;
    badge.textContent = text;
    return badge;
}
function moduleModificationFromRecord(moduleRecord) {
    const info = moduleInfoFromRecord(moduleRecord);
    return moduleRecord.modification || info.modification;
}
function makeModificationBadge(moduleRecord) {
    const badge = makeBadge('Modification', 'danger');
    const modification = moduleModificationFromRecord(moduleRecord);
    if (modification?.valid === false) {
        const code = modification.errorCode || 'E_MODULE_MODIFICATION_INVALID';
        badge.title = `${code}: ${modification.errorMessage || 'Invalid module modification'}`;
    }
    else if (modification?.path) {
        badge.title = modification.path;
    }
    return badge;
}
function makeUpdateBadge(moduleRecord) {
    const update = moduleUpdateStatus(moduleRecord);
    const label = update?.latestVersion ? `Update v${update.latestVersion}` : 'Update available';
    const badge = makeBadge(label, 'warning');
    if (update?.release?.name || update?.asset?.name) {
        badge.title = [update.release?.name, update.asset?.name].filter(Boolean).join(' - ');
    }
    return badge;
}
function makeUpdateErrorBadge(moduleRecord) {
    const update = moduleUpdateStatus(moduleRecord);
    const badge = makeBadge('Update check failed', 'danger');
    badge.title = update?.errorMessage || update?.errorCode || 'MODULE_UPDATE_CHECK_FAILED';
    return badge;
}
function makeEmpty(text) {
    const empty = document.createElement('p');
    empty.className = 'module-detail-empty';
    empty.textContent = text;
    return empty;
}
function appendAccessRows(list, items, info, pendingAccess) {
    if (!items.length) {
        list.appendChild(makeEmpty('No core access requested.'));
        return;
    }
    items.forEach(access => {
        const item = document.createElement('li');
        item.className = 'module-detail-access-row';
        const text = document.createElement('span');
        text.textContent = accessEventLabel(access) + (access.required ? ' (required by this module)' : ' (optional)');
        const status = accessStatusLabel(access, info, pendingAccess);
        const tone = status === 'Permanent' ? 'ok' : status === 'Waiting' ? 'warning' : status === 'One-time only' ? 'danger' : 'neutral';
        item.append(text, makeBadge(status, tone));
        if (access.reason) {
            const reason = document.createElement('small');
            reason.textContent = access.reason;
            item.appendChild(reason);
        }
        list.appendChild(item);
    });
}
function inspectionForNewUpdateAccess(inspection) {
    const newRequestedAccess = Array.isArray(inspection.newRequestedAccess)
        ? inspection.newRequestedAccess
        : [];
    return {
        ...inspection,
        requestedAccess: newRequestedAccess,
        moduleInfo: {
            ...(inspection.moduleInfo || {}),
            requestedAccess: newRequestedAccess
        }
    };
}
function renderModuleDetail(moduleRecord, pendingAccess, isSystem = false) {
    const panel = document.createElement('section');
    panel.className = 'module-detail-panel';
    if (!moduleRecord) {
        panel.appendChild(makeEmpty('Select a module.'));
        return panel;
    }
    const info = moduleInfoFromRecord(moduleRecord);
    const name = moduleNameFromRecord(moduleRecord);
    const modulePending = pendingAccess.filter(request => request.moduleName === name);
    const permissions = info.permissions || [];
    const requestedAccess = info.requestedAccess || [];
    const grants = (info.trustedAccessGrants || []).filter(grant => grant.granted);
    const header = document.createElement('header');
    header.className = 'module-detail-header';
    const title = document.createElement('h3');
    title.textContent = name || 'Module';
    const meta = document.createElement('p');
    meta.textContent = renderModuleMeta(info);
    header.append(title, meta);
    const statusRow = document.createElement('div');
    statusRow.className = 'module-detail-status-row';
    statusRow.appendChild(makeBadge(isSystem ? 'System' : moduleRecord.is_active ? 'Active' : 'Inactive', isSystem || moduleRecord.is_active ? 'ok' : 'neutral'));
    if (moduleHasModification(moduleRecord)) {
        statusRow.appendChild(makeModificationBadge(moduleRecord));
    }
    if (moduleHasUpdate(moduleRecord)) {
        statusRow.appendChild(makeUpdateBadge(moduleRecord));
    }
    else if (moduleUpdateStatus(moduleRecord)?.status === 'error') {
        statusRow.appendChild(makeUpdateErrorBadge(moduleRecord));
    }
    if (modulePending.length) {
        statusRow.appendChild(makeBadge(`${modulePending.length} pending`, 'warning'));
    }
    header.appendChild(statusRow);
    panel.appendChild(header);
    const permissionsSection = document.createElement('section');
    permissionsSection.className = 'module-detail-section';
    const permissionsTitle = document.createElement('h4');
    permissionsTitle.textContent = 'Module permissions';
    permissionsSection.appendChild(permissionsTitle);
    if (!permissions.length) {
        permissionsSection.appendChild(makeEmpty('No own permissions declared.'));
    }
    else {
        const list = document.createElement('ul');
        list.className = 'module-detail-list';
        permissions.forEach(permission => {
            const item = document.createElement('li');
            item.textContent = `${permission.permission_key || permission.key || ''}: ${permission.description || ''}`;
            if (permission.description) {
                const description = document.createElement('small');
                description.textContent = permission.description;
                item.appendChild(description);
            }
            list.appendChild(item);
        });
        permissionsSection.appendChild(list);
    }
    panel.appendChild(permissionsSection);
    const accessSection = document.createElement('section');
    accessSection.className = 'module-detail-section';
    const accessTitle = document.createElement('h4');
    accessTitle.textContent = 'Core access';
    const accessList = document.createElement('ul');
    accessList.className = 'module-detail-list';
    accessSection.append(accessTitle, accessList);
    appendAccessRows(accessList, requestedAccess, info, modulePending);
    panel.appendChild(accessSection);
    const grantsSection = document.createElement('section');
    grantsSection.className = 'module-detail-section';
    const grantsTitle = document.createElement('h4');
    grantsTitle.textContent = 'Permanent grants';
    grantsSection.appendChild(grantsTitle);
    if (!grants.length) {
        grantsSection.appendChild(makeEmpty('No permanent grants.'));
    }
    else {
        const list = document.createElement('ul');
        list.className = 'module-detail-list';
        grants.forEach(grant => {
            const item = document.createElement('li');
            item.textContent = accessEventLabel(grant);
            list.appendChild(item);
        });
        grantsSection.appendChild(list);
    }
    panel.appendChild(grantsSection);
    const pendingSection = document.createElement('section');
    pendingSection.className = 'module-detail-section';
    const pendingTitle = document.createElement('h4');
    pendingTitle.textContent = 'Runtime prompts';
    pendingSection.appendChild(pendingTitle);
    if (!modulePending.length) {
        pendingSection.appendChild(makeEmpty('No pending prompts.'));
    }
    else {
        const list = document.createElement('ul');
        list.className = 'module-detail-list';
        modulePending.forEach(request => {
            const item = document.createElement('li');
            item.textContent = `${request.event} (${request.resource}.${request.action})`;
            item.appendChild(makeBadge(request.allowPermanent ? 'Once or always' : 'Once only', request.allowPermanent ? 'warning' : 'danger'));
            list.appendChild(item);
        });
        pendingSection.appendChild(list);
    }
    panel.appendChild(pendingSection);
    return panel;
}
export async function render(el, options = {}) {
    const jwt = window.ADMIN_TOKEN;
    const meltdownEmit = window.meltdownEmit;
    if (!el)
        return;
    try {
        const [{ installed: installedRows, system }, pendingAccess, updateStatuses] = await Promise.all([
            fetchModuleLists(meltdownEmit, jwt),
            fetchPendingModuleAccessRequests(meltdownEmit, jwt).catch(() => []),
            fetchModuleUpdateStatuses(meltdownEmit, jwt).catch(() => [])
        ]);
        const installed = mergeModuleUpdateStatuses(installedRows, updateStatuses);
        const card = document.createElement('div');
        card.className = 'modules-list-card page-list-card';
        const titleBar = document.createElement('div');
        titleBar.className = 'modules-title-bar page-title-bar';
        const title = document.createElement('div');
        title.className = 'modules-title page-title';
        title.textContent = 'Modules';
        titleBar.appendChild(title);
        const installButton = document.createElement('button');
        installButton.className = 'button secondary sm';
        installButton.textContent = 'Install ZIP';
        installButton.addEventListener('click', openUploadPopup);
        card.appendChild(installButton);
        const tabs = options.tabsHost || document.createElement('div');
        tabs.classList.add('modules-tabs');
        tabs.setAttribute('aria-label', 'Module categories');
        if (!options.tabsHost) {
            card.append(titleBar, tabs);
        }
        const layout = document.createElement('div');
        layout.className = 'modules-access-layout';
        const installedList = document.createElement('ul');
        installedList.className = 'modules-list page-list';
        let selectedInstalled = installed[0] || null;
        let selectedSystem = system[0] || null;
        let currentTab = 'installed';
        const detailMount = document.createElement('div');
        detailMount.className = 'module-detail-mount';
        function syncDetailPanel() {
            detailMount.innerHTML = '';
            detailMount.appendChild(renderModuleDetail(currentTab === 'installed' ? selectedInstalled : selectedSystem, pendingAccess, currentTab === 'system'));
            if (currentTab === 'installed' && selectedInstalled) {
                const accessButton = document.createElement('button');
                accessButton.className = 'button secondary sm';
                accessButton.textContent = 'Manage access';
                accessButton.addEventListener('click', async () => {
                    const record = selectedInstalled;
                    try {
                        const approved = await reviewModuleAccess('Manage access', 'Unselected and undeclared core events stay blocked. Required features may become unavailable.', moduleInfoFromRecord(record), 'Save access', false);
                        if (approved === null)
                            return;
                        await setModuleAccess(meltdownEmit, jwt, moduleNameFromRecord(record), approved);
                        await render(el, options);
                    }
                    catch (err) {
                        await alertError(errorMessage(err));
                    }
                });
                detailMount.appendChild(accessButton);
            }
        }
        function syncSelectedRows() {
            const selectedName = currentTab === 'installed'
                ? (selectedInstalled ? moduleNameFromRecord(selectedInstalled) : '')
                : (selectedSystem ? moduleNameFromRecord(selectedSystem) : '');
            card.querySelectorAll('[data-module-row]').forEach(row => {
                const selected = row.dataset.moduleRow === selectedName && row.dataset.moduleScope === currentTab;
                row.classList.toggle('is-selected', selected);
                row.querySelector('.module-select')?.setAttribute('aria-pressed', String(selected));
            });
        }
        if (!installed.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'No modules found.';
            installedList.appendChild(empty);
        }
        else {
            installed.forEach(moduleRecord => {
                const li = document.createElement('li');
                const info = moduleInfoFromRecord(moduleRecord);
                const name = moduleNameFromRecord(moduleRecord);
                li.dataset.moduleRow = name;
                li.dataset.moduleScope = 'installed';
                li.addEventListener('click', () => {
                    selectedInstalled = moduleRecord;
                    syncSelectedRows();
                    syncDetailPanel();
                });
                const details = document.createElement('div');
                details.className = 'module-details';
                const nameRow = document.createElement('div');
                nameRow.className = 'module-name-row';
                const nameEl = document.createElement('button');
                nameEl.type = 'button';
                nameEl.className = 'module-name module-select';
                nameEl.textContent = name;
                const actions = document.createElement('span');
                actions.className = 'module-actions';
                const updateBtn = document.createElement('button');
                updateBtn.className = 'module-toggle-btn';
                updateBtn.textContent = 'Update';
                updateBtn.hidden = !moduleHasUpdate(moduleRecord);
                updateBtn.addEventListener('click', async (event) => {
                    event.stopPropagation();
                    try {
                        const inspection = await inspectModuleUpdate(meltdownEmit, jwt, name);
                        let approvedAccess = [];
                        if (inspection.requiresAdminApproval) {
                            const reviewed = await reviewModuleAccess(`Update ${name}`, `Review new core access before updating from v${inspection.currentVersion || info.version || '?'} to v${inspection.latestVersion || inspection.moduleInfo?.version || '?'}.`, inspectionForNewUpdateAccess(inspection), 'Update');
                            if (reviewed === null)
                                return;
                            approvedAccess = reviewed;
                        }
                        else if (!await confirmSimple(`Update ${name}`, `Install update ${inspection.latestVersion || inspection.moduleInfo?.version || ''}?`, 'Update')) {
                            return;
                        }
                        await installModuleUpdate(meltdownEmit, jwt, name, approvedAccess, inspection.hash);
                        window.location.reload();
                    }
                    catch (err) {
                        await alertError(`Update failed: ${errorMessage(err)}`);
                    }
                });
                const toggleBtn = document.createElement('button');
                toggleBtn.className = 'module-toggle-btn';
                toggleBtn.textContent = moduleRecord.is_active ? 'Deactivate' : 'Activate';
                toggleBtn.addEventListener('click', async (event) => {
                    event.stopPropagation();
                    try {
                        let approvedAccess;
                        if (!moduleRecord.is_active) {
                            const infoForReview = moduleRecord.module_info || {};
                            const reviewed = await reviewModuleAccess(`Activate ${name}`, 'Review requested module access before activation.', infoForReview, 'Activate');
                            if (reviewed === null)
                                return;
                            approvedAccess = reviewed;
                        }
                        else if (!await confirmSimple(`Deactivate ${name}`, 'Deactivate this module?', 'Deactivate')) {
                            return;
                        }
                        moduleRecord.is_active = await toggleModuleRegistryActivation(meltdownEmit, jwt, moduleRecord, approvedAccess);
                        toggleBtn.textContent = moduleRecord.is_active ? 'Deactivate' : 'Activate';
                        selectedInstalled = moduleRecord;
                        syncSelectedRows();
                        syncDetailPanel();
                    }
                    catch (err) {
                        await alertError(`Error: ${errorMessage(err)}`);
                    }
                });
                actions.append(updateBtn, toggleBtn);
                nameRow.appendChild(nameEl);
                if (moduleHasModification(moduleRecord)) {
                    nameRow.appendChild(makeModificationBadge(moduleRecord));
                }
                if (moduleHasUpdate(moduleRecord)) {
                    nameRow.appendChild(makeUpdateBadge(moduleRecord));
                }
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
        if (!system.length) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = 'No modules found.';
            systemList.appendChild(empty);
        }
        else {
            system.forEach(moduleRecord => {
                const li = document.createElement('li');
                const info = moduleInfoFromRecord(moduleRecord);
                const name = moduleNameFromRecord(moduleRecord);
                li.dataset.moduleRow = name;
                li.dataset.moduleScope = 'system';
                li.addEventListener('click', () => {
                    selectedSystem = moduleRecord;
                    syncSelectedRows();
                    syncDetailPanel();
                });
                const details = document.createElement('div');
                details.className = 'module-details';
                const nameRow = document.createElement('div');
                nameRow.className = 'module-name-row';
                const nameEl = document.createElement('button');
                nameEl.type = 'button';
                nameEl.className = 'module-name module-select';
                nameEl.textContent = name;
                nameRow.appendChild(nameEl);
                if (moduleHasModification(moduleRecord)) {
                    nameRow.appendChild(makeModificationBadge(moduleRecord));
                }
                const meta = document.createElement('div');
                meta.className = 'module-meta';
                meta.textContent = renderModuleMeta(info);
                details.appendChild(nameRow);
                details.appendChild(meta);
                li.appendChild(details);
                systemList.appendChild(li);
            });
        }
        const listMount = document.createElement('div');
        listMount.className = 'modules-list-mount';
        layout.append(listMount, detailMount);
        card.appendChild(layout);
        const tabSystem = createTabSystem(listMount, tabs, {
            variant: 'underline', panelClassName: 'modules-tab-panel',
            onSelect: index => {
                currentTab = index === 0 ? 'installed' : 'system';
                syncSelectedRows();
                syncDetailPanel();
            }
        });
        tabSystem.addTab('Installed').append(installedList);
        tabSystem.addTab('System').append(systemList);
        syncSelectedRows();
        syncDetailPanel();
        el.innerHTML = '';
        el.appendChild(card);
    }
    catch (err) {
        if (options.tabsHost)
            throw err;
        const error = document.createElement('p');
        error.setAttribute('role', 'alert');
        error.textContent = `SETTINGS_MODULES_LOAD_FAILED: ${errorMessage(err)}`;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'button ghost sm';
        retry.textContent = 'Retry';
        retry.addEventListener('click', () => void render(el));
        el.replaceChildren(error, retry);
    }
}
function openUploadPopup() {
    openExtensionUpload(async (zipData, fileName, status) => {
        const emit = window.meltdownEmit;
        const inspection = await inspectModuleZip(emit, window.ADMIN_TOKEN, zipData);
        const name = inspection.moduleName || fileName;
        const approved = await reviewModuleAccess(`Install ${name}`, 'Review the declared capabilities. Unselected and undeclared core events stay blocked. Module-owned storage, scoped assets and lifecycle events remain available.', inspection, 'Install and allow selected access');
        if (approved === null)
            return false;
        status.textContent = 'Installing and activating module…';
        await installModuleZip(emit, window.ADMIN_TOKEN, zipData, approved, inspection.reviewedHash);
        window.location.reload();
        return true;
    });
}
window.openUploadPopup = openUploadPopup;
