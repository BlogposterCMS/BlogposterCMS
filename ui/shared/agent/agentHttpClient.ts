import { fetchWithTimeout } from '../api-client/meltdownClient';
import type {
  AgentActivityEvent,
  AgentApiDefinition,
  AgentCommandObservation,
  AgentSurfaceAction,
  AgentSurfaceCommand,
  AgentSurfaceCommandRequest,
  AgentSurfaceCommandValidation,
  AgentSurfaceContext,
  AgentSurfaceContextOptions,
  AgentSurfaceInspection,
  AgentSurfaceInspectionOptions,
  AgentSurfacePreview,
  AgentSurfacePreviewOptions,
  AgentSurfaceSnapshotPayload,
  AgentSurfaceWorkflow,
  AgentSurfaceWorkflowOptions,
  AgentSurfaceWorkflowValidation,
  AgentSystemContext,
  AgentSystemContextOptions
} from './agentSurfaceClient';

export interface AgentHttpTokenProvider {
  getAdminToken?: () => string | null;
  getCsrfToken?: () => string | null;
}

export interface AgentHttpClientOptions {
  basePath?: string;
  fetchImpl?: typeof fetch;
  tokenProvider?: AgentHttpTokenProvider;
  timeoutMs?: number;
}

export interface AgentHttpClient {
  getCapabilities: () => Promise<unknown>;
  getApiDefinition: () => Promise<AgentApiDefinition>;
  getSystemContext: (options?: AgentSystemContextOptions) => Promise<AgentSystemContext>;
  listActivity: (options?: { appName?: string; surfaceId?: string; type?: string; commandId?: string; since?: string; limit?: number }) => Promise<AgentActivityEvent[]>;
  listSurfaces: (options?: { appName?: string; surfaceType?: string; includeTree?: boolean; limit?: number }) => Promise<unknown[]>;
  getSurfaceSnapshot: (appName: string, surfaceId: string) => Promise<AgentSurfaceSnapshotPayload | null>;
  getSurfaceContext: (appName: string, surfaceId: string, options?: AgentSurfaceContextOptions) => Promise<AgentSurfaceContext | null>;
  getSurfacePreview: (appName: string, surfaceId: string, options?: AgentSurfacePreviewOptions) => Promise<AgentSurfacePreview | null>;
  getSurfacePreviewImageUrl: (appName: string, surfaceId: string) => string;
  inspectSurface: (appName: string, surfaceId: string, options?: AgentSurfaceInspectionOptions) => Promise<AgentSurfaceInspection | null>;
  listActions: (appName: string, surfaceId: string, category?: string) => Promise<AgentSurfaceAction[]>;
  listCommands: (appName: string, surfaceId: string, limit?: number) => Promise<AgentSurfaceCommand[]>;
  validateCommand: (appName: string, surfaceId: string, command: AgentSurfaceCommandRequest) => Promise<AgentSurfaceCommandValidation>;
  validateWorkflow: (
    appName: string,
    surfaceId: string,
    steps: readonly AgentSurfaceCommandRequest[],
    options?: Pick<AgentSurfaceWorkflowOptions, 'haltOnFailure'>
  ) => Promise<AgentSurfaceWorkflowValidation>;
  enqueueCommand: (appName: string, surfaceId: string, command: AgentSurfaceCommandRequest) => Promise<AgentSurfaceCommand>;
  invokeCommand: (appName: string, surfaceId: string, command: AgentSurfaceCommandRequest) => Promise<AgentSurfaceCommand>;
  invokeAndObserve: (appName: string, surfaceId: string, command: AgentSurfaceCommandRequest) => Promise<AgentCommandObservation>;
  refreshSurface: (
    appName: string,
    surfaceId: string,
    options?: Partial<AgentSurfaceCommandRequest>
  ) => Promise<AgentCommandObservation>;
  invokeWorkflow: (
    appName: string,
    surfaceId: string,
    steps: readonly AgentSurfaceCommandRequest[],
    options?: AgentSurfaceWorkflowOptions
  ) => Promise<AgentSurfaceWorkflow>;
  waitForCommand: (
    appName: string,
    surfaceId: string,
    commandId: string,
    options?: { timeoutMs?: number; intervalMs?: number }
  ) => Promise<AgentSurfaceCommand | null>;
}

