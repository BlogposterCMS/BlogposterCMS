import { fetchWithTimeout } from '../api-client/meltdownClient';
const DEFAULT_BASE_PATH = '/admin/api/agent';
const DEFAULT_TIMEOUT_MS = 10000;
function definedQuery(options = {}) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(options)) {
        if (typeof value === 'undefined' || value === null || value === '')
            continue;
        params.set(key, String(value));
    }
    const query = params.toString();
    return query ? `?${query}` : '';
}
function encodePathPart(value) {
    return encodeURIComponent(String(value || '').trim());
}
function endpoint(basePath, path, query) {
    const base = basePath.replace(/\/+$/g, '');
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${base}${suffix}${definedQuery(query)}`;
}
async function parseAgentResponse(response) {
    let json;
    try {
        json = await response.json();
    }
    catch {
        throw new Error(response.statusText || 'Invalid agent API response');
    }
    if (!response.ok || json.error) {
        throw new Error(json.error || response.statusText || 'Agent API request failed');
    }
    return json.data;
}
export function createAgentHttpClient(options = {}) {
    const basePath = options.basePath || DEFAULT_BASE_PATH;
    const fetchImpl = options.fetchImpl || fetch.bind(globalThis);
    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const tokenProvider = options.tokenProvider || {};
    async function request(path, init = {}, query) {
        const headers = {
            ...init.headers
        };
        const csrfToken = tokenProvider.getCsrfToken?.();
        const adminToken = tokenProvider.getAdminToken?.();
        if (csrfToken)
            headers['X-CSRF-Token'] = csrfToken;
        if (adminToken)
            headers.Authorization = `Bearer ${adminToken}`;
        const response = await fetchWithTimeout(fetchImpl, endpoint(basePath, path, query), {
            credentials: 'same-origin',
            ...init,
            headers
        }, timeoutMs);
        return parseAgentResponse(response);
    }
    function commandOptionPayload(command = {}) {
        return {
            wait: command.wait,
            waitForResult: command.waitForResult,
            timeoutMs: command.timeoutMs,
            intervalMs: command.intervalMs,
            observeDelayMs: command.observeDelayMs,
            waitForFreshSnapshot: command.waitForFreshSnapshot,
            snapshotTimeoutMs: command.snapshotTimeoutMs,
            snapshotIntervalMs: command.snapshotIntervalMs,
            includeContext: command.includeContext,
            includeActivity: command.includeActivity,
            includeTree: command.includeTree,
            includePreview: command.includePreview,
            includeCommands: command.includeCommands,
            includeControls: command.includeControls,
            includeActions: command.includeActions,
            commandLimit: command.commandLimit,
            activityLimit: command.activityLimit
        };
    }
    function commandBody(command, invoke = false) {
        return JSON.stringify({
            command,
            invoke,
            ...commandOptionPayload(command)
        });
    }
    function refreshBody(refreshOptions = {}) {
        return JSON.stringify({
            reason: refreshOptions.reason,
            ...commandOptionPayload(refreshOptions)
        });
    }
    function workflowBody(steps, workflowOptions = {}) {
        return JSON.stringify({
            steps,
            haltOnFailure: workflowOptions.haltOnFailure,
            wait: workflowOptions.wait,
            waitForResult: workflowOptions.waitForResult,
            timeoutMs: workflowOptions.timeoutMs,
            intervalMs: workflowOptions.intervalMs,
            observeDelayMs: workflowOptions.observeDelayMs,
            waitForFreshSnapshot: workflowOptions.waitForFreshSnapshot,
            snapshotTimeoutMs: workflowOptions.snapshotTimeoutMs,
            snapshotIntervalMs: workflowOptions.snapshotIntervalMs,
            includeContext: workflowOptions.includeContext,
            includeActivity: workflowOptions.includeActivity,
            includeTree: workflowOptions.includeTree,
            includePreview: workflowOptions.includePreview,
            includeCommands: workflowOptions.includeCommands,
            includeControls: workflowOptions.includeControls,
            includeActions: workflowOptions.includeActions,
            commandLimit: workflowOptions.commandLimit,
            activityLimit: workflowOptions.activityLimit
        });
    }
    function previewImageUrl(appName, surfaceId) {
        return endpoint(basePath, `/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/preview/image`);
    }
    function withPreviewImageUrl(observation, appName, surfaceId) {
        return {
            ...observation,
            previewImageUrl: observation.previewImageUrl || previewImageUrl(appName, surfaceId)
        };
    }
    function withWorkflowPreviewImageUrl(workflow, appName, surfaceId) {
        const url = workflow.previewImageUrl || previewImageUrl(appName, surfaceId);
        return {
            ...workflow,
            previewImageUrl: url,
            steps: Array.isArray(workflow.steps)
                ? workflow.steps.map(step => (step.observation
                    ? {
                        ...step,
                        observation: {
                            ...step.observation,
                            previewImageUrl: step.observation.previewImageUrl || url
                        }
                    }
                    : step))
                : []
        };
    }
    return {
        getCapabilities: () => request('/capabilities'),
        getApiDefinition: () => request('/definition'),
        getSystemContext: (contextOptions = {}) => request('/context', {}, contextOptions),
        listActivity: (activityOptions = {}) => request('/activity', {}, activityOptions),
        listSurfaces: (listOptions = {}) => request('/surfaces', {}, listOptions),
        getSurfaceSnapshot: (appName, surfaceId) => request(`/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}`),
        getSurfaceContext: (appName, surfaceId, contextOptions = {}) => request(`/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/context`, {}, contextOptions),
        getSurfacePreview: (appName, surfaceId, previewOptions = {}) => request(`/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/preview`, {}, previewOptions),
        getSurfacePreviewImageUrl: previewImageUrl,
        inspectSurface: async (appName, surfaceId, inspectOptions = {}) => {
            const inspection = await request(`/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/inspect`, {}, inspectOptions);
            return inspection ? { ...inspection, previewImageUrl: inspection.previewImageUrl || previewImageUrl(appName, surfaceId) } : null;
        },
        listActions: (appName, surfaceId, category) => request(`/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/actions`, {}, { category }),
        listCommands: (appName, surfaceId, limit) => request(`/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/commands`, {}, { limit }),
        validateCommand: (appName, surfaceId, command) => request(`/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/commands/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command })
        }),
        validateWorkflow: (appName, surfaceId, steps, workflowOptions = {}) => request(`/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/workflows/validate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ steps, haltOnFailure: workflowOptions.haltOnFailure })
        }),
        enqueueCommand: (appName, surfaceId, command) => request(`/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/commands`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: commandBody(command, false)
        }),
        invokeCommand: (appName, surfaceId, command) => request(`/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/commands`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: commandBody(command, true)
        }),
        invokeAndObserve: async (appName, surfaceId, command) => withPreviewImageUrl(await request(`/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/commands/observe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: commandBody(command, true)
        }), appName, surfaceId),
        refreshSurface: async (appName, surfaceId, refreshOptions = {}) => withPreviewImageUrl(await request(`/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: refreshBody(refreshOptions)
        }), appName, surfaceId),
        invokeWorkflow: async (appName, surfaceId, steps, workflowOptions = {}) => withWorkflowPreviewImageUrl(await request(`/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/workflows`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: workflowBody(steps, workflowOptions)
        }), appName, surfaceId),
        waitForCommand: (appName, surfaceId, commandId, waitOptions = {}) => request(`/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/commands/${encodePathPart(commandId)}/wait`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(waitOptions)
        })
    };
}
