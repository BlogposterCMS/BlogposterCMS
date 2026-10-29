import { createFormActions, createFormChoice, createFormField } from '/ui/shared/forms/formField.js';
import { registerWorkspaceChanges } from '../navigation/workspaceChanges.js';
import { bpDialog } from '../dialogs/bpDialog.js';
/** Keep the overview small; only the explicit editor mounts credential controls. */
function createStorageOverview(options) {
    const root = document.createElement('section');
    root.className = 'media-storage-panel settings-group';
    root.setAttribute('aria-label', 'Storage connections');
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'button secondary';
    add.textContent = 'Add connection';
    add.disabled = true;
    const rows = document.createElement('div');
    rows.className = 'settings-group';
    const status = document.createElement('p');
    status.className = 'form-status';
    status.setAttribute('role', 'status');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'button ghost';
    retry.textContent = 'Reload connections';
    root.append(createFormActions(add), rows, status, createFormActions(retry));
    async function edit(id) {
        const state = { canClose: () => true };
        const body = createMediaStoragePanel({ ...options, mode: 'edit', initialConnectionId: id, editorState: state });
        await bpDialog.open({ title: id === 'new' ? 'Add connection' : 'Edit connection', body, dismissable: false,
            beforeClose: () => state.canClose(), actions: [{ id: 'close', label: 'Close', variant: 'ghost' }] });
        await load();
    }
    async function load() {
        add.disabled = true;
        retry.disabled = true;
        rows.replaceChildren();
        status.textContent = 'Loading connections…';
        try {
            const response = await options.request('/admin/api/media/storage', { credentials: 'same-origin' });
            const data = await response.json();
            if (!response.ok || data.error || !Array.isArray(data.connections))
                throw new Error(data.error || 'MEDIA_STORAGE_RESPONSE_INVALID');
            for (const connection of data.connections) {
                const row = document.createElement('div');
                row.className = 'form-actions';
                const description = document.createElement('div');
                description.style.flex = '1';
                description.style.minWidth = '0';
                description.style.overflowWrap = 'anywhere';
                const title = document.createElement('strong');
                title.textContent = connection.name;
                const detail = document.createElement('p');
                detail.className = 'form-status';
                detail.textContent = `${data.adapters.find(adapter => adapter.id === connection.provider)?.label || connection.provider}${connection.connectionId === data.defaultConnectionId ? ' · Default destination' : ''}`;
                description.append(title, detail);
                const editButton = document.createElement('button');
                editButton.type = 'button';
                editButton.className = 'button secondary';
                editButton.textContent = 'Edit';
                editButton.setAttribute('aria-label', `Edit ${connection.name}`);
                editButton.disabled = !data.canConfigure;
                editButton.onclick = () => { void edit(connection.connectionId); };
                row.append(description, editButton);
                rows.append(row);
            }
            add.disabled = !data.canConfigure;
            status.textContent = data.canConfigure ? '' : 'Storage changes require Settings permission.';
        }
        catch (error) {
            status.textContent = error instanceof Error ? error.message : 'MEDIA_STORAGE_REQUEST_FAILED';
        }
        finally {
            retry.disabled = false;
        }
    }
    add.onclick = () => { void edit('new'); };
    retry.onclick = () => { void load(); };
    void load();
    return root;
}
/** Adapter descriptors drive the form; the same connections are selected by the Explorer. */
export function createMediaStoragePanel(options) {
    if (options.mode === 'settings')
        return createStorageOverview(options);
    const settings = options.mode === 'edit';
    const panel = document.createElement('section');
    panel.className = 'media-storage-panel';
    panel.setAttribute('aria-label', settings ? 'Storage connections' : 'Publish download');
    const status = document.createElement('p');
    status.className = 'form-status';
    status.setAttribute('role', 'status');
    const form = document.createElement('form');
    const controls = document.createElement('fieldset');
    Object.assign(controls.style, { display: 'grid', gap: '24px', minWidth: '0', border: '0', padding: '0', margin: '0' });
    controls.disabled = true;
    form.append(controls);
    function button(label, variant = 'secondary') {
        const control = document.createElement('button');
        control.type = 'button';
        control.className = `button ${variant}`;
        control.textContent = label;
        return control;
    }
    const connections = document.createElement('select');
    connections.name = 'connectionId';
    if (!settings)
        controls.append(createFormField('Storage destination', connections));
    const name = document.createElement('input');
    name.name = 'connectionName';
    name.maxLength = 120;
    const provider = document.createElement('select');
    provider.name = 'provider';
    const adapterFields = document.createElement('div');
    Object.assign(adapterFields.style, { display: 'grid', gap: '24px', minWidth: '0' });
    const makeDefault = document.createElement('input');
    makeDefault.type = 'checkbox';
    makeDefault.name = 'makeDefault';
    const save = button('Save connection', 'primary');
    save.type = 'submit';
    const discard = button('Discard changes', 'ghost');
    const test = button('Test connection');
    const retry = button('Reload connections', 'ghost');
    const file = document.createElement('input');
    file.type = 'file';
    file.name = 'downloadFile';
    file.hidden = true;
    const choose = button('Choose download file');
    const fileName = document.createElement('span');
    fileName.textContent = 'No file selected';
    fileName.setAttribute('aria-live', 'polite');
    const version = document.createElement('input');
    version.name = 'appVersion';
    version.maxLength = 120;
    const publish = button('Upload and publish', 'primary');
    const result = document.createElement('div');
    const notice = document.createElement('p');
    notice.textContent = 'Creates a new public download in the selected storage. Anyone with its public URL can download it.';
    if (settings)
        controls.append(createFormField('Connection name', name), createFormField('Storage adapter', provider), adapterFields, createFormChoice('Default destination for new downloads', makeDefault), createFormActions(save, discard, test));
    else {
        const fileActions = createFormActions(choose);
        fileActions.append(fileName);
        controls.append(file, fileActions, createFormField('App version (optional)', version), notice, createFormActions(publish), result);
    }
    panel.append(form, status, createFormActions(retry));
    let snapshot;
    let selectedId = options.initialConnectionId || '';
    let fields = new Map();
    let baseline = '';
    let dirty = false;
    let busy = false;
    let ready = false;
    let canConfigure = false;
    const values = () => JSON.stringify([name.value, provider.value, makeDefault.checked, ...[...fields].map(([key, input]) => [key, input.type === 'checkbox' ? input.checked : input.value])]);
    registerWorkspaceChanges(panel, { isDirty: () => settings && dirty, isBusy: () => busy });
    if (options.editorState)
        options.editorState.canClose = () => {
            if (busy || dirty) {
                status.textContent = busy ? 'Please wait until saving finishes.' : 'Save or discard your changes before closing.';
                return false;
            }
            return true;
        };
    function updateState() {
        controls.disabled = busy || !ready || (settings && !canConfigure);
        connections.disabled = settings && dirty;
        provider.disabled = selectedId !== 'new';
        name.disabled = selectedId === 'local';
        save.disabled = discard.disabled = !dirty;
        test.disabled = dirty || selectedId === 'new';
        retry.disabled = busy || dirty;
        const destination = snapshot?.connections.find(connection => connection.connectionId === selectedId);
        publish.disabled = !destination || (destination.provider !== 'local' && !destination.publicBaseUrl);
    }
    function renderFields(connection) {
        adapterFields.replaceChildren();
        fields = new Map();
        for (const field of snapshot?.adapters.find(adapter => adapter.id === provider.value)?.fields || []) {
            const input = document.createElement('input');
            input.name = field.name;
            input.type = field.secret ? 'password' : field.type === 'checkbox' ? 'checkbox' : field.type === 'url' ? 'url' : 'text';
            if (field.secret)
                input.autocomplete = 'new-password';
            else if (input.type === 'checkbox')
                input.checked = connection?.[field.name] === true;
            else
                input.value = String(connection?.[field.name] || '');
            fields.set(field.name, input);
            adapterFields.append(input.type === 'checkbox' ? createFormChoice(field.label, input) : createFormField(field.label, input, {
                hint: field.secret ? connection?.credentialsConfigured ? 'Saved on server. Leave empty to keep the saved value.' : 'Stored encrypted on the server; never returned to this form.' : field.hint,
                required: Boolean(field.required && !(field.secret && connection?.credentialsConfigured))
            }));
        }
    }
    function fill(id) {
        if (!snapshot)
            return;
        selectedId = id;
        const selected = snapshot.connections.find(connection => connection.connectionId === id);
        connections.replaceChildren(...snapshot.connections.map(connection => {
            const option = document.createElement('option');
            option.value = connection.connectionId;
            option.textContent = connection.name;
            return option;
        }));
        if (id === 'new') {
            const option = document.createElement('option');
            option.value = 'new';
            option.textContent = 'New connection';
            connections.append(option);
        }
        connections.value = id;
        provider.replaceChildren(...snapshot.adapters.filter(adapter => id !== 'new' || adapter.id !== 'local').map(adapter => {
            const option = document.createElement('option');
            option.value = adapter.id;
            option.textContent = adapter.label;
            return option;
        }));
        provider.value = selected?.provider || snapshot.adapters.find(adapter => adapter.id !== 'local')?.id || '';
        name.value = selected?.name || '';
        makeDefault.checked = snapshot.defaultConnectionId === id;
        renderFields(selected);
        // Keep the shared custom-select presentation in sync without marking a loaded value dirty.
        connections.dispatchEvent(new Event('change'));
        provider.dispatchEvent(new Event('change'));
        baseline = values();
        dirty = false;
        status.textContent = id === 'new' ? 'Enter a name and connection details.' : settings ? 'Connection loaded.'
            : selected?.provider === 'local' || selected?.publicBaseUrl ? `Destination: ${selected?.name}` : 'Set a public download base URL in Settings before publishing to this connection.';
        updateState();
    }
    async function api(suffix = '', init = {}) {
        const response = await options.request(`/admin/api/media/storage${suffix}`, { credentials: 'same-origin', ...init,
            headers: { 'X-CSRF-Token': options.csrfToken || '', ...init.headers } });
        const data = await response.json().catch(() => { throw new Error('MEDIA_STORAGE_RESPONSE_INVALID: Reload Blogposter after updating the server.'); });
        if (!response.ok || data.error)
            throw new Error(data.error || 'MEDIA_STORAGE_REQUEST_FAILED');
        return data;
    }
    const showError = (error) => { status.textContent = error instanceof Error ? error.message : 'MEDIA_STORAGE_REQUEST_FAILED'; };
    async function load() {
        busy = true;
        updateState();
        try {
            snapshot = await api();
            if (!Array.isArray(snapshot.connections) || !Array.isArray(snapshot.adapters))
                throw new Error('MEDIA_STORAGE_RESPONSE_INVALID');
            canConfigure = snapshot.canConfigure === true;
            ready = true;
            fill(selectedId === 'new' || snapshot.connections.some(connection => connection.connectionId === selectedId) ? selectedId : snapshot.defaultConnectionId);
        }
        catch (error) {
            ready = false;
            showError(error);
        }
        finally {
            busy = false;
            updateState();
        }
    }
    const markDirty = () => { if (!settings || busy)
        return; dirty = selectedId === 'new' || values() !== baseline; status.textContent = dirty ? 'Unsaved connection changes.' : 'Connection loaded.'; updateState(); };
    form.addEventListener('input', markDirty);
    form.addEventListener('change', event => { if (event.target !== connections)
        markDirty(); });
    connections.addEventListener('change', event => { if (event.bubbles && !dirty && !busy)
        fill(connections.value); });
    provider.addEventListener('change', event => { if (event.bubbles && selectedId === 'new')
        renderFields(); });
    discard.addEventListener('click', () => { fill(selectedId); dirty = false; status.textContent = 'Changes discarded.'; updateState(); });
    retry.addEventListener('click', () => { void load(); });
    form.addEventListener('submit', async (event) => {
        // The shared dialog has its own submit action; saving this form must not trigger Close.
        event.preventDefault();
        event.stopPropagation();
        if (!settings || busy || !dirty || !canConfigure)
            return;
        busy = true;
        updateState();
        try {
            const response = await api('', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                    connectionId: selectedId, name: name.value, provider: provider.value, makeDefault: makeDefault.checked,
                    ...Object.fromEntries([...fields].map(([key, input]) => [key, input.type === 'checkbox' ? input.checked : input.value]))
                }) });
            snapshot = response;
            fill(response.connectionId);
            status.textContent = 'Connection saved.';
        }
        catch (error) {
            showError(error);
        }
        finally {
            busy = false;
            updateState();
        }
    });
    test.addEventListener('click', async () => {
        busy = true;
        updateState();
        try {
            await api(`/test?connectionId=${encodeURIComponent(selectedId)}`, { method: 'POST' });
            status.textContent = 'Connection verified. Public download access depends on the server or CDN policy.';
        }
        catch (error) {
            showError(error);
        }
        finally {
            busy = false;
            updateState();
        }
    });
    choose.addEventListener('click', () => file.click());
    file.addEventListener('change', () => { fileName.textContent = file.files?.[0]?.name || 'No file selected'; });
    publish.addEventListener('click', async () => {
        if (!file.files?.[0] || busy) {
            status.textContent = 'Choose a download file.';
            return;
        }
        busy = true;
        updateState();
        status.textContent = 'Uploading and publishing…';
        result.replaceChildren();
        try {
            const body = new FormData();
            body.append('appVersion', version.value);
            body.append('file', file.files[0]);
            const uploaded = await api(`/upload?connectionId=${encodeURIComponent(selectedId)}`, { method: 'POST', body });
            const url = new URL(uploaded.url, window.location.origin);
            if (!['https:', 'http:'].includes(url.protocol))
                throw new Error('MEDIA_STORAGE_URL_INVALID');
            const link = document.createElement('a');
            link.href = url.href;
            link.textContent = 'Open published download';
            link.className = 'button secondary';
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            const checksum = document.createElement('p');
            checksum.textContent = `SHA-256: ${uploaded.checksum}`;
            checksum.style.overflowWrap = 'anywhere';
            result.append(link, checksum);
            file.value = '';
            fileName.textContent = 'No file selected';
            status.textContent = 'Published.';
            options.onPublished?.();
        }
        catch (error) {
            showError(error);
        }
        finally {
            busy = false;
            updateState();
        }
    });
    void load();
    return panel;
}
