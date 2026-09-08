import { createAgentAccessCode, errorMessage, fetchAccessSettings, listAgentAccessCodes, revokeAgentAccessCode, setAllowRegistration } from './accessSettingsData.js';
import { createFormField, createFormActions } from '../../../shared/forms/formField.js';
import { registerWorkspaceChanges } from '../../../shared/navigation/workspaceChanges.js';
import { registerWorkspaceAgent, patchAgentForm, readAgentForm } from '../../../shared/agent/workspaceAgent.js';
function formatDate(value) {
    if (!value)
        return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}
function csrfToken() {
    return window.CSRF_TOKEN || document.querySelector('meta[name="csrf-token"]')?.content || '';
}
export async function render(el) {
    const jwt = window.ADMIN_TOKEN;
    const meltdownEmit = window.meltdownEmit;
    if (!el)
        return;
    if (!jwt || typeof meltdownEmit !== 'function') {
        el.textContent = 'Unable to load access settings without an admin session.';
        return;
    }
    try {
        const { allowRegistration, firstInstallDone } = await fetchAccessSettings(meltdownEmit, jwt);
        const card = document.createElement('div');
        card.className = 'access-settings-card page-list-card';
        const titleBar = document.createElement('div');
        titleBar.className = 'access-settings-title-bar page-title-bar';
        const title = document.createElement('h2');
        title.className = 'access-settings-title page-title';
        title.textContent = 'Public registration';
        const badge = document.createElement('span');
        badge.className = 'access-settings-badge';
        badge.textContent = firstInstallDone ? 'First install complete' : 'Initial setup pending';
        badge.dataset.state = firstInstallDone ? 'ok' : 'pending';
        titleBar.appendChild(title);
        titleBar.appendChild(badge);
        card.appendChild(titleBar);
        const section = document.createElement('div');
        section.className = 'settings-section';
        const toggleWrapper = document.createElement('div');
        toggleWrapper.className = 'access-settings-toggle';
        const toggleId = 'access-allow-registration';
        const toggleInput = document.createElement('input');
        toggleInput.type = 'checkbox';
        toggleInput.id = toggleId;
        toggleInput.checked = allowRegistration;
        const toggleLabel = document.createElement('label');
        toggleLabel.setAttribute('for', toggleId);
        toggleLabel.textContent = 'Allow public registration';
        toggleWrapper.appendChild(toggleInput);
        toggleWrapper.appendChild(toggleLabel);
        const toggleHint = document.createElement('div');
        toggleHint.className = 'settings-hint';
        toggleHint.textContent = 'When disabled, only administrators can add new users. Changes take effect after saving.';
        const status = document.createElement('div');
        status.className = 'form-status';
        status.setAttribute('role', 'status');
        status.textContent = '';
        toggleInput.name = 'allowRegistration';
        let savedRegistration = allowRegistration;
        let savingRegistration = false;
        registerWorkspaceChanges(card, {
            isDirty: () => toggleInput.checked !== savedRegistration,
            isBusy: () => savingRegistration
        });
        const saveRegistration = document.createElement('button');
        saveRegistration.type = 'button';
        saveRegistration.className = 'button primary';
        saveRegistration.textContent = 'Save registration settings';
        const discard = document.createElement('button');
        discard.type = 'button';
        discard.className = 'button ghost';
        discard.textContent = 'Discard changes';
        discard.hidden = true;
        toggleInput.addEventListener('change', () => { discard.hidden = toggleInput.checked === savedRegistration; });
        discard.addEventListener('click', () => { toggleInput.checked = savedRegistration; discard.hidden = true; status.textContent = ''; });
        async function saveRegistrationDraft(propagate = false) {
            if (savingRegistration)
                return;
            savingRegistration = true;
            saveRegistration.disabled = discard.disabled = true;
            toggleInput.disabled = true;
            status.setAttribute('role', 'status');
            status.textContent = 'Saving...';
            try {
                await setAllowRegistration(meltdownEmit, jwt, toggleInput.checked);
                savedRegistration = toggleInput.checked;
                discard.hidden = true;
                status.textContent = toggleInput.checked ? 'Public registration enabled.' : 'Public registration disabled.';
            }
            catch (err) {
                status.setAttribute('role', 'alert');
                status.textContent = `SETTINGS_REGISTRATION_SAVE_FAILED: ${errorMessage(err)}`;
                if (propagate)
                    throw err;
            }
            finally {
                savingRegistration = false;
                saveRegistration.disabled = discard.disabled = false;
                toggleInput.disabled = false;
            }
        }
        saveRegistration.addEventListener('click', () => void saveRegistrationDraft());
        // Preserve the existing Settings agent commands after consolidating the
        // registration control here. Access codes and credentials never enter it.
        registerWorkspaceAgent({ root: card, id: 'settings-registration', title: 'Registration settings',
            read: () => ({ dirty: toggleInput.checked !== savedRegistration, busy: savingRegistration,
                groups: [{ id: 'registration', fields: readAgentForm(card, ['allowRegistration']) }] }),
            actions: [
                { action: 'settings.updateDraft', label: 'Update registration', acceptsDraft: true,
                    params: [{ name: 'group', type: 'string', required: true }, { name: 'fields', type: 'object', required: true }],
                    run: p => { if (p.group !== 'registration')
                        throw new Error('SETTINGS_AGENT_GROUP_UNAVAILABLE'); patchAgentForm(card, p.fields, ['allowRegistration']); } },
                { action: 'settings.save', label: 'Save registration settings', acceptsDraft: true, confirm: true,
                    params: [{ name: 'group', type: 'string', required: true }],
                    run: p => { if (p.group !== 'registration')
                        throw new Error('SETTINGS_AGENT_GROUP_UNAVAILABLE'); return saveRegistrationDraft(true); } }
            ] });
        const installNote = document.createElement('div');
        installNote.className = 'settings-hint';
        installNote.textContent = firstInstallDone
            ? 'First-time registration is closed. Toggle the switch to temporarily reopen public sign-ups.'
            : 'The first administrator can still register even if the toggle is off. After installation, only enabled registration allows new public accounts.';
        const agentTitle = document.createElement('h2');
        agentTitle.className = 'access-settings-subtitle';
        agentTitle.textContent = 'Agent access';
        const agentHint = document.createElement('p');
        agentHint.className = 'settings-hint';
        agentHint.textContent = 'Create a temporary code to connect an agent. Codes expire after 15 minutes; you can revoke them earlier.';
        const agentForm = document.createElement('div');
        agentForm.className = 'access-settings-agent-form';
        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.value = 'codex-local-15min';
        labelInput.maxLength = 120;
        const scopeSelect = document.createElement('select');
        const scopeOptions = [
            ['control', 'Control'],
            ['view', 'View only']
        ];
        scopeOptions.forEach(([value, text]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = text;
            scopeSelect.appendChild(option);
        });
        const createButton = document.createElement('button');
        createButton.type = 'button';
        createButton.className = 'button primary';
        createButton.textContent = 'Create agent code';
        agentForm.appendChild(createFormField('Agent access label', labelInput));
        agentForm.appendChild(createFormField('Agent access scope', scopeSelect));
        agentForm.appendChild(createButton);
        const agentStatus = document.createElement('div');
        agentStatus.className = 'access-settings-status';
        const generatedCode = document.createElement('textarea');
        generatedCode.className = 'access-settings-agent-code';
        generatedCode.readOnly = true;
        generatedCode.rows = 3;
        generatedCode.hidden = true;
        const agentList = document.createElement('div');
        agentList.className = 'access-settings-agent-list';
        async function refreshAgentCodes() {
            agentList.textContent = 'Loading agent codes...';
            try {
                const codes = await listAgentAccessCodes({
                    adminToken: jwt,
                    csrfToken: csrfToken()
                });
                agentList.innerHTML = '';
                if (!codes.length) {
                    const empty = document.createElement('div');
                    empty.className = 'settings-hint';
                    empty.textContent = 'No active or recent agent codes.';
                    agentList.appendChild(empty);
                    return;
                }
                codes.slice(0, 8).forEach(code => {
                    const row = document.createElement('div');
                    row.className = 'access-settings-agent-row';
                    const meta = document.createElement('div');
                    meta.className = 'access-settings-agent-meta';
                    meta.textContent = `${code.label} · ${code.scope} · ${code.status} · expires ${formatDate(code.expiresAt)}`;
                    row.appendChild(meta);
                    if (code.status === 'active') {
                        const revokeButton = document.createElement('button');
                        revokeButton.type = 'button';
                        revokeButton.className = 'button secondary';
                        revokeButton.textContent = 'Revoke';
                        revokeButton.addEventListener('click', async () => {
                            revokeButton.disabled = true;
                            try {
                                await revokeAgentAccessCode(code.codeId, {
                                    adminToken: jwt,
                                    csrfToken: csrfToken()
                                });
                                await refreshAgentCodes();
                            }
                            catch (err) {
                                agentStatus.textContent = `Failed to revoke code: ${errorMessage(err)}`;
                                revokeButton.disabled = false;
                            }
                        });
                        row.appendChild(revokeButton);
                    }
                    agentList.appendChild(row);
                });
            }
            catch (err) {
                agentList.textContent = `Failed to load agent codes: ${errorMessage(err)}`;
            }
        }
        createButton.addEventListener('click', async () => {
            createButton.disabled = true;
            agentStatus.textContent = 'Creating agent code...';
            generatedCode.hidden = true;
            try {
                const result = await createAgentAccessCode({
                    label: labelInput.value,
                    scope: scopeSelect.value === 'view' ? 'view' : 'control',
                    ttlSeconds: 15 * 60,
                    tokenTtlSeconds: 15 * 60
                }, {
                    adminToken: jwt,
                    csrfToken: csrfToken()
                });
                generatedCode.value = result.code;
                generatedCode.hidden = false;
                agentStatus.textContent = 'Agent code created. It is shown once and expires automatically.';
                await refreshAgentCodes();
            }
            catch (err) {
                agentStatus.textContent = `Failed to create agent code: ${errorMessage(err)}`;
            }
            finally {
                createButton.disabled = false;
            }
        });
        const registrationGroup = document.createElement('div');
        registrationGroup.className = 'settings-group';
        const agentGroup = document.createElement('div');
        agentGroup.className = 'settings-group';
        registrationGroup.append(toggleWrapper, toggleHint, installNote);
        const registrationActions = createFormActions(saveRegistration, discard);
        registrationActions.classList.add('settings-save-bar');
        registrationGroup.append(registrationActions, status);
        agentGroup.append(agentTitle, agentHint, agentForm, agentStatus, generatedCode, agentList);
        section.append(registrationGroup, agentGroup);
        card.appendChild(section);
        el.innerHTML = '';
        el.appendChild(card);
        await refreshAgentCodes();
    }
    catch (err) {
        console.error('[accessSettings] render failed', err);
        el.innerHTML = '';
        const error = document.createElement('div');
        error.className = 'error';
        error.setAttribute('role', 'alert');
        error.textContent = `SETTINGS_ACCESS_LOAD_FAILED: ${errorMessage(err)}`;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'button ghost sm';
        retry.textContent = 'Retry';
        retry.addEventListener('click', () => void render(el));
        el.append(error, retry);
    }
}
