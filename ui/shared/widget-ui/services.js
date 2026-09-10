function failure(code) { return new Error(code); }
export function createWidgetServices(widgetId, policy, host = window, preview = false, refreshPolicy) {
    const active = new Set();
    const closers = new Set();
    const draftKey = 'bp-widget-draft:' + widgetId;
    let previewDraft = null;
    let disposed = false;
    async function refresh() {
        if (!refreshPolicy || disposed)
            return;
        try {
            const next = await refreshPolicy();
            if (disposed)
                return;
            if (JSON.stringify(next) !== JSON.stringify(policy))
                for (const close of [...closers])
                    close();
            policy = next;
        }
        catch (err) {
            policy = {};
            for (const close of [...closers])
                close();
            throw err;
        }
    }
    // Requests recheck before dispatch; existing streams and local helpers lose
    // withdrawn capabilities on the next bounded poll, including on read failure.
    const policyTimer = refreshPolicy ? host.setInterval(() => { void refresh().catch(() => { }); }, 5000) : undefined;
    function target(name, params = {}, query = {}) {
        const op = Object.hasOwn(policy.operations || {}, name) ? policy.operations[name] : undefined;
        if (!op || !['GET', 'POST'].includes(op.method))
            throw failure('WIDGET_SERVICE_DENIED');
        const path = op.path.replace(/{([a-zA-Z]+)}/g, (_, key) => {
            const value = String(params[key] ?? '');
            if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value))
                throw failure('WIDGET_SERVICE_PARAM_INVALID');
            return value;
        });
        // No remote origins, redirects, traversal, or CMS administration endpoints.
        if (!/^\/api\/[a-zA-Z0-9_/-]+$/.test(path) || /(?:^|\/)\.\.(?:\/|$)/.test(path) || /^\/api\/(?:meltdown|admin|internal)(?:\/|$)/.test(path))
            throw failure('WIDGET_SERVICE_PATH_DENIED');
        const url = new URL(path, host.location.origin);
        for (const [key, value] of Object.entries(query)) {
            if (!op.query?.includes(key) || String(value).length > 1000)
                throw failure('WIDGET_SERVICE_QUERY_DENIED');
            url.searchParams.set(key, String(value));
        }
        return { op, url };
    }
    return Object.freeze({
        preview,
        refresh,
        async request(name, input = {}, signal) {
            if (disposed)
                throw failure('WIDGET_SERVICE_DISPOSED');
            await refresh();
            const { op, url } = target(name, input.params, input.query);
            if (op.stream || (op.method === 'GET' && input.body !== undefined))
                throw failure('WIDGET_SERVICE_OPERATION_INVALID');
            const body = input.body === undefined ? undefined : JSON.stringify(input.body);
            if (body && body.length > 16384)
                throw failure('WIDGET_SERVICE_BODY_LIMIT');
            const controller = new AbortController();
            const abort = () => controller.abort();
            if (signal?.aborted)
                abort();
            signal?.addEventListener('abort', abort, { once: true });
            const timeout = host.setTimeout(abort, 12000);
            try {
                const response = await host.fetch(url.href, { method: op.method, body, credentials: op.credentials ? 'same-origin' : 'omit', redirect: 'error', cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {}, signal: controller.signal });
                if (!response.ok)
                    throw Object.assign(failure('WIDGET_SERVICE_REQUEST_FAILED'), { status: response.status });
                if (!response.headers.get('content-type')?.includes('application/json'))
                    throw failure('WIDGET_SERVICE_RESPONSE_INVALID');
                const reader = response.body?.getReader();
                if (!reader)
                    throw failure('WIDGET_SERVICE_RESPONSE_INVALID');
                let size = 0, text = '';
                const decoder = new TextDecoder();
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    size += value.byteLength;
                    if (size > 1048576) {
                        await reader.cancel();
                        throw failure('WIDGET_SERVICE_RESPONSE_LIMIT');
                    }
                    text += decoder.decode(value, { stream: true });
                }
                return JSON.parse(text + decoder.decode());
            }
            finally {
                host.clearTimeout(timeout);
                signal?.removeEventListener('abort', abort);
            }
        },
        subscribe(name, eventName, receive, onError) {
            const { op, url } = target(name);
            if (!op.stream || !op.credentials || op.method !== 'GET' || active.size || !/^[a-zA-Z0-9_-]{1,60}$/.test(eventName))
                throw failure('WIDGET_SERVICE_STREAM_DENIED');
            const source = new host.EventSource(url.href, { withCredentials: !!op.credentials });
            active.add(source);
            const close = () => { source.close(); active.delete(source); host.clearTimeout(timer); closers.delete(close); };
            closers.add(close);
            const timer = host.setTimeout(() => { close(); onError(); }, 900000);
            source.addEventListener(eventName, (event) => {
                if (typeof event.data !== 'string' || event.data.length > 65536) {
                    close();
                    onError();
                    return;
                }
                receive(event.data);
            });
            source.onerror = () => { close(); onError(); };
            return Object.freeze({ close });
        },
        preferences: Object.freeze({
            get(name) {
                const spec = policy.preferences?.[name];
                if (!spec)
                    return '';
                const value = host.document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(spec.cookie + '='))?.slice(spec.cookie.length + 1) || '';
                return spec.values.includes(value) ? value : '';
            },
            set(name, value) {
                const spec = policy.preferences?.[name];
                if (!spec || !spec.values.includes(value))
                    throw failure('WIDGET_SERVICE_PREFERENCE_DENIED');
                host.document.cookie = spec.cookie + '=' + encodeURIComponent(value) + '; Path=/; SameSite=Lax; Max-Age=31536000';
            }
        }),
        draft: Object.freeze({
            get() {
                if (preview)
                    return previewDraft;
                if (!policy.draft)
                    throw failure('WIDGET_SERVICE_DRAFT_DENIED');
                const raw = host.sessionStorage.getItem(draftKey);
                if (!raw)
                    return null;
                const saved = JSON.parse(raw);
                return typeof saved.value === 'string' && saved.value.length <= 16384 && Date.now() - saved.at < 86400000 ? saved.value : null;
            },
            set(value) {
                if (preview && typeof value === 'string' && value.length <= 16384) {
                    previewDraft = value;
                    return;
                }
                if (!policy.draft || typeof value !== 'string' || value.length > 16384)
                    throw failure('WIDGET_SERVICE_DRAFT_DENIED');
                host.sessionStorage.setItem(draftKey, JSON.stringify({ value, at: Date.now() }));
            }
        }),
        dispose() { disposed = true; policy = {}; if (policyTimer !== undefined)
            host.clearInterval(policyTimer); for (const close of [...closers])
            close(); }
    });
}
/** Missing policy means no capabilities; a widget cannot grant itself services in its manifest. */
export async function loadWidgetServices(widgetId, preview = false, expectedCodeHash) {
    // Studio uses an opaque-origin frame. Its preview never reads host cookies
    // or calls product services; exercise live operations in the public preview.
    if (preview)
        return createWidgetServices(widgetId, {}, window, true);
    async function readPolicy() {
        const response = await fetch('/api/public/widget-services/' + encodeURIComponent(widgetId), { credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000) });
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json'))
            throw failure('WIDGET_SERVICE_POLICY_UNAVAILABLE');
        const text = await response.text();
        if (text.length > 65536)
            throw failure('WIDGET_SERVICE_POLICY_INVALID');
        const policy = JSON.parse(text);
        if (expectedCodeHash && (!policy.managed || policy.codeHash !== expectedCodeHash))
            throw failure('WIDGET_SERVICE_PACKAGE_CHANGED');
        return policy;
    }
    const policy = await readPolicy();
    return createWidgetServices(widgetId, policy, window, preview, policy.managed ? readPolicy : undefined);
}
