import { createAgentHttpClient } from './agentHttpClient';
const DESIGNER_APP = 'designer';
const DESIGNER_SURFACE = 'studio.designer';
function createDefaultClient(target) {
    const tokenWindow = target || (typeof window !== 'undefined' ? window : undefined);
    return createAgentHttpClient({
        tokenProvider: {
            getAdminToken: () => tokenWindow?.ADMIN_TOKEN || null,
            getCsrfToken: () => tokenWindow?.CSRF_TOKEN || null
        }
    });
}
function commandFrom(action, paramsOrCommand = {}, options = {}) {
    const source = paramsOrCommand && typeof paramsOrCommand === 'object'
        ? paramsOrCommand
        : {};
    const hasCommandShape = Boolean(source.action || source.type || source.target || source.value || source.reason || source.params);
    const command = hasCommandShape
        ? { ...source }
        : { params: source };
    return {
        waitForResult: true,
        observeDelayMs: 80,
        waitForFreshSnapshot: true,
        snapshotTimeoutMs: 2500,
        includeCommands: true,
        activityLimit: 10,
        ...command,
        ...options,
        action: options.action || command.action || action
    };
}
function previewOptionsFrom(options = { includeData: true }) {
    if (typeof options === 'boolean')
        return { includeData: options };
    return { includeData: true, ...options };
}
export function createAgentConsole(options = {}) {
    const client = options.client || createDefaultClient();
    const consoleApi = {
        client,
        context: (contextOptions = {}) => client.getSystemContext(contextOptions),
        surfaces: (surfaceOptions = {}) => client.listSurfaces(surfaceOptions),
        activity: (activityOptions = {}) => client.listActivity(activityOptions),
        surface: (appName, surfaceId, surfaceOptions = {}) => client.getSurfaceContext(appName, surfaceId, surfaceOptions),
        preview: (appName, surfaceId, previewOptions = { includeData: true }) => (client.getSurfacePreview(appName, surfaceId, previewOptionsFrom(previewOptions))),
        previewImageUrl: (appName, surfaceId) => client.getSurfacePreviewImageUrl(appName, surfaceId),
        actions: (appName, surfaceId, category) => client.listActions(appName, surfaceId, category),
        commands: (appName, surfaceId, limit) => client.listCommands(appName, surfaceId, limit),
        validate: (appName, surfaceId, action, paramsOrCommand = {}) => (client.validateCommand(appName, surfaceId, commandFrom(action, paramsOrCommand, {
            waitForResult: undefined,
            observeDelayMs: undefined,
            waitForFreshSnapshot: undefined,
            snapshotTimeoutMs: undefined,
            includeCommands: undefined,
            activityLimit: undefined
        }))),
        validateWorkflow: (appName, surfaceId, steps) => client.validateWorkflow(appName, surfaceId, steps),
        run: (appName, surfaceId, action, paramsOrCommand = {}, commandOptions = {}) => (client.invokeAndObserve(appName, surfaceId, commandFrom(action, paramsOrCommand, commandOptions))),
        workflow: (appName, surfaceId, steps, workflowOptions = {}) => (client.invokeWorkflow(appName, surfaceId, steps, {
            waitForResult: true,
            waitForFreshSnapshot: true,
            snapshotTimeoutMs: 2500,
            includeCommands: true,
            activityLimit: 10,
            ...workflowOptions
        })),
        designer: (action, paramsOrCommand = {}, commandOptions = {}) => (consoleApi.run(DESIGNER_APP, DESIGNER_SURFACE, action, paramsOrCommand, commandOptions)),
        refresh: (appName, surfaceId, commandOptions = {}) => (client.refreshSurface(appName, surfaceId, commandFrom('surface.refresh', {}, commandOptions))),
        designerRefresh: (commandOptions = {}) => (consoleApi.refresh(DESIGNER_APP, DESIGNER_SURFACE, commandOptions)),
        designerValidate: (action, paramsOrCommand = {}) => (consoleApi.validate(DESIGNER_APP, DESIGNER_SURFACE, action, paramsOrCommand)),
        designerValidateWorkflow: (steps) => consoleApi.validateWorkflow(DESIGNER_APP, DESIGNER_SURFACE, steps),
        designerWorkflow: (steps, workflowOptions = {}) => (consoleApi.workflow(DESIGNER_APP, DESIGNER_SURFACE, steps, workflowOptions)),
        designerPreview: (previewOptions = { includeData: true }) => (consoleApi.preview(DESIGNER_APP, DESIGNER_SURFACE, previewOptions)),
        designerPreviewImageUrl: () => consoleApi.previewImageUrl(DESIGNER_APP, DESIGNER_SURFACE),
        inspect: (appName = DESIGNER_APP, surfaceId = DESIGNER_SURFACE, inspectOptions = {}) => (client.inspectSurface(appName, surfaceId, {
            includeCommands: true,
            includeControls: true,
            includeActions: true,
            activityLimit: 20,
            ...inspectOptions
        }))
    };
    return consoleApi;
}
export function installAgentConsole(target = window) {
    const consoleApi = createAgentConsole({ client: createDefaultClient(target) });
    target.blogposterAgentConsole = consoleApi;
    target.blogposterAgent = {
        ...(target.blogposterAgent || {}),
        console: consoleApi,
        httpClient: consoleApi.client
    };
    return consoleApi;
}
