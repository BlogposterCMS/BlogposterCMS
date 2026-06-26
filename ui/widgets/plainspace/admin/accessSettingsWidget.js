import { createAgentAccessCode, errorMessage, fetchAccessSettings, listAgentAccessCodes, revokeAgentAccessCode, setAllowRegistration } from './accessSettingsData.js';
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
        const title = document.createElement('div');
        title.className = 'access-settings-title page-title';
        title.textContent = 'Access Control';
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
        toggleHint.textContent = 'When disabled, only administrators can add new users from the Users page.';
        const status = document.createElement('div');
        status.className = 'access-settings-status';
        status.textContent = '';
        toggleInput.addEventListener('change', async () => {
            toggleInput.disabled = true;
            status.textContent = 'Saving...';
            try {
                await setAllowRegistration(meltdownEmit, jwt, toggleInput.checked);
                status.textContent = toggleInput.checked ? 'Public registration enabled.' : 'Public registration disabled.';
            }
            catch (err) {
                status.textContent = 'Failed to update registration setting.';
                console.error('[accessSettings] setSetting failed', err);
                toggleInput.checked = !toggleInput.checked;
            }
            finally {
                toggleInput.disabled = false;
            }
        });
        const installNote = document.createElement('div');
        installNote.className = 'settings-hint';
        installNote.textContent = firstInstallDone
            ? 'First-time registration is closed. Toggle the switch to temporarily reopen public sign-ups.'
            : 'The first administrator can still register even if the toggle is off. After installation, only enabled registration allows new public accounts.';
        const tipsTitle = document.createElement('h4');
        tipsTitle.className = 'access-settings-subtitle';
        tipsTitle.textContent = 'Security recommendations';
        const tipsList = document.createElement('ul');
        tipsList.className = 'access-settings-tips';
        [
            'Review config/security.js to tune brute-force protection for login attempts.',
            'Keep registration closed unless you are actively onboarding new members.',
            'Enable external authentication strategies only when you trust the provider.'
        ].forEach(text => {
            const li = document.createElement('li');
            li.textContent = text;
            tipsList.appendChild(li);
        });
        const agentTitle = document.createElement('h4');
        agentTitle.className = 'access-settings-subtitle';
        agentTitle.textContent = 'Agent access';
        const agentForm = document.createElement('div');
        agentForm.className = 'access-settings-agent-form';
        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.value = 'codex-local-15min';
        labelInput.maxLength = 120;
        labelInput.setAttribute('aria-label', 'Agent access label');
        const scopeSelect = document.createElement('select');
        scopeSelect.setAttribute('aria-label', 'Agent access scope');
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
        agentForm.appendChild(labelInput);
        agentForm.appendChild(scopeSelect);
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
        section.appendChild(toggleWrapper);
        section.appendChild(toggleHint);
        section.appendChild(status);
        section.appendChild(installNote);
        section.appendChild(tipsTitle);
        section.appendChild(tipsList);
        section.appendChild(agentTitle);
        section.appendChild(agentForm);
        section.appendChild(agentStatus);
        section.appendChild(generatedCode);
        section.appendChild(agentList);
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
        error.textContent = `Failed to load access settings: ${errorMessage(err)}`;
        el.appendChild(error);
    }
}
