import { emitRuntimeAdmin } from '../../../shared/api-client/runtimeFacade.js';
import { openExtensionUpload, createExtensionStoreButton } from '../../../shared/module-access/extensionUpload.js';
function call(action, params = {}) {
    if (!window.meltdownEmit)
        throw new Error('WIDGET_PACKAGE_EMITTER_UNAVAILABLE');
    return emitRuntimeAdmin(window.meltdownEmit, window.ADMIN_TOKEN, 'widgets', action, params, 65_000);
}
export async function reviewWidgetPackage(pkg, installing) {
    const dialog = window.bpDialog;
    if (!dialog?.open)
        throw new Error('EXTENSION_REVIEW_UNAVAILABLE: Reload to restore the access review dialog.');
    const body = document.createElement('div');
    body.className = 'module-access-review';
    const description = document.createElement('p');
    description.textContent = [pkg.label || pkg.widgetId, pkg.version, pkg.developer, pkg.description].filter(Boolean).join(' · ');
    body.appendChild(description);
    const checks = [];
    for (const access of pkg.requestedAccess) {
        const key = `${access.service}:${access.name}`;
        const label = document.createElement('label');
        label.className = 'module-access-option';
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.value = key;
        check.disabled = installing && access.available === false;
        check.checked = !check.disabled && (installing || !!pkg.approvedAccess?.includes(key));
        checks.push(check);
        const text = document.createElement('span');
        text.textContent = `${access.service}: ${access.name}${access.required ? ' (required by this widget)' : ' (optional)'}`;
        const reason = document.createElement('small');
        reason.textContent = access.reason;
        label.append(check, text, reason);
        if (access.operation) {
            const target = document.createElement('small');
            target.textContent = `${access.operation.method} ${access.operation.path}`;
            label.append(target);
        }
        if (check.disabled) {
            const note = document.createElement('small');
            note.textContent = 'Not configured by the site operator; stays blocked.';
            label.append(note);
        }
        body.append(label);
    }
    if (!checks.length) {
        const note = document.createElement('p');
        note.textContent = 'No widget services requested.';
        body.append(note);
    }
    const result = await dialog.open({ title: installing ? (pkg.replacing ? 'Replace widget package' : 'Install widget') : 'Widget access',
        message: 'Only selected, declared services are allowed. Direct core events are blocked. This review is not a malware scan; install code you trust.', body,
        actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'confirm', label: installing ? (pkg.replacing ? 'Back up and replace package' : 'Install and allow selected access') : 'Save access', variant: 'primary' }] });
    return result.action === 'confirm' ? checks.filter(check => check.checked && !check.disabled).map(check => check.value) : null;
}
export function addWidgetPackageControls(root, refresh) {
    const header = root.querySelector('header');
    if (!header)
        return;
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const install = createExtensionStoreButton();
    install.addEventListener('click', () => openExtensionUpload(async (zipData, _name, progress) => {
        const pkg = await call('inspectZip', { zipData });
        const approvedAccess = await reviewWidgetPackage(pkg, true);
        if (approvedAccess === null)
            return false;
        progress.textContent = 'Installing widget…';
        await call('installZip', { zipData, reviewedHash: pkg.reviewedHash, approvedAccess, replaceExisting: pkg.replacing === true });
        await refresh();
        return true;
    }));
    const manage = document.createElement('button');
    manage.className = 'button secondary sm';
    manage.textContent = 'Manage installed access';
    manage.addEventListener('click', async () => {
        manage.disabled = true;
        try {
            const packages = await call('packages');
            const dialog = window.bpDialog;
            if (!dialog?.open)
                throw new Error('EXTENSION_REVIEW_UNAVAILABLE');
            const body = document.createElement('div');
            const select = document.createElement('select');
            select.setAttribute('aria-label', 'Installed widget');
            for (const pkg of packages) {
                const option = document.createElement('option');
                option.value = pkg.widgetId;
                option.textContent = pkg.label || pkg.widgetId;
                select.append(option);
            }
            if (!packages.length) {
                status.textContent = 'No UI-installed widget packages.';
                return;
            }
            body.append(select);
            const result = await dialog.open({ title: 'Installed widget access', message: 'Choose a widget to review its current grants.', body, actions: [{ id: 'cancel', label: 'Cancel' }, { id: 'confirm', label: 'Review access' }] });
            if (result.action !== 'confirm')
                return;
            const pkg = packages.find(item => item.widgetId === select.value);
            const approvedAccess = await reviewWidgetPackage(pkg, false);
            if (approvedAccess === null)
                return;
            await call('setPackageAccess', { widgetId: pkg.widgetId, approvedAccess });
            status.textContent = 'Access saved. Existing service instances refresh their grants automatically.';
        }
        catch (err) {
            status.textContent = err instanceof Error ? err.message : String(err);
        }
        finally {
            manage.disabled = false;
        }
    });
    header.append(manage, install);
    root.append(status);
}