const DEFAULT_BASE_PATH = '/admin/api/agent';
const DEFAULT_TIMEOUT_MS = 10000;

function definedQuery(options: Record<string, unknown> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (typeof value === 'undefined' || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function encodePathPart(value: string): string {
  return encodeURIComponent(String(value || '').trim());
}

function endpoint(basePath: string, path: string, query?: Record<string, unknown>): string {
  const base = basePath.replace(/\/+$/g, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}${definedQuery(query)}`;
}

async function parseAgentResponse<T>(response: Response): Promise<T> {
  let json: { data?: T; error?: string };
  try {
    json = await response.json();
  } catch {
    throw new Error(response.statusText || 'Invalid agent API response');
  }
  if (!response.ok || json.error) {
    throw new Error(json.error || response.statusText || 'Agent API request failed');
  }
  return json.data as T;
}

export function createAgentHttpClient(options: AgentHttpClientOptions = {}): AgentHttpClient {
  const basePath = options.basePath || DEFAULT_BASE_PATH;
  const fetchImpl = options.fetchImpl || fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const tokenProvider = options.tokenProvider || {};

  async function request<T>(
    path: string,
    init: RequestInit = {},
    query?: Record<string, unknown>
  ): Promise<T> {
    const headers: Record<string, string> = {
      ...(init.headers as Record<string, string> | undefined)
    };
    const csrfToken = tokenProvider.getCsrfToken?.();
    const adminToken = tokenProvider.getAdminToken?.();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    if (adminToken) headers.Authorization = `Bearer ${adminToken}`;

    const response = await fetchWithTimeout(fetchImpl, endpoint(basePath, path, query), {
      credentials: 'same-origin',
      ...init,
      headers
    }, timeoutMs);
    return parseAgentResponse<T>(response);
  }

  function commandOptionPayload(command: Partial<AgentSurfaceCommandRequest> = {}): Record<string, unknown> {
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

  function commandBody(command: AgentSurfaceCommandRequest, invoke = false): string {
    return JSON.stringify({
      command,
      invoke,
      ...commandOptionPayload(command)
    });
  }

  function refreshBody(refreshOptions: Partial<AgentSurfaceCommandRequest> = {}): string {
    return JSON.stringify({
      reason: refreshOptions.reason,
      ...commandOptionPayload(refreshOptions)
    });
  }

  function workflowBody(steps: readonly AgentSurfaceCommandRequest[], workflowOptions: AgentSurfaceWorkflowOptions = {}): string {
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

  function previewImageUrl(appName: string, surfaceId: string): string {
    return endpoint(
      basePath,
      `/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/preview/image`
    );
  }

  function withPreviewImageUrl(
    observation: AgentCommandObservation,
    appName: string,
    surfaceId: string
  ): AgentCommandObservation {
    return {
      ...observation,
      previewImageUrl: observation.previewImageUrl || previewImageUrl(appName, surfaceId)
    };
  }

  function withWorkflowPreviewImageUrl(
    workflow: AgentSurfaceWorkflow,
    appName: string,
    surfaceId: string
  ): AgentSurfaceWorkflow {
    const url = workflow.previewImageUrl || previewImageUrl(appName, surfaceId);
    return {
      ...workflow,
      previewImageUrl: url,
      steps: Array.isArray(workflow.steps)
        ? workflow.steps.map(step => (
          step.observation
            ? {
              ...step,
              observation: {
                ...step.observation,
                previewImageUrl: step.observation.previewImageUrl || url
              }
            }
            : step
        ))
        : []
    };
  }

  return {
    getCapabilities: () => request('/capabilities'),
    getApiDefinition: () => request<AgentApiDefinition>('/definition'),
    getSystemContext: (contextOptions: AgentSystemContextOptions = {}) => request<AgentSystemContext>('/context', {}, contextOptions as Record<string, unknown>),
    listActivity: (activityOptions = {}) => request<AgentActivityEvent[]>('/activity', {}, activityOptions),
    listSurfaces: (listOptions = {}) => request<unknown[]>('/surfaces', {}, listOptions),
    getSurfaceSnapshot: (appName, surfaceId) => request<AgentSurfaceSnapshotPayload | null>(
      `/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}`
    ),
    getSurfaceContext: (appName, surfaceId, contextOptions: AgentSurfaceContextOptions = {}) => request<AgentSurfaceContext | null>(
      `/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/context`,
      {},
      contextOptions as Record<string, unknown>
    ),
    getSurfacePreview: (appName, surfaceId, previewOptions: AgentSurfacePreviewOptions = {}) => request<AgentSurfacePreview | null>(
      `/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/preview`,
      {},
      previewOptions as Record<string, unknown>
    ),
    getSurfacePreviewImageUrl: previewImageUrl,
    inspectSurface: async (appName, surfaceId, inspectOptions: AgentSurfaceInspectionOptions = {}) => {
      const inspection = await request<AgentSurfaceInspection | null>(
        `/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/inspect`,
        {},
        inspectOptions as Record<string, unknown>
      );
      return inspection ? { ...inspection, previewImageUrl: inspection.previewImageUrl || previewImageUrl(appName, surfaceId) } : null;
    },
    listActions: (appName, surfaceId, category) => request<AgentSurfaceAction[]>(
      `/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/actions`,
      {},
      { category }
    ),
    listCommands: (appName, surfaceId, limit) => request<AgentSurfaceCommand[]>(
      `/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/commands`,
      {},
      { limit }
    ),
    validateCommand: (appName, surfaceId, command) => request<AgentSurfaceCommandValidation>(
      `/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/commands/validate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
      }
    ),
    validateWorkflow: (appName, surfaceId, steps, workflowOptions = {}) => request<AgentSurfaceWorkflowValidation>(
      `/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/workflows/validate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steps, haltOnFailure: workflowOptions.haltOnFailure })
      }
    ),
    enqueueCommand: (appName, surfaceId, command) => request<AgentSurfaceCommand>(
      `/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/commands`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: commandBody(command, false)
      }
    ),
    invokeCommand: (appName, surfaceId, command) => request<AgentSurfaceCommand>(
      `/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/commands`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: commandBody(command, true)
      }
    ),
    invokeAndObserve: async (appName, surfaceId, command) => withPreviewImageUrl(
      await request<AgentCommandObservation>(
        `/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/commands/observe`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: commandBody(command, true)
        }
      ),
      appName,
      surfaceId
    ),
    refreshSurface: async (appName, surfaceId, refreshOptions = {}) => withPreviewImageUrl(
      await request<AgentCommandObservation>(
        `/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/refresh`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: refreshBody(refreshOptions)
        }
      ),
      appName,
      surfaceId
    ),
    invokeWorkflow: async (appName, surfaceId, steps, workflowOptions = {}) => withWorkflowPreviewImageUrl(
      await request<AgentSurfaceWorkflow>(
        `/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/workflows`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: workflowBody(steps, workflowOptions)
        }
      ),
      appName,
      surfaceId
    ),
    waitForCommand: (appName, surfaceId, commandId, waitOptions = {}) => request<AgentSurfaceCommand | null>(
      `/surfaces/${encodePathPart(appName)}/${encodePathPart(surfaceId)}/commands/${encodePathPart(commandId)}/wait`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(waitOptions)
      }
    )
  };
}
