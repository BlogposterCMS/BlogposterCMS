import { createFormField, createFormActions } from '../../../shared/forms/formField.js';
import { registerWorkspaceChanges } from '../../../shared/navigation/workspaceChanges.js';
import { errorMessage, fetchLoginStrategySettings, loginStrategyScopes, saveLoginStrategySettings } from './loginStrategyEditData.js';
/** Uses the existing provider contract inside the fixed account-settings page. */
export async function render(el) {
    if (!el)
        return;
    const jwt = window.ADMIN_TOKEN;
    const emit = window.meltdownEmit;
    const strategy = new URLSearchParams(window.location.search).get('strategy');
    try {
        if (!strategy)
            throw new Error('SETTINGS_SIGN_IN_PROVIDER_REQUIRED');
        if (!emit)
            throw new Error('SETTINGS_SIGN_IN_SESSION_REQUIRED');
        // A failed read must not become an empty form capable of erasing credentials.
        const settings = await fetchLoginStrategySettings(emit, jwt, strategy);
        const container = document.createElement('div');
        container.className = 'settings-section settings-section--form login-strategy-edit';
        const scope = document.createElement('select');
        loginStrategyScopes.forEach(value => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = value;
            option.selected = value === settings.scope;
            scope.append(option);
        });
        const clientId = document.createElement('input');
        clientId.value = settings.clientId;
        const secret = document.createElement('input');
        secret.type = 'password';
        secret.autocomplete = 'off';
        secret.value = settings.clientSecret;
        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.className = 'button primary';
        saveButton.textContent = 'Save sign-in settings';
        const discard = document.createElement('button');
        discard.type = 'button';
        discard.className = 'button ghost';
        discard.textContent = 'Discard changes';
        const status = document.createElement('p');
        status.className = 'form-status';
        status.setAttribute('role', 'status');
        const read = () => ({ clientId: clientId.value, clientSecret: secret.value, scope: scope.value });
        let saved = read();
        let saving = false;
        registerWorkspaceChanges(container, {
            isDirty: () => JSON.stringify(read()) !== JSON.stringify(saved), isBusy: () => saving
        });
        discard.addEventListener('click', () => {
            if (saving)
                return;
            clientId.value = saved.clientId;
            secret.value = saved.clientSecret;
            scope.value = saved.scope;
            scope.dispatchEvent(new Event('change', { bubbles: true }));
            status.textContent = '';
        });
        async function save() {
            if (saving)
                return;
            saving = true;
            container.inert = true;
            saveButton.disabled = true;
            status.setAttribute('role', 'status');
            status.textContent = 'Saving…';
            try {
                await saveLoginStrategySettings(emit, jwt, strategy, read());
                saved = read();
                status.textContent = 'Sign-in settings saved.';
            }
            catch (error) {
                status.setAttribute('role', 'alert');
                status.textContent = `SETTINGS_SIGN_IN_SAVE_FAILED: ${errorMessage(error)}`;
            }
            finally {
                saving = false;
                container.inert = false;
                saveButton.disabled = false;
            }
        }
        saveButton.addEventListener('click', () => void save());
        window.saveLoginStrategy = save;
        const actions = createFormActions(saveButton, discard);
        actions.classList.add('settings-save-bar');
        container.append(createFormField('Scope', scope), createFormField('Client ID', clientId), createFormField('Client secret', secret), actions, status);
        el.replaceChildren(container);
    }
    catch (error) {
        const message = document.createElement('p');
        message.setAttribute('role', 'alert');
        message.textContent = `SETTINGS_SIGN_IN_LOAD_FAILED: ${errorMessage(error)}`;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'button ghost';
        retry.textContent = 'Retry';
        retry.addEventListener('click', () => void render(el));
        el.replaceChildren(message, retry);
    }
}
