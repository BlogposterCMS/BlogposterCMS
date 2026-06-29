import { bpDialog } from '../../shared/dialogs/bpDialog.js';
import { fetchPendingModuleAccessRequests, moduleAccessErrorMessage, resolveModuleAccessRequest } from '../../shared/module-access/moduleAccessConsentData.js';
const POLL_INTERVAL_MS = 2500;
const activeDialogs = new Set();
let pollTimer = null;
let dialogOpen = false;
let disabledAfterForbidden = false;
function accessLabel(request) {
    const resource = request.resource && request.action ? `${request.resource}.${request.action}` : '';
    return resource ? `${request.event} (${resource})` : request.event;
}
function detailRow(label, value) {
    const row = document.createElement('div');
    row.className = 'module-access-prompt-row';
    const key = document.createElement('span');
    key.textContent = label;
    const text = document.createElement('strong');
    text.textContent = value === null || typeof value === 'undefined' || value === ''
        ? '-'
        : String(value);
    row.append(key, text);
    return row;
}
function renderPayloadSummary(summary) {
    const block = document.createElement('pre');
    block.className = 'module-access-prompt-payload';
    const keys = summary ? Object.keys(summary) : [];
    block.textContent = keys.length ? JSON.stringify(summary, null, 2) : '{}';
    return block;
}
function renderPromptBody(request) {
    const body = document.createElement('div');
    body.className = 'module-access-prompt';
    body.append(detailRow('Module', request.moduleName), detailRow('Access', accessLabel(request)), detailRow('Permission', request.permission || 'none'), detailRow('Risk', request.risk || (request.protected ? 'high' : 'standard')));
    if (request.reason) {
        const reason = document.createElement('p');
        reason.className = 'module-access-prompt-reason';
        reason.textContent = request.reason;
        body.appendChild(reason);
    }
    body.appendChild(renderPayloadSummary(request.payloadSummary));
    return body;
}
async function resolvePrompt(request, action) {
    const emit = window.meltdownEmit;
    if (typeof emit !== 'function')
        return;
    if (action === 'always' && request.allowPermanent) {
        await resolveModuleAccessRequest(emit, window.ADMIN_TOKEN, request.id, 'approve', 'always');
        return;
    }
    if (action === 'once') {
        await resolveModuleAccessRequest(emit, window.ADMIN_TOKEN, request.id, 'approve', 'once');
        return;
    }
    await resolveModuleAccessRequest(emit, window.ADMIN_TOKEN, request.id, 'deny', 'once');
}
async function showAccessPrompt(request) {
    if (activeDialogs.has(request.id))
        return;
    activeDialogs.add(request.id);
    dialogOpen = true;
    try {
        const actions = [
            { id: 'deny', label: 'Deny', variant: 'danger' },
            { id: 'once', label: 'Allow once', variant: 'primary' }
        ];
        if (request.allowPermanent) {
            actions.push({ id: 'always', label: 'Always allow', variant: 'ghost' });
        }
        const result = await bpDialog.open({
            kind: 'modal',
            title: 'Module access request',
            message: `${request.moduleName} wants to use ${accessLabel(request)}.`,
            body: renderPromptBody(request),
            dismissable: true,
            actions
        });
        await resolvePrompt(request, result.action || 'deny');
    }
    catch (error) {
        console.error('[ModuleAccessConsent] failed to resolve prompt', error);
        await bpDialog.alert(`Failed to resolve module access request. ${moduleAccessErrorMessage(error)}`, { title: 'Module access' });
    }
    finally {
        dialogOpen = false;
        activeDialogs.delete(request.id);
        schedulePoll(250);
    }
}
async function pollPendingRequests() {
    pollTimer = null;
    if (dialogOpen || disabledAfterForbidden) {
        schedulePoll();
        return;
    }
    const emit = window.meltdownEmit;
    if (typeof emit !== 'function' || !window.ADMIN_TOKEN) {
        schedulePoll();
        return;
    }
    try {
        const pending = await fetchPendingModuleAccessRequests(emit, window.ADMIN_TOKEN);
        const nextRequest = pending.find(request => !activeDialogs.has(request.id));
        if (nextRequest) {
            await showAccessPrompt(nextRequest);
            return;
        }
    }
    catch (error) {
        const message = moduleAccessErrorMessage(error);
        if (/modules\.manageAccess|Forbidden/i.test(message)) {
            disabledAfterForbidden = true;
            return;
        }
        console.warn('[ModuleAccessConsent] failed to poll pending requests', error);
    }
    schedulePoll();
}
function schedulePoll(delay = POLL_INTERVAL_MS) {
    if (pollTimer !== null)
        return;
    pollTimer = window.setTimeout(() => {
        void pollPendingRequests();
    }, delay);
}
document.addEventListener('DOMContentLoaded', () => schedulePoll(800));
document.addEventListener('top-header-loaded', () => schedulePoll(800));
