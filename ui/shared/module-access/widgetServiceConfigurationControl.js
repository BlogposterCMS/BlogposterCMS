import { bpDialog } from '../dialogs/bpDialog.js';
import { configureWidgetServices, parseWidgetServiceConfiguration } from './widgetServiceConfiguration.js';
/** Operator configuration is separate from the installer's revocable access review. */
export function createWidgetServiceConfigurationControl() {
    const group = document.createElement('span');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button secondary sm';
    button.textContent = 'Import service configuration';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.hidden = true;
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    button.onclick = () => input.click();
    input.addEventListener('change', async () => {
        const file = input.files?.[0];
        if (!file)
            return;
        button.disabled = input.disabled = true;
        try {
            if (file.size > 128 * 1024)
                throw new Error('WIDGET_SERVICE_CONFIG_TOO_LARGE: Maximum size is 128 KiB.');
            const text = await file.text();
            const config = parseWidgetServiceConfiguration(text);
            const body = document.createElement('div');
            for (const [id, policy] of Object.entries(config.widgets)) {
                const heading = document.createElement('h3');
                heading.textContent = id;
                body.append(heading);
                const list = document.createElement('ul');
                for (const [name, op] of Object.entries(policy.operations || {})) {
                    const item = document.createElement('li');
                    item.textContent = `${name}: ${op.method} ${op.path}${op.credentials ? ' · current user session' : ''}${op.stream ? ' · events' : ''}${op.query?.length ? ` · query: ${op.query.join(', ')}` : ''}`;
                    list.append(item);
                }
                const local = document.createElement('p');
                local.textContent = `Unsent draft: ${policy.draft === true ? 'enabled' : 'unchanged or disabled'}. Preferences: ${Object.keys(policy.preferences || {}).join(', ') || 'unchanged'}.`;
                body.append(list, local);
            }
            const review = await bpDialog.open({ title: 'Review widget services',
                message: 'These destinations use the current site. Backend authorization remains required. Existing package grants are preserved; review access separately after saving.', body,
                actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'save', label: 'Save service configuration', variant: 'primary' }] });
            if (review.action !== 'save') {
                status.textContent = 'Configuration cancelled.';
                return;
            }
            await configureWidgetServices(text);
            status.textContent = 'Service configuration saved. Use Manage installed access to review the named grants.';
        }
        catch (error) {
            status.textContent = error instanceof Error ? error.message : 'WIDGET_SERVICE_CONFIG_FAILED';
        }
        finally {
            button.disabled = input.disabled = false;
            input.value = '';
        }
    });
    group.append(button, input, status);
    return group;
}
