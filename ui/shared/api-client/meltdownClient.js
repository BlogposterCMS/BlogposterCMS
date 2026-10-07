import { isConcurrentAdminRead, isReusableRuntimeRead } from './runtimeReadPolicy.js';
const DEFAULT_TIMEOUT = 10000;
// Awaiting each response already serializes commands. A fixed idle gap adds
// latency to every admin page without providing an ordering guarantee.
const DEFAULT_THROTTLE_DELAY = 0;
function withoutJwt(payload = {}) {
    const { jwt, ...bodyPayload } = payload;
    return {
        jwt: typeof jwt === 'string' ? jwt : null,
        bodyPayload
    };
}
async function parseJsonResponse(resp, label, debug) {
    let rawText = '';
    let json;
    try {
        rawText = await resp.clone().text();
        json = JSON.parse(rawText);
    }
    catch (err) {
        console.error(`${label} invalid JSON`, resp.status, rawText);
        throw err;
    }
    if (debug) {
        console.debug(label, {
            status: resp.status,
            statusText: resp.statusText,
            headers: Object.fromEntries(resp.headers.entries()),
            raw: rawText,
            json
        });
    }
    if (!resp.ok || json.error) {
        throw new Error(json.error || resp.statusText);
    }
    return json;
}
export function createWindowTokenProvider(win) {
    const tokenWindow = win;
    return {
        getPublicToken() {
            return tokenWindow.PUBLIC_TOKEN || null;
        },
        getCsrfToken() {
            return tokenWindow.CSRF_TOKEN || null;
        }
    };
}
export function fetchWithTimeout(fetchImpl, resource, options = {}, timeout = DEFAULT_TIMEOUT) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const opts = { ...options, signal: controller.signal };
    return fetchImpl(resource, opts).finally(() => clearTimeout(id));
}
export function createMeltdownClient(options = {}) {
    const endpoint = options.endpoint || '/api/meltdown';
    const batchEndpoint = options.batchEndpoint || '/api/meltdown/batch';
    const throttleDelay = options.throttleDelay ?? DEFAULT_THROTTLE_DELAY;
    const fetchImpl = options.fetchImpl || fetch.bind(globalThis);
    const debug = options.debug || (() => false);
    const tokenProvider = options.tokenProvider || {
        getPublicToken: () => null,
        getCsrfToken: () => null
    };
    const requestQueue = [];
    const publicQueue = [];
    let publicActive = 0;
    let commandActive = false;
    let adminReadsActive = 0;
    const readCache = new Map();
    function invalidateReads() { readCache.clear(); }
    // Only the read-only public facade bypasses ordered command delivery.
    // Bound concurrency so background fonts cannot serialize page discovery.
    function processPublicQueue() {
        while (publicActive < 4 && publicQueue.length > 0) {
            const item = publicQueue.shift();
            clearTimeout(item.queueTimer);
            item.dispatch?.onDispatch?.();
            publicActive += 1;
            send(item.eventName, item.payload, item.timeout)
                .then(item.resolve, item.reject)
                .finally(() => {
                publicActive -= 1;
                processPublicQueue();
            });
        }
    }
    async function send(eventName, payload = {}, timeout = DEFAULT_TIMEOUT) {
        const { jwt, bodyPayload } = withoutJwt(payload);
        const headers = {
            'Content-Type': 'application/json'
        };
        const token = jwt || tokenProvider.getPublicToken();
        const csrfToken = tokenProvider.getCsrfToken();
        if (token)
            headers['X-Public-Token'] = token;
        if (csrfToken)
            headers['X-CSRF-Token'] = csrfToken;
        if (debug()) {
            console.debug('[MELTDOWN][OUT]', {
                url: endpoint,
                method: 'POST',
                headers,
                body: { eventName, payload: bodyPayload }
            });
        }
        let body = JSON.stringify({ eventName, payload: bodyPayload });
        // Large structured Studio snapshots otherwise occupy the ordered command
        // fence for the entire upload. The existing JSON parser already inflates
        // gzip under its decoded-body limit; keep the same endpoint and contracts.
        if (body.length >= 64 * 1024 && typeof CompressionStream === 'function') {
            const source = new Blob([body]);
            const compressed = await new Response(source.stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
            if (compressed.byteLength < source.size) {
                body = compressed;
                headers['Content-Encoding'] = 'gzip';
            }
        }
        const resp = await fetchWithTimeout(fetchImpl, endpoint, {
            method: 'POST',
            credentials: 'same-origin',
            headers,
            body
        }, timeout);
        const json = await parseJsonResponse(resp, '[MELTDOWN][IN]', debug());
        return json.data;
    }
    function processQueue() {
        if (commandActive)
            return;
        while (requestQueue.length && adminReadsActive < 4) {
            const next = requestQueue[0];
            const concurrent = throttleDelay <= 0 && isConcurrentAdminRead(next.eventName, next.payload);
            // A command is a fence: finish earlier reads, then the command, before
            // starting later reads. Reads never jump over a queued save/delete.
            if (!concurrent && adminReadsActive > 0)
                return;
            const item = requestQueue.shift();
            clearTimeout(item.queueTimer);
            item.dispatch?.onDispatch?.();
            if (concurrent)
                adminReadsActive += 1;
            else
                commandActive = true;
            send(item.eventName, item.payload, item.timeout)
                .then(item.resolve, item.reject)
                .finally(() => {
                const continueQueue = () => {
                    if (concurrent)
                        adminReadsActive -= 1;
                    else
                        commandActive = false;
                    processQueue();
                };
                if (throttleDelay > 0)
                    setTimeout(continueQueue, throttleDelay);
                else
                    continueQueue();
            });
            if (!concurrent)
                return;
        }
    }
    return {
        emit(eventName, payload = {}, timeout = DEFAULT_TIMEOUT, dispatch) {
            const reusable = isReusableRuntimeRead(eventName, payload);
            const key = reusable ? JSON.stringify([
                eventName, payload, tokenProvider.getPublicToken(), tokenProvider.getCsrfToken(), timeout
            ]) : '';
            const cached = readCache.get(key);
            if (cached && cached.expires > Date.now()) {
                return cached.value.then(value => structuredClone(value));
            }
            if (eventName !== 'cmsPublicRuntimeRequest' && !isConcurrentAdminRead(eventName, payload))
                invalidateReads();
            const pending = new Promise((resolve, reject) => {
                // Local dialogs can issue their own backend requests while awaiting a
                // selection. Holding the transport queue for the dialog would deadlock.
                try {
                    const localResult = options.customEventHandler?.(eventName, payload);
                    if (typeof localResult !== 'undefined') {
                        resolve(localResult);
                        return;
                    }
                }
                catch (error) {
                    reject(error);
                    return;
                }
                const queue = eventName === 'cmsPublicRuntimeRequest' ? publicQueue : requestQueue;
                const item = { eventName, payload, timeout, resolve, reject, dispatch };
                if (dispatch?.queueTimeout && dispatch.queueTimeout > 0) {
                    item.queueTimer = setTimeout(() => {
                        const index = queue.indexOf(item);
                        if (index < 0)
                            return;
                        // An expired queued write must never execute after its caller failed.
                        queue.splice(index, 1);
                        reject(new Error('MELTDOWN_REQUEST_QUEUE_TIMEOUT: Request was not dispatched before the queue deadline.'));
                    }, dispatch.queueTimeout);
                }
                queue.push(item);
                if (eventName === 'cmsPublicRuntimeRequest') {
                    processPublicQueue();
                    return;
                }
                processQueue();
            });
            if (!reusable)
                return pending;
            if (readCache.size >= 64)
                readCache.delete(readCache.keys().next().value);
            const entry = { expires: Date.now() + 30_000, value: pending };
            readCache.set(key, entry);
            // Remove failures without deleting a newer request after invalidation.
            void pending.catch(() => { if (readCache.get(key) === entry)
                readCache.delete(key); });
            return pending.then(value => structuredClone(value));
        },
        async emitBatch(events = [], jwt = null, timeout = DEFAULT_TIMEOUT) {
            if (!Array.isArray(events) || events.length === 0)
                return [];
            invalidateReads();
            const headers = {
                'Content-Type': 'application/json'
            };
            const token = jwt || tokenProvider.getPublicToken();
            const csrfToken = tokenProvider.getCsrfToken();
            if (token)
                headers['X-Public-Token'] = token;
            if (csrfToken)
                headers['X-CSRF-Token'] = csrfToken;
            if (debug()) {
                console.debug('[MELTDOWN][OUT][BATCH]', {
                    url: batchEndpoint,
                    method: 'POST',
                    headers,
                    body: { events }
                });
            }
            const resp = await fetchWithTimeout(fetchImpl, batchEndpoint, {
                method: 'POST',
                credentials: 'same-origin',
                headers,
                body: JSON.stringify({ events })
            }, timeout).finally(invalidateReads);
            const json = await parseJsonResponse(resp, '[MELTDOWN][IN][BATCH]', debug());
            return (Array.isArray(json.results) ? json.results : []);
        }
    };
}
