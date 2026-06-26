const DEFAULT_SNAPSHOT_INTERVAL_MS = 4000;
const DEFAULT_POLL_INTERVAL_MS = 1600;
const DEFAULT_COMMAND_LIMIT = 10;
const DEFAULT_NODE_LIMIT = 80;
export const SURFACE_AGENT_ACTIONS = Object.freeze([
    {
        action: 'surface.refresh',
        label: 'Refresh surface snapshot',
        category: 'surface',
        description: 'Publishes a fresh agent-visible surface snapshot without changing domain state.'
    }
]);
const DOM_CONTROL_AGENT_ACTIONS = Object.freeze([
    {
        action: 'dom.click',
        label: 'Click target',
        category: 'dom',
        description: 'Clicks a visible DOM target by CSS selector, element id or data-agent-id.',
        params: [{ name: 'target', type: 'selector|id|agentId', required: true }]
    },
    {
        action: 'dom.focus',
        label: 'Focus target',
        category: 'dom',
        description: 'Moves focus to a DOM target.',
        params: [{ name: 'target', type: 'selector|id|agentId', required: true }]
    },
    {
        action: 'dom.setValue',
        label: 'Set value',
        category: 'dom',
        description: 'Sets the value of an input, textarea or select target and dispatches input/change events.',
        params: [
            { name: 'target', type: 'selector|id|agentId', required: true },
            { name: 'value', type: 'string|number|boolean', required: true }
        ]
    },
    {
        action: 'dom.toggle',
        label: 'Toggle target',
        category: 'dom',
        description: 'Toggles a checkbox, radio or button-like target.',
        params: [
            { name: 'target', type: 'selector|id|agentId', required: true },
            { name: 'value', type: 'boolean', required: false }
        ]
    },
    {
        action: 'dom.submit',
        label: 'Submit form',
        category: 'dom',
        description: 'Dispatches a submit event for a form target or the closest parent form.',
        params: [{ name: 'target', type: 'selector|id|agentId', required: true }]
    }
]);
export const DOM_AGENT_ACTIONS = Object.freeze([
    ...SURFACE_AGENT_ACTIONS,
    ...DOM_CONTROL_AGENT_ACTIONS
]);
const SNAPSHOT_SELECTOR = [
    '[data-agent-node]',
    '[data-agent-control]',
    '[data-agent-id]',
    '[data-scene-id]',
    '.canvas-item',
    '.scene-section-item',
    '.scene-stage-nav button',
    '.scene-empty-actions button',
    '.scene-stage-hud button',
    'button',
    '[role="button"]',
    'input',
    'select',
    'textarea',
    'a[href]'
].join(',');
function getEmit() {
    return typeof window !== 'undefined' && typeof window.meltdownEmit === 'function'
        ? window.meltdownEmit
        : null;
}
export function truncateAgentText(value, maxLength = 140) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}
function attr(el, name) {
    return el.getAttribute(name) || '';
}
function elementRole(el) {
    return attr(el, 'data-agent-role') ||
        attr(el, 'role') ||
        attr(el, 'type') ||
        el.tagName.toLowerCase();
}
function elementLabel(el) {
    return truncateAgentText(attr(el, 'data-agent-label') ||
        attr(el, 'aria-label') ||
        attr(el, 'title') ||
        (el instanceof HTMLInputElement ? el.value || el.placeholder : '') ||
        el.textContent ||
        elementRole(el));
}
function elementId(el, index) {
    return truncateAgentText(attr(el, 'data-agent-id') ||
        el.id ||
        attr(el, 'data-scene-id') ||
        attr(el, 'data-instance-id') ||
        attr(el, 'data-widget-id') ||
        attr(el, 'data-tool') ||
        attr(el, 'data-stage-scene-action') ||
        `${el.tagName.toLowerCase()}-${index}`, 120);
}
function elementSelector(el) {
    const agentId = attr(el, 'data-agent-id');
    if (agentId)
        return `[data-agent-id="${cssEscape(agentId)}"]`;
    if (el.id)
        return `#${cssEscape(el.id)}`;
    const sceneId = attr(el, 'data-scene-id');
    if (sceneId)
        return `[data-scene-id="${cssEscape(sceneId)}"]`;
    const instanceId = attr(el, 'data-instance-id');
    if (instanceId)
        return `[data-instance-id="${cssEscape(instanceId)}"]`;
    return undefined;
}
function cssEscape(value) {
    const cssApi = typeof window !== 'undefined' ? window.CSS : undefined;
    return cssApi?.escape ? cssApi.escape(value) : value.replace(/["\\]/g, '\\$&');
}
function commandAction(command) {
    return String(command.action || command.type || '').trim();
}
function commandParams(command) {
    return command.params && typeof command.params === 'object' && !Array.isArray(command.params)
        ? command.params
        : {};
}
function commandTarget(command) {
    const params = commandParams(command);
    if (params.target != null)
        return params.target;
    if (params.selector != null)
        return params.selector;
    if (params.id != null)
        return params.id;
    if (params.agentId != null)
        return params.agentId;
    if (command.target != null)
        return command.target;
    return null;
}
function commandValue(command) {
    const params = commandParams(command);
    if (command.value != null)
        return command.value;
    if (params.value != null)
        return params.value;
    if (command.target &&
        typeof command.target === 'object' &&
        !Array.isArray(command.target) &&
        Object.prototype.hasOwnProperty.call(command.target, 'value')) {
        return command.target.value;
    }
    return undefined;
}
function querySelectorSafe(scope, selector) {
    try {
        return scope.querySelector(selector);
    }
    catch {
        return null;
    }
}
function resolveDomAgentTarget(root, target) {
    const scope = root || (typeof document !== 'undefined' ? document : null);
    if (!scope || target == null)
        return null;
    if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement)
        return target;
    if (typeof target === 'object' && !Array.isArray(target)) {
        const raw = target;
        return resolveDomAgentTarget(scope, raw.selector || raw.id || raw.agentId || raw.target || null);
    }
    const text = String(target).trim();
    if (!text)
        return null;
    const direct = querySelectorSafe(scope, text);
    if (direct)
        return direct;
    const escaped = cssEscape(text);
    return querySelectorSafe(scope, `[data-agent-id="${escaped}"], #${escaped}, [name="${escaped}"], [data-scene-id="${escaped}"], [data-instance-id="${escaped}"], [data-widget-id="${escaped}"]`);
}
function dispatchDomInputEvents(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
}
function targetSummary(el) {
    return {
        id: elementId(el, 0),
        role: elementRole(el),
        label: elementLabel(el),
        selector: elementSelector(el)
    };
}
export function handleDomAgentCommand(command, root = typeof document !== 'undefined' ? document : null) {
    const action = commandAction(command);
    if (!action.startsWith('dom.'))
        return { handled: false, reason: 'unsupported-action', action };
    const target = resolveDomAgentTarget(root, commandTarget(command));
    if (!target)
        return { handled: false, reason: 'target-not-found', action };
    if (target.hasAttribute('disabled'))
        return { handled: false, reason: 'target-disabled', action, target: targetSummary(target) };
    if (action === 'dom.click') {
        target.click();
        return { handled: true, action, target: targetSummary(target) };
    }
    if (action === 'dom.focus') {
        target.focus();
        return { handled: true, action, target: targetSummary(target) };
    }
    if (action === 'dom.setValue') {
        if (target instanceof HTMLInputElement ||
            target instanceof HTMLTextAreaElement ||
            target instanceof HTMLSelectElement) {
            target.value = String(commandValue(command) ?? '');
            dispatchDomInputEvents(target);
            return { handled: true, action, value: target.value, target: targetSummary(target) };
        }
        return { handled: false, reason: 'target-not-value-control', action, target: targetSummary(target) };
    }
    if (action === 'dom.toggle') {
        const rawValue = commandValue(command);
        if (target instanceof HTMLInputElement && (target.type === 'checkbox' || target.type === 'radio')) {
            target.checked = rawValue == null ? !target.checked : Boolean(rawValue);
            dispatchDomInputEvents(target);
            return { handled: true, action, value: target.checked, target: targetSummary(target) };
        }
        target.click();
        return { handled: true, action, target: targetSummary(target) };
    }
    if (action === 'dom.submit') {
        const form = target instanceof HTMLFormElement ? target : target.closest('form');
        if (!form)
            return { handled: false, reason: 'form-not-found', action, target: targetSummary(target) };
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        const notCancelled = form.dispatchEvent(submitEvent);
        return { handled: true, action, submitted: notCancelled, target: targetSummary(form) };
    }
    return { handled: false, reason: 'unsupported-action', action, target: targetSummary(target) };
}
function elementState(el) {
    const state = {};
    if (el.classList.contains('active'))
        state.active = true;
    if (el.classList.contains('selected'))
        state.selected = true;
    if (el.hasAttribute('disabled'))
        state.disabled = true;
    if (el.getAttribute('aria-selected'))
        state.ariaSelected = el.getAttribute('aria-selected');
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        state.value = truncateAgentText(el.value, 300);
    }
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        state.checked = el.checked;
    }
    for (const key of ['sceneId', 'widgetId', 'behavior', 'tool', 'stageSceneAction']) {
        const datasetValue = el.dataset[key];
        if (datasetValue)
            state[key] = datasetValue;
    }
    return state;
}
function elementBounds(el) {
    if (typeof el.getBoundingClientRect !== 'function')
        return undefined;
    const rect = el.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height))
        return undefined;
    return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
    };
}
export function buildDomAgentSnapshot(root = typeof document !== 'undefined' ? document : null, options = {}) {
    const scope = root || (typeof document !== 'undefined' ? document : null);
    const nodes = scope
        ? Array.from(scope.querySelectorAll(options.selector || SNAPSHOT_SELECTOR))
        : [];
    const maxNodes = Math.max(1, options.maxNodes || DEFAULT_NODE_LIMIT);
    const tree = nodes.slice(0, maxNodes).map((el, index) => ({
        id: elementId(el, index),
        role: elementRole(el),
        label: elementLabel(el),
        selector: elementSelector(el),
        state: elementState(el),
        bounds: elementBounds(el)
    }));
    return {
        title: options.title || (typeof document !== 'undefined' ? document.title : ''),
        surfaceType: options.surfaceType || 'dom-surface',
        route: typeof window !== 'undefined' ? window.location.pathname : '',
        url: typeof window !== 'undefined' ? window.location.href : '',
        summary: {
            nodeCount: tree.length,
            truncated: nodes.length > tree.length
        },
        tree,
        controls: tree.filter(node => ['a', 'button', 'link', 'menuitem', 'tab'].includes(node.role)),
        actions: options.actions || []
    };
}
function mergeAgentActions(...sets) {
    const merged = new Map();
    for (const set of sets) {
        for (const action of set || []) {
            const key = String(action.action || action.id || '').trim();
            if (key && !merged.has(key))
                merged.set(key, action);
        }
    }
    return Array.from(merged.values());
}
function commandId(command) {
    return String(command.id || command.commandId || '').trim();
}
function reportError(options, error) {
    if (typeof options.onError === 'function') {
        options.onError(error);
        return;
    }
    if (typeof console !== 'undefined') {
        console.warn('[agentSurfaceClient]', error);
    }
}
function controlBasePayload(options, surfaceId) {
    return {
        appName: options.appName,
        surfaceId: surfaceId || options.surfaceId || 'default',
        surfaceType: options.surfaceType || 'workspace',
        title: options.title || surfaceId || options.surfaceId || options.appName
    };
}
function reportControlError(options, error) {
    if (typeof options.onError === 'function') {
        options.onError(error);
        return;
    }
    if (typeof console !== 'undefined') {
        console.warn('[agentControlClient]', error);
    }
}
export function createAgentControlClient(options) {
    const emitOrNull = () => getEmit();
    const safeEmit = async (eventName, payload = {}) => {
        const emit = emitOrNull();
        if (!emit)
            return null;
        try {
            return await emit(eventName, payload);
        }
        catch (error) {
            reportControlError(options, error);
            return null;
        }
    };
    return {
        getCapabilities: () => safeEmit('agent.getCapabilities', controlBasePayload(options)),
        getApiDefinition: () => safeEmit('agent.getApiDefinition', controlBasePayload(options)),
        getSystemContext: (systemOptions = {}) => safeEmit('agent.getSystemContext', {
            ...controlBasePayload(options),
            filterAppName: systemOptions.filterAppName,
            surfaceType: systemOptions.surfaceType,
            surfaceIdFilter: systemOptions.surfaceIdFilter,
            activeOnly: systemOptions.activeOnly,
            staleOnly: systemOptions.staleOnly,
            includeActions: systemOptions.includeActions,
            includeControls: systemOptions.includeControls,
            includePreview: systemOptions.includePreview,
            limit: systemOptions.limit
        }),
        listSurfaces: async (filter = {}) => {
            const result = await safeEmit('agent.listSurfaceSnapshots', {
                ...controlBasePayload(options, options.surfaceId),
                ...filter
            });
            return Array.isArray(result) ? result : [];
        },
        getSurfaceSnapshot: (surfaceId = options.surfaceId || 'default') => safeEmit('agent.getSurfaceSnapshot', {
            ...controlBasePayload(options, surfaceId)
        }),
        getSurfaceContext: (contextOptions = {}) => safeEmit('agent.getSurfaceContext', {
            ...controlBasePayload(options, contextOptions.surfaceId),
            includeTree: contextOptions.includeTree,
            includePreview: contextOptions.includePreview,
            includeCommands: contextOptions.includeCommands,
            includeControls: contextOptions.includeControls,
            includeActions: contextOptions.includeActions,
            commandLimit: contextOptions.commandLimit
        }),
        getSurfacePreview: (previewOptions = {}) => safeEmit('agent.getSurfacePreview', {
            ...controlBasePayload(options, previewOptions.surfaceId),
            includeData: previewOptions.includeData,
            includePreview: previewOptions.includePreview
        }),
        inspectSurface: (inspectOptions = {}) => safeEmit('agent.inspectSurface', {
            ...controlBasePayload(options, inspectOptions.surfaceId),
            includeTree: inspectOptions.includeTree,
            includePreview: inspectOptions.includePreview,
            includeData: inspectOptions.includeData,
            includeCommands: inspectOptions.includeCommands,
            includeControls: inspectOptions.includeControls,
            includeActions: inspectOptions.includeActions,
            includeActivity: inspectOptions.includeActivity,
            commandLimit: inspectOptions.commandLimit,
            activityLimit: inspectOptions.activityLimit,
            category: inspectOptions.category
        }),
        listActivity: async (activityOptions = {}) => {
            const result = await safeEmit('agent.listActivity', {
                ...controlBasePayload(options),
                appName: activityOptions.appName,
                surfaceId: activityOptions.surfaceId,
                surfaceIdFilter: activityOptions.surfaceIdFilter,
                type: activityOptions.type,
                commandId: activityOptions.commandId,
                since: activityOptions.since,
                limit: activityOptions.limit
            });
            return Array.isArray(result) ? result : [];
        },
        listActions: async (surfaceId = options.surfaceId || 'default', category) => {
            const result = await safeEmit('agent.listSurfaceActions', {
                ...controlBasePayload(options, surfaceId),
                ...(category ? { category } : {})
            });
            return Array.isArray(result) ? result : [];
        },
        getAction: (action, surfaceId = options.surfaceId || 'default') => safeEmit('agent.getSurfaceAction', {
            ...controlBasePayload(options, surfaceId),
            action
        }),
        listCommands: async (surfaceId = options.surfaceId || 'default', limit = 25) => {
            const result = await safeEmit('agent.listSurfaceCommands', {
                ...controlBasePayload(options, surfaceId),
                limit
            });
            return Array.isArray(result) ? result : [];
        },
        getCommand: (commandId, surfaceId = options.surfaceId || 'default') => safeEmit('agent.getSurfaceCommand', {
            ...controlBasePayload(options, surfaceId),
            commandId
        }),
        waitForCommand: (commandId, waitOptions = {}) => safeEmit('agent.waitForSurfaceCommand', {
            ...controlBasePayload(options, waitOptions.surfaceId),
            commandId,
            timeoutMs: waitOptions.timeoutMs,
            intervalMs: waitOptions.intervalMs
        }),
        validateCommand: (command) => safeEmit('agent.validateSurfaceCommand', {
            ...controlBasePayload(options, options.surfaceId),
            command
        }),
        validateWorkflow: (steps, workflowOptions = {}) => safeEmit('agent.validateSurfaceWorkflow', {
            ...controlBasePayload(options, options.surfaceId),
            steps,
            haltOnFailure: workflowOptions.haltOnFailure
        }),
        enqueueCommand: (command) => safeEmit('agent.enqueueSurfaceCommand', {
            ...controlBasePayload(options, options.surfaceId),
            command
        }),
        invokeCommand: (command) => safeEmit('agent.invokeSurfaceCommand', {
            ...controlBasePayload(options, options.surfaceId),
            command,
            wait: command.wait,
            waitForResult: command.waitForResult,
            timeoutMs: command.timeoutMs,
            intervalMs: command.intervalMs
        }),
        invokeAndObserve: (command) => safeEmit('agent.invokeSurfaceCommandAndObserve', {
            ...controlBasePayload(options, options.surfaceId),
            command,
            wait: command.wait,
            waitForResult: command.waitForResult,
            timeoutMs: command.timeoutMs,
            intervalMs: command.intervalMs,
            waitForFreshSnapshot: command.waitForFreshSnapshot,
            snapshotTimeoutMs: command.snapshotTimeoutMs,
            snapshotIntervalMs: command.snapshotIntervalMs,
            observeDelayMs: command.observeDelayMs,
            includeContext: command.includeContext,
            includeActivity: command.includeActivity,
            includeTree: command.includeTree,
            includePreview: command.includePreview,
            includeCommands: command.includeCommands,
            includeControls: command.includeControls,
            includeActions: command.includeActions,
            commandLimit: command.commandLimit,
            activityLimit: command.activityLimit
        }),
        refreshSurface: (refreshOptions = {}) => safeEmit('agent.refreshSurface', {
            ...controlBasePayload(options, options.surfaceId),
            reason: refreshOptions.reason,
            wait: refreshOptions.wait,
            waitForResult: refreshOptions.waitForResult,
            timeoutMs: refreshOptions.timeoutMs,
            intervalMs: refreshOptions.intervalMs,
            waitForFreshSnapshot: refreshOptions.waitForFreshSnapshot,
            snapshotTimeoutMs: refreshOptions.snapshotTimeoutMs,
            snapshotIntervalMs: refreshOptions.snapshotIntervalMs,
            observeDelayMs: refreshOptions.observeDelayMs,
            includeContext: refreshOptions.includeContext,
            includeActivity: refreshOptions.includeActivity,
            includeTree: refreshOptions.includeTree,
            includePreview: refreshOptions.includePreview,
            includeCommands: refreshOptions.includeCommands,
            includeControls: refreshOptions.includeControls,
            includeActions: refreshOptions.includeActions,
            commandLimit: refreshOptions.commandLimit,
            activityLimit: refreshOptions.activityLimit
        }),
        invokeWorkflow: (steps, workflowOptions = {}) => safeEmit('agent.invokeSurfaceWorkflow', {
            ...controlBasePayload(options, options.surfaceId),
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
        })
    };
}
export function createAgentSurfaceClient(options) {
    let running = false;
    let snapshotTimer;
    let commandTimer;
    let publishing = false;
    let polling = false;
    const basePayload = () => ({
        appName: options.appName,
        surfaceId: options.surfaceId,
        surfaceType: options.surfaceType || 'workspace',
        title: options.title || options.surfaceId
    });
    const publishSnapshot = async (reason = 'manual') => {
        const emit = getEmit();
        if (!emit || publishing)
            return null;
        publishing = true;
        try {
            const snapshot = options.buildSnapshot
                ? await options.buildSnapshot({ reason })
                : buildDomAgentSnapshot(options.root || document, {
                    title: options.title,
                    surfaceType: options.surfaceType
                });
            const snapshotActions = Array.isArray(snapshot.actions)
                ? snapshot.actions
                : [];
            return await emit('agent.publishSurfaceSnapshot', {
                ...basePayload(),
                ...snapshot,
                actions: mergeAgentActions(SURFACE_AGENT_ACTIONS, snapshotActions),
                reason,
                meta: {
                    ...(snapshot.meta || {}),
                    client: 'agentSurfaceClient'
                }
            });
        }
        catch (error) {
            reportError(options, error);
            return null;
        }
        finally {
            publishing = false;
        }
    };
    const ackCommand = async (command, status = 'acked', result = null) => {
        const emit = getEmit();
        const id = commandId(command);
        if (!emit || !id)
            return null;
        return emit('agent.ackSurfaceCommand', {
            ...basePayload(),
            commandId: id,
            status,
            ...(status === 'failed' ? { error: result instanceof Error ? result.message : String(result || 'Command failed') } : { result })
        });
    };
    const pollCommands = async () => {
        const emit = getEmit();
        if (!emit || polling)
            return [];
        polling = true;
        try {
            const commands = await emit('agent.pollSurfaceCommands', {
                ...basePayload(),
                limit: options.commandLimit || DEFAULT_COMMAND_LIMIT
            });
            const list = Array.isArray(commands) ? commands : [];
            let handledAny = false;
            let handledDomainCommand = false;
            let snapshotReason = 'command';
            for (const command of list) {
                try {
                    if (commandAction(command) === 'surface.refresh') {
                        await ackCommand(command, 'acked', { handled: true, action: 'surface.refresh' });
                        handledAny = true;
                        if (!handledDomainCommand)
                            snapshotReason = 'refresh';
                        continue;
                    }
                    handledDomainCommand = true;
                    snapshotReason = 'command';
                    const result = options.handleCommand
                        ? await options.handleCommand(command)
                        : { handled: false };
                    await ackCommand(command, 'acked', result ?? { handled: true });
                    handledAny = true;
                }
                catch (error) {
                    await ackCommand(command, 'failed', error);
                    reportError(options, error);
                }
            }
            if (handledAny && options.publishAfterCommand !== false) {
                const delay = Math.max(0, options.commandSnapshotDelayMs ?? 0);
                if (delay > 0) {
                    await new Promise(resolve => window.setTimeout(resolve, delay));
                }
                await publishSnapshot(snapshotReason);
            }
            return list;
        }
        catch (error) {
            reportError(options, error);
            return [];
        }
        finally {
            polling = false;
        }
    };
    const stop = () => {
        running = false;
        if (snapshotTimer)
            window.clearInterval(snapshotTimer);
        if (commandTimer)
            window.clearInterval(commandTimer);
        snapshotTimer = undefined;
        commandTimer = undefined;
    };
    const start = () => {
        if (running || typeof window === 'undefined')
            return;
        running = true;
        void (async () => {
            await publishSnapshot('start');
            if (running && options.handleCommand)
                await pollCommands();
        })();
        const snapshotInterval = Math.max(0, options.snapshotIntervalMs ?? DEFAULT_SNAPSHOT_INTERVAL_MS);
        if (snapshotInterval > 0) {
            snapshotTimer = window.setInterval(() => {
                if (running)
                    void publishSnapshot('interval');
            }, snapshotInterval);
        }
        const pollInterval = Math.max(0, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
        if (options.handleCommand && pollInterval > 0) {
            commandTimer = window.setInterval(() => {
                if (running)
                    void pollCommands();
            }, pollInterval);
        }
    };
    return {
        start,
        stop,
        publishSnapshot,
        pollCommands,
        ackCommand,
        isRunning: () => running
    };
}
export function startDomAgentSurface(options) {
    const root = options.root || (typeof document !== 'undefined' ? document : null);
    const genericActions = options.allowGenericCommands === false
        ? []
        : mergeAgentActions(options.actions || DOM_AGENT_ACTIONS, DOM_AGENT_ACTIONS);
    const buildSnapshot = async (context) => {
        const base = options.buildSnapshot ? await options.buildSnapshot(context) : {};
        const domSnapshot = buildDomAgentSnapshot(root, {
            title: options.title,
            surfaceType: options.surfaceType || 'dom-surface',
            selector: options.selector,
            maxNodes: options.maxNodes,
            actions: genericActions
        });
        return {
            ...domSnapshot,
            ...base,
            actions: mergeAgentActions(genericActions, base.actions),
            meta: {
                ...(domSnapshot.meta || {}),
                ...(base.meta || {}),
                adapter: 'dom-agent-surface'
            }
        };
    };
    const handleCommand = async (command) => {
        if (options.handleCommand) {
            const result = await options.handleCommand(command);
            if (result &&
                typeof result === 'object' &&
                !Array.isArray(result) &&
                result.handled !== false) {
                return result;
            }
            if (options.allowGenericCommands === false)
                return result;
        }
        if (options.allowGenericCommands === false) {
            return { handled: false, reason: 'generic-dom-commands-disabled' };
        }
        return handleDomAgentCommand(command, root);
    };
    const client = createAgentSurfaceClient({
        ...options,
        surfaceType: options.surfaceType || 'dom-surface',
        buildSnapshot,
        handleCommand
    });
    client.start();
    return client;
}
