import { createFormActions, createFormChoice, createFormField } from '/ui/shared/forms/formField.js';
/** Uses the existing form controls and media catalog; password values are write-only. */
export function createMediaStoragePanel({ request, csrfToken, listDownloads }) {
    const panel = document.createElement('details');
    // The media widget has a fixed viewport; configuration must not push its actions outside it.
    panel.style.maxHeight = '60%';
    panel.style.overflow = 'auto';
    panel.style.flexShrink = '0';
    panel.style.minWidth = '0';
    const summary = document.createElement('summary');
    summary.textContent = 'Storage & downloads';
    const form = document.createElement('form');
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const controls = document.createElement('fieldset');
    controls.disabled = true;
    const provider = document.createElement('select');
    provider.name = 'provider';
    for (const [value, label] of [['local', 'Local server'], ['alibaba-oss', 'Alibaba OSS'], ['s3', 'AWS S3 / S3-compatible storage']]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        provider.append(option);
    }
    controls.append(createFormField('Storage provider', provider));
    const cloud = document.createElement('div');
    const fields = {};
    const definitions = [
        ['bucket', 'Bucket', 'Existing bucket name.'],
        ['region', 'Region', 'Alibaba: oss-cn-hangzhou. AWS: eu-central-1.'],
        ['endpoint', 'Endpoint (optional)', 'Leave empty for Alibaba/AWS defaults; enter an HTTPS endpoint for another S3 provider.'],
        ['publicBaseUrl', 'Download / CDN base URL (optional)', 'Defaults to the Alibaba/AWS bucket URL. Required for custom endpoints. The bucket or CDN must permit public reads.'],
        ['accessKeyId', 'Access key ID', 'Leave empty to retain the saved credential.'],
        ['accessKeySecret', 'Access key secret', 'Stored on the server; never returned to this form.']
    ];
    for (const [name, label, hint] of definitions) {
        const input = document.createElement('input');
        input.name = name;
        input.type = name.startsWith('accessKey') ? 'password' : 'text';
        if (input.type === 'password')
            input.autocomplete = 'new-password';
        fields[name] = input;
        cloud.append(createFormField(label, input, { hint }));
    }
    const pathStyle = document.createElement('input');
    pathStyle.type = 'checkbox';
    pathStyle.name = 'forcePathStyle';
    const pathField = document.createElement('div');
    pathField.append(createFormChoice('Use path-style addressing (S3-compatible providers)', pathStyle));
    cloud.append(pathField);
    controls.append(cloud);
    function button(label) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'btn btn-secondary';
        item.textContent = label;
        return item;
    }
    const save = button('Save storage');
    save.type = 'submit';
    const test = button('Test saved connection');
    controls.append(createFormActions(save, test));
    form.append(controls);
    const uploads = document.createElement('fieldset');
    uploads.disabled = true;
    for (const group of [controls, uploads]) {
        group.style.minWidth = '0';
        group.style.border = '0';
        group.style.padding = '0';
        group.style.margin = '0';
    }
    const file = document.createElement('input');
    file.type = 'file';
    file.name = 'downloadFile';
    const version = document.createElement('input');
    version.name = 'appVersion';
    version.maxLength = 120;
    const publish = button('Upload and publish');
    const notice = document.createElement('p');
    notice.textContent = 'Publishes a new download using the saved storage. Existing files are not moved. Anyone with the public URL can download it.';
    const linkArea = document.createElement('div');
    uploads.append(createFormField('Download file', file), createFormField('App version (optional)', version), notice, createFormActions(publish), linkArea);
    const recent = document.createElement('ul');
    const refresh = button('Refresh published downloads');
    const retry = button('Reload storage settings');
    panel.append(summary, form, uploads, status, retry, refresh, recent);
    let canConfigure = false;
    let ready = false;
    let dirty = false;
    function updateProvider() {
        cloud.hidden = provider.value === 'local';
        pathField.hidden = provider.value !== 's3';
    }
    function setBusy(busy) {
        controls.disabled = busy || !canConfigure || !ready;
        uploads.disabled = busy || !ready || dirty;
        retry.disabled = busy;
        test.disabled = dirty;
    }
    function fill(config) {
        provider.value = config.provider;
        for (const name of Object.keys(fields))
            fields[name].value = name.startsWith('accessKey') ? '' : String(config[name] || '');
        pathStyle.checked = Boolean(config.forcePathStyle);
        dirty = false;
        // Refresh the shared custom-select label after loading a saved native value.
        provider.dispatchEvent(new Event('change', { bubbles: true }));
        dirty = false;
        updateProvider();
        status.textContent = config.credentialsConfigured ? 'Credentials saved on server.' : 'Storage settings loaded.';
    }
    async function api(suffix = '', options = {}) {
        const response = await request(`/admin/api/media/storage${suffix}`, { credentials: 'same-origin', ...options,
            headers: { 'X-CSRF-Token': csrfToken || '', ...options.headers } });
        const result = await response.json().catch(() => {
            throw new Error('MEDIA_STORAGE_RESPONSE_INVALID: Reload Blogposter after updating the server.');
        });
        if (!response.ok || result.error)
            throw new Error(result.error || 'MEDIA_STORAGE_REQUEST_FAILED');
        return result;
    }
    function showError(error) { status.textContent = error instanceof Error ? error.message : 'MEDIA_STORAGE_REQUEST_FAILED'; }
    function appendLink(target, url, label) {
        // Persisted metadata is untrusted even though Media Manager also normalizes URLs.
        const parsed = new URL(url, window.location.origin);
        if (!['http:', 'https:'].includes(parsed.protocol))
            return;
        const link = document.createElement('a');
        link.href = parsed.href;
        link.textContent = label;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        target.append(link);
    }
    async function loadDownloads() {
        if (!listDownloads)
            return;
        refresh.disabled = true;
        try {
            const rows = await listDownloads();
            recent.replaceChildren();
            for (const row of rows) {
                if (!row.url)
                    continue;
                const item = document.createElement('li');
                appendLink(item, row.url, row.fileName || row.file_name || row.url);
                recent.append(item);
            }
        }
        catch (error) {
            showError(error);
        }
        finally {
            refresh.disabled = false;
        }
    }
    async function load() {
        setBusy(true);
        try {
            const config = await api();
            canConfigure = config.canConfigure === true;
            ready = true;
            fill(config);
        }
        catch (error) {
            ready = false;
            showError(error);
        }
        finally {
            setBusy(false);
        }
    }
    provider.addEventListener('change', updateProvider);
    const markDirty = () => { dirty = true; status.textContent = 'Unsaved storage settings.'; setBusy(false); };
    form.addEventListener('input', markDirty);
    form.addEventListener('change', markDirty);
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
            const body = { provider: provider.value, forcePathStyle: pathStyle.checked,
                ...Object.fromEntries(Object.entries(fields).map(([name, input]) => [name, input.value])) };
            fill(await api('', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
            status.textContent = 'Storage saved. Test the connection before publishing.';
        }
        catch (error) {
            showError(error);
        }
        finally {
            setBusy(false);
        }
    });
    test.addEventListener('click', async () => {
        setBusy(true);
        try {
            await api('/test', { method: 'POST' });
            status.textContent = provider.value === 'local' ? 'Local storage available.'
                : 'Bucket connection verified. Public download access still depends on the bucket/CDN policy.';
        }
        catch (error) {
            showError(error);
        }
        finally {
            setBusy(false);
        }
    });
    publish.addEventListener('click', async () => {
        if (!file.files?.[0]) {
            status.textContent = 'Choose a download file.';
            return;
        }
        setBusy(true);
        status.textContent = 'Uploading and publishing…';
        linkArea.replaceChildren();
        try {
            const body = new FormData();
            body.append('appVersion', version.value);
            body.append('file', file.files[0]);
            const result = await api('/upload', { method: 'POST', body });
            appendLink(linkArea, result.url, 'Open published download');
            const checksum = document.createElement('p');
            checksum.textContent = `SHA-256: ${result.checksum}`;
            linkArea.append(checksum);
            status.textContent = 'Published. Open the download link to verify public access.';
            file.value = '';
            await loadDownloads();
        }
        catch (error) {
            showError(error);
        }
        finally {
            setBusy(false);
        }
    });
    retry.addEventListener('click', () => { void load(); });
    refresh.addEventListener('click', () => { void loadDownloads(); });
    // Lazy loading keeps the existing local Explorer independent of storage configuration availability.
    panel.addEventListener('toggle', () => { if (panel.open && !ready) {
        void load();
        void loadDownloads();
    } });
    updateProvider();
    return panel;
}
