import {
  createAgentHttpClient,
  type AgentHttpClient
} from './agentHttpClient';
import type {
  AgentCommandObservation,
  AgentSurfaceCommandRequest,
  AgentSurfaceContextOptions,
  AgentSurfaceInspectionOptions,
  AgentSurfacePreviewOptions,
  AgentSurfaceWorkflowOptions,
  AgentSystemContextOptions
} from './agentSurfaceClient';

export interface AgentConsole {
  client: AgentHttpClient;
  context: (options?: AgentSystemContextOptions) => ReturnType<AgentHttpClient['getSystemContext']>;
  surfaces: (options?: Parameters<AgentHttpClient['listSurfaces']>[0]) => ReturnType<AgentHttpClient['listSurfaces']>;
  activity: (options?: Parameters<AgentHttpClient['listActivity']>[0]) => ReturnType<AgentHttpClient['listActivity']>;
  surface: (appName: string, surfaceId: string, options?: AgentSurfaceContextOptions) => ReturnType<AgentHttpClient['getSurfaceContext']>;
  preview: (appName: string, surfaceId: string, options?: AgentSurfacePreviewOptions | boolean) => ReturnType<AgentHttpClient['getSurfacePreview']>;
  previewImageUrl: (appName: string, surfaceId: string) => string;
  actions: (appName: string, surfaceId: string, category?: string) => ReturnType<AgentHttpClient['listActions']>;
  commands: (appName: string, surfaceId: string, limit?: number) => ReturnType<AgentHttpClient['listCommands']>;
  validate: (
    appName: string,
    surfaceId: string,
    action: string,
    paramsOrCommand?: Record<string, unknown> | Partial<AgentSurfaceCommandRequest>
  ) => ReturnType<AgentHttpClient['validateCommand']>;
  validateWorkflow: (
    appName: string,
    surfaceId: string,
    steps: readonly AgentSurfaceCommandRequest[]
  ) => ReturnType<AgentHttpClient['validateWorkflow']>;
  run: (
    appName: string,
    surfaceId: string,
    action: string,
    paramsOrCommand?: Record<string, unknown> | Partial<AgentSurfaceCommandRequest>,
    options?: Partial<AgentSurfaceCommandRequest>
  ) => Promise<AgentCommandObservation>;
  workflow: (
    appName: string,
    surfaceId: string,
    steps: readonly AgentSurfaceCommandRequest[],
    options?: AgentSurfaceWorkflowOptions
  ) => ReturnType<AgentHttpClient['invokeWorkflow']>;
  designer: (
    action: string,
    paramsOrCommand?: Record<string, unknown> | Partial<AgentSurfaceCommandRequest>,
    options?: Partial<AgentSurfaceCommandRequest>
  ) => Promise<AgentCommandObservation>;
  refresh: (
    appName: string,
    surfaceId: string,
    options?: Partial<AgentSurfaceCommandRequest>
  ) => Promise<AgentCommandObservation>;
  designerRefresh: (options?: Partial<AgentSurfaceCommandRequest>) => Promise<AgentCommandObservation>;
  designerValidate: (
    action: string,
    paramsOrCommand?: Record<string, unknown> | Partial<AgentSurfaceCommandRequest>
  ) => ReturnType<AgentHttpClient['validateCommand']>;
  designerValidateWorkflow: (steps: readonly AgentSurfaceCommandRequest[]) => ReturnType<AgentHttpClient['validateWorkflow']>;
  designerWorkflow: (
    steps: readonly AgentSurfaceCommandRequest[],
    options?: AgentSurfaceWorkflowOptions
  ) => ReturnType<AgentHttpClient['invokeWorkflow']>;
  designerPreview: (options?: AgentSurfacePreviewOptions | boolean) => ReturnType<AgentHttpClient['getSurfacePreview']>;
  designerPreviewImageUrl: () => string;
  inspect: (appName?: string, surfaceId?: string, options?: AgentSurfaceInspectionOptions) => ReturnType<AgentHttpClient['inspectSurface']>;
}

export interface AgentConsoleOptions {
  client?: AgentHttpClient;
}

const DESIGNER_APP = 'designer';
const DESIGNER_SURFACE = 'studio.designer';

function createDefaultClient(target?: Window): AgentHttpClient {
  const tokenWindow = target || (typeof window !== 'undefined' ? window : undefined);
  return createAgentHttpClient({
    tokenProvider: {
      getAdminToken: () => tokenWindow?.ADMIN_TOKEN || null,
      getCsrfToken: () => tokenWindow?.CSRF_TOKEN || null
    }
  });
}

function commandFrom(
  action: string,
  paramsOrCommand: Record<string, unknown> | Partial<AgentSurfaceCommandRequest> = {},
  options: Partial<AgentSurfaceCommandRequest> = {}
): AgentSurfaceCommandRequest {
  const source = paramsOrCommand && typeof paramsOrCommand === 'object'
    ? paramsOrCommand as Record<string, unknown> & Partial<AgentSurfaceCommandRequest>
    : {};
  const hasCommandShape = Boolean(source.action || source.type || source.target || source.value || source.reason || source.params);
  const command: Partial<AgentSurfaceCommandRequest> = hasCommandShape
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

function previewOptionsFrom(options: AgentSurfacePreviewOptions | boolean = { includeData: true }): AgentSurfacePreviewOptions {
  if (typeof options === 'boolean') return { includeData: options };
  return { includeData: true, ...options };
}

export function createAgentConsole(options: AgentConsoleOptions = {}): AgentConsole {
  const client = options.client || createDefaultClient();

  const consoleApi: AgentConsole = {
    client,
    context: (contextOptions = {}) => client.getSystemContext(contextOptions),
    surfaces: (surfaceOptions = {}) => client.listSurfaces(surfaceOptions),
    activity: (activityOptions = {}) => client.listActivity(activityOptions),
    surface: (appName, surfaceId, surfaceOptions = {}) => client.getSurfaceContext(appName, surfaceId, surfaceOptions),
    preview: (appName, surfaceId, previewOptions = { includeData: true }) => (
      client.getSurfacePreview(appName, surfaceId, previewOptionsFrom(previewOptions))
    ),
    previewImageUrl: (appName, surfaceId) => client.getSurfacePreviewImageUrl(appName, surfaceId),
    actions: (appName, surfaceId, category) => client.listActions(appName, surfaceId, category),
    commands: (appName, surfaceId, limit) => client.listCommands(appName, surfaceId, limit),
    validate: (appName, surfaceId, action, paramsOrCommand = {}) => (
      client.validateCommand(appName, surfaceId, commandFrom(action, paramsOrCommand, {
        waitForResult: undefined,
        observeDelayMs: undefined,
        waitForFreshSnapshot: undefined,
        snapshotTimeoutMs: undefined,
        includeCommands: undefined,
        activityLimit: undefined
      }))
    ),
    validateWorkflow: (appName, surfaceId, steps) => client.validateWorkflow(appName, surfaceId, steps),
    run: (appName, surfaceId, action, paramsOrCommand = {}, commandOptions = {}) => (
      client.invokeAndObserve(appName, surfaceId, commandFrom(action, paramsOrCommand, commandOptions))
    ),
    workflow: (appName, surfaceId, steps, workflowOptions = {}) => (
      client.invokeWorkflow(appName, surfaceId, steps, {
        waitForResult: true,
        waitForFreshSnapshot: true,
        snapshotTimeoutMs: 2500,
        includeCommands: true,
        activityLimit: 10,
        ...workflowOptions
      })
    ),
    designer: (action, paramsOrCommand = {}, commandOptions = {}) => (
      consoleApi.run(DESIGNER_APP, DESIGNER_SURFACE, action, paramsOrCommand, commandOptions)
    ),
    refresh: (appName, surfaceId, commandOptions = {}) => (
      client.refreshSurface(appName, surfaceId, commandFrom('surface.refresh', {}, commandOptions))
    ),
    designerRefresh: (commandOptions = {}) => (
      consoleApi.refresh(DESIGNER_APP, DESIGNER_SURFACE, commandOptions)
    ),
    designerValidate: (action, paramsOrCommand = {}) => (
      consoleApi.validate(DESIGNER_APP, DESIGNER_SURFACE, action, paramsOrCommand)
    ),
    designerValidateWorkflow: (steps) => consoleApi.validateWorkflow(DESIGNER_APP, DESIGNER_SURFACE, steps),
    designerWorkflow: (steps, workflowOptions = {}) => (
      consoleApi.workflow(DESIGNER_APP, DESIGNER_SURFACE, steps, workflowOptions)
    ),
    designerPreview: (previewOptions = { includeData: true }) => (
      consoleApi.preview(DESIGNER_APP, DESIGNER_SURFACE, previewOptions)
    ),
    designerPreviewImageUrl: () => consoleApi.previewImageUrl(DESIGNER_APP, DESIGNER_SURFACE),
    inspect: (appName = DESIGNER_APP, surfaceId = DESIGNER_SURFACE, inspectOptions = {}) => (
      client.inspectSurface(appName, surfaceId, {
        includeCommands: true,
        includeControls: true,
        includeActions: true,
        activityLimit: 20,
        ...inspectOptions
      })
    )
  };

  return consoleApi;
}

export function installAgentConsole(target: Window = window): AgentConsole {
  const consoleApi = createAgentConsole({ client: createDefaultClient(target) });
  target.blogposterAgentConsole = consoleApi;
  target.blogposterAgent = {
    ...(target.blogposterAgent || {}),
    console: consoleApi,
    httpClient: consoleApi.client
  };
  return consoleApi;
}
