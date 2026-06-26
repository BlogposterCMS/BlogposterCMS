export type AgentCommandStatus = 'queued' | 'delivered' | 'acked' | 'failed' | 'cancelled';

export interface AgentSurfaceCommand {
  id?: string;
  commandId?: string;
  action?: string;
  type?: string;
  target?: unknown;
  params?: Record<string, unknown>;
  value?: unknown;
  status?: AgentCommandStatus | string;
}

export interface AgentActivityEvent {
  id: string;
  type: string;
  appName: string | null;
  surfaceId: string | null;
  surfaceType: string | null;
  commandId: string | null;
  action: string | null;
  status: string | null;
  revision: number | null;
  actor: string | null;
  createdAt: string | null;
  details: Record<string, unknown>;
}

export interface AgentSurfaceCommandRequest {
  action: string;
  type?: string;
  target?: unknown;
  params?: Record<string, unknown>;
  value?: unknown;
  reason?: string;
  waitForResult?: boolean;
  wait?: boolean;
  timeoutMs?: number;
  intervalMs?: number;
  observeDelayMs?: number;
  waitForFreshSnapshot?: boolean;
  snapshotTimeoutMs?: number;
  snapshotIntervalMs?: number;
  includeContext?: boolean;
  includeActivity?: boolean;
  includeTree?: boolean;
  includePreview?: boolean;
  includeCommands?: boolean;
  includeControls?: boolean;
  includeActions?: boolean;
  commandLimit?: number;
  activityLimit?: number;
}

export interface AgentSurfaceWorkflowOptions {
  haltOnFailure?: boolean;
  waitForResult?: boolean;
  wait?: boolean;
  timeoutMs?: number;
  intervalMs?: number;
  observeDelayMs?: number;
  waitForFreshSnapshot?: boolean;
  snapshotTimeoutMs?: number;
  snapshotIntervalMs?: number;
  includeContext?: boolean;
  includeActivity?: boolean;
  includeTree?: boolean;
  includePreview?: boolean;
  includeCommands?: boolean;
  includeControls?: boolean;
  includeActions?: boolean;
  commandLimit?: number;
  activityLimit?: number;
}

export interface AgentSurfaceCommandValidation {
  valid: boolean;
  appName: string;
  surfaceId: string;
  action: string | null;
  label: string | null;
  category: string | null;
  requiredParams: readonly { name: string; type: unknown }[];
  missingParams: readonly string[];
  errors: readonly string[];
  actionDefinition: Record<string, unknown> | null;
  command: AgentSurfaceCommand | null;
}

export interface AgentSurfaceWorkflowValidation {
  valid: boolean;
  appName: string;
  surfaceId: string;
  stepCount: number;
  errors: readonly string[];
  steps: readonly {
    index: number;
    label: string;
    validation: AgentSurfaceCommandValidation;
  }[];
}

export interface AgentSurfaceAction {
  action?: string;
  id?: string;
  label?: string;
  category?: string;
  description?: string;
  params?: readonly unknown[];
  requiresSelection?: boolean;
  [key: string]: unknown;
}

export interface AgentSnapshotNode {
  id: string;
  role: string;
  label: string;
  selector?: string;
  state?: Record<string, unknown>;
  bounds?: Record<string, number>;
}

export interface AgentSurfaceSnapshotPayload {
  surfaceId?: string;
  appName?: string;
  surfaceType?: string;
  title?: string;
  route?: string;
  url?: string;
  status?: string;
  summary?: Record<string, unknown>;
  state?: Record<string, unknown>;
  selection?: unknown;
  tree?: readonly unknown[];
  controls?: readonly unknown[];
  actions?: readonly unknown[];
  visual?: unknown;
  metrics?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface AgentSurfaceContextOptions {
  surfaceId?: string;
  includeTree?: boolean;
  includePreview?: boolean;
  includeCommands?: boolean;
  includeControls?: boolean;
  includeActions?: boolean;
  commandLimit?: number;
}

export interface AgentSurfacePreviewOptions {
  surfaceId?: string;
  includeData?: boolean;
  includePreview?: boolean;
}

export interface AgentSurfaceInspectionOptions extends AgentSurfaceContextOptions, AgentSurfacePreviewOptions {
  includeActivity?: boolean;
  activityLimit?: number;
  category?: string;
}

export interface AgentSurfaceFreshness {
  updatedAt: string | null;
  ageMs: number | null;
  staleAfterMs: number;
  inactiveAfterMs: number;
  stale: boolean;
  inactive: boolean;
}

export interface AgentSurfaceContext {
  surface: Record<string, unknown>;
  state: Record<string, unknown>;
  selection: unknown;
  visual: Record<string, unknown>;
  controls: readonly unknown[];
  actions: readonly unknown[];
  commands: {
    pendingCount: number;
    recent: readonly AgentSurfaceCommand[];
  };
  tree?: readonly unknown[];
}

export interface AgentSurfacePreview {
  surface: Record<string, unknown>;
  visual: Record<string, unknown>;
  available: boolean;
  updatedAt: string | null;
  revision: number | null;
  capturedAt: string | null;
}

export interface AgentSurfaceInspection {
  inspectedAt: string;
  surface: Record<string, unknown>;
  context: AgentSurfaceContext;
  preview: AgentSurfacePreview | null;
  actions: readonly AgentSurfaceAction[];
  activity: readonly AgentActivityEvent[];
  previewImageUrl?: string;
}

export interface AgentCommandObservation {
  observedAt: string;
  command: AgentSurfaceCommand | null;
  surface: AgentSurfaceContext | null;
  activity: readonly AgentActivityEvent[];
  previewImageUrl?: string;
  observation?: {
    waitForFreshSnapshot?: boolean;
    snapshotRevisionBeforeCommand?: number | null;
    freshSnapshot?: {
      fresh: boolean;
      timedOut: boolean;
      timeoutMs: number;
      intervalMs: number;
      waitedForRevisionGreaterThan: number;
      revision: number;
      updatedAt: string | null;
    } | null;
  };
}

export interface AgentSurfaceWorkflow {
  id: string;
  appName: string;
  surfaceId: string;
  status: 'completed' | 'failed' | 'completed_with_errors' | string;
  haltOnFailure: boolean;
  startedAt: string;
  completedAt: string;
  stepCount: number;
  completedSteps: number;
  previewImageUrl?: string;
  steps: readonly {
    index: number;
    label: string;
    action: string | null;
    status: string;
    command?: AgentSurfaceCommand | null;
    observation?: AgentCommandObservation;
    error?: string;
  }[];
}

export interface AgentSystemContextOptions {
  filterAppName?: string;
  surfaceType?: string;
  surfaceIdFilter?: string;
  activeOnly?: boolean;
  staleOnly?: boolean;
  includeActions?: boolean;
  includeControls?: boolean;
  includePreview?: boolean;
  limit?: number;
}

export interface AgentSystemContext {
  module: Record<string, unknown>;
  generatedAt: string;
  counts: {
    surfaces: number;
    pendingCommands: number;
    controllableSurfaces: number;
    staleSurfaces: number;
    inactiveSurfaces: number;
    activityEvents: number;
  };
  surfaces: readonly AgentSurfaceContext[];
}

export interface AgentApiDefinition {
  moduleName: string;
  moduleType: string;
  version: string;
  schemaVersion?: string;
  events: readonly {
    eventName: string;
    access: string;
    [key: string]: unknown;
  }[];
  surfaceContract?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BuildSnapshotContext {
  reason: string;
}

export interface BuildDomSnapshotOptions {
  title?: string;
  surfaceType?: string;
  maxNodes?: number;
  selector?: string;
  actions?: readonly AgentSurfaceAction[];
}

export interface AgentSurfaceClientOptions {
  appName: string;
  surfaceId: string;
  surfaceType?: string;
  title?: string;
  root?: ParentNode | null;
  snapshotIntervalMs?: number;
  pollIntervalMs?: number;
  commandLimit?: number;
  buildSnapshot?: (context: BuildSnapshotContext) => AgentSurfaceSnapshotPayload | Promise<AgentSurfaceSnapshotPayload>;
  handleCommand?: (command: AgentSurfaceCommand) => unknown | Promise<unknown>;
  publishAfterCommand?: boolean;
  commandSnapshotDelayMs?: number;
  onError?: (error: unknown) => void;
}

export interface DomAgentSurfaceOptions extends AgentSurfaceClientOptions {
  selector?: string;
  maxNodes?: number;
  actions?: readonly AgentSurfaceAction[];
  allowGenericCommands?: boolean;
}

export interface AgentControlClientOptions {
  appName: string;
  surfaceId?: string;
  surfaceType?: string;
  title?: string;
  onError?: (error: unknown) => void;
}

export interface AgentSurfaceClient {
  start: () => void;
  stop: () => void;
  publishSnapshot: (reason?: string) => Promise<unknown>;
  pollCommands: () => Promise<AgentSurfaceCommand[]>;
  ackCommand: (command: AgentSurfaceCommand, status?: 'acked' | 'failed', result?: unknown) => Promise<unknown>;
  isRunning: () => boolean;
}

export interface AgentControlClient {
  getCapabilities: () => Promise<unknown>;
  getApiDefinition: () => Promise<AgentApiDefinition | null>;
  getSystemContext: (options?: AgentSystemContextOptions) => Promise<AgentSystemContext | null>;
  listSurfaces: (filter?: Record<string, unknown>) => Promise<unknown[]>;
  getSurfaceSnapshot: (surfaceId?: string) => Promise<AgentSurfaceSnapshotPayload | null>;
  getSurfaceContext: (options?: AgentSurfaceContextOptions) => Promise<AgentSurfaceContext | null>;
  getSurfacePreview: (options?: AgentSurfacePreviewOptions) => Promise<AgentSurfacePreview | null>;
  inspectSurface: (options?: AgentSurfaceInspectionOptions) => Promise<AgentSurfaceInspection | null>;
  listActivity: (options?: {
    appName?: string;
    surfaceId?: string;
    surfaceIdFilter?: string;
    type?: string;
    commandId?: string;
    since?: string;
    limit?: number;
  }) => Promise<AgentActivityEvent[]>;
  listActions: (surfaceId?: string, category?: string) => Promise<AgentSurfaceAction[]>;
  getAction: (action: string, surfaceId?: string) => Promise<AgentSurfaceAction | null>;
  listCommands: (surfaceId?: string, limit?: number) => Promise<AgentSurfaceCommand[]>;
  getCommand: (commandId: string, surfaceId?: string) => Promise<AgentSurfaceCommand | null>;
  waitForCommand: (commandId: string, options?: { surfaceId?: string; timeoutMs?: number; intervalMs?: number }) => Promise<AgentSurfaceCommand | null>;
  validateCommand: (command: AgentSurfaceCommandRequest) => Promise<AgentSurfaceCommandValidation | null>;
  validateWorkflow: (steps: readonly AgentSurfaceCommandRequest[], options?: Pick<AgentSurfaceWorkflowOptions, 'haltOnFailure'>) => Promise<AgentSurfaceWorkflowValidation | null>;
  enqueueCommand: (command: AgentSurfaceCommandRequest) => Promise<AgentSurfaceCommand | null>;
  invokeCommand: (command: AgentSurfaceCommandRequest) => Promise<AgentSurfaceCommand | null>;
  invokeAndObserve: (command: AgentSurfaceCommandRequest) => Promise<AgentCommandObservation | null>;
  refreshSurface: (options?: Partial<AgentSurfaceCommandRequest>) => Promise<AgentCommandObservation | null>;
  invokeWorkflow: (steps: readonly AgentSurfaceCommandRequest[], options?: AgentSurfaceWorkflowOptions) => Promise<AgentSurfaceWorkflow | null>;
}

type AgentEmit = <T = unknown>(
  eventName: string,
  payload?: Record<string, unknown>,
  timeout?: number
) => Promise<T>;

const DEFAULT_SNAPSHOT_INTERVAL_MS = 4000;
const DEFAULT_POLL_INTERVAL_MS = 1600;
const DEFAULT_COMMAND_LIMIT = 10;
const DEFAULT_NODE_LIMIT = 80;
export const SURFACE_AGENT_ACTIONS: readonly AgentSurfaceAction[] = Object.freeze([
  {
    action: 'surface.refresh',
    label: 'Refresh surface snapshot',
    category: 'surface',
    description: 'Publishes a fresh agent-visible surface snapshot without changing domain state.'
  }
]);
const DOM_CONTROL_AGENT_ACTIONS: readonly AgentSurfaceAction[] = Object.freeze([
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
export const DOM_AGENT_ACTIONS: readonly AgentSurfaceAction[] = Object.freeze([
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

function getEmit(): AgentEmit | null {
  return typeof window !== 'undefined' && typeof window.meltdownEmit === 'function'
    ? window.meltdownEmit as AgentEmit
    : null;
}

export function truncateAgentText(value: unknown, maxLength = 140): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function attr(el: Element, name: string): string {
  return el.getAttribute(name) || '';
}

function elementRole(el: HTMLElement): string {
  return attr(el, 'data-agent-role') ||
    attr(el, 'role') ||
    attr(el, 'type') ||
    el.tagName.toLowerCase();
}

function elementLabel(el: HTMLElement): string {
  return truncateAgentText(
    attr(el, 'data-agent-label') ||
    attr(el, 'aria-label') ||
    attr(el, 'title') ||
    (el instanceof HTMLInputElement ? el.value || el.placeholder : '') ||
    el.textContent ||
    elementRole(el)
  );
}

function elementId(el: HTMLElement, index: number): string {
  return truncateAgentText(
    attr(el, 'data-agent-id') ||
    el.id ||
    attr(el, 'data-scene-id') ||
    attr(el, 'data-instance-id') ||
    attr(el, 'data-widget-id') ||
    attr(el, 'data-tool') ||
    attr(el, 'data-stage-scene-action') ||
    `${el.tagName.toLowerCase()}-${index}`,
    120
  );
}

function elementSelector(el: HTMLElement): string | undefined {
  const agentId = attr(el, 'data-agent-id');
  if (agentId) return `[data-agent-id="${cssEscape(agentId)}"]`;
  if (el.id) return `#${cssEscape(el.id)}`;
  const sceneId = attr(el, 'data-scene-id');
  if (sceneId) return `[data-scene-id="${cssEscape(sceneId)}"]`;
  const instanceId = attr(el, 'data-instance-id');
  if (instanceId) return `[data-instance-id="${cssEscape(instanceId)}"]`;
  return undefined;
}

function cssEscape(value: string): string {
  const cssApi = typeof window !== 'undefined' ? window.CSS : undefined;
  return cssApi?.escape ? cssApi.escape(value) : value.replace(/["\\]/g, '\\$&');
}

function commandAction(command: AgentSurfaceCommand): string {
  return String(command.action || command.type || '').trim();
}

function commandParams(command: AgentSurfaceCommand): Record<string, unknown> {
  return command.params && typeof command.params === 'object' && !Array.isArray(command.params)
    ? command.params
    : {};
}

function commandTarget(command: AgentSurfaceCommand): unknown {
  const params = commandParams(command);
  if (params.target != null) return params.target;
  if (params.selector != null) return params.selector;
  if (params.id != null) return params.id;
  if (params.agentId != null) return params.agentId;
  if (command.target != null) return command.target;
  return null;
}

function commandValue(command: AgentSurfaceCommand): unknown {
  const params = commandParams(command);
  if (command.value != null) return command.value;
  if (params.value != null) return params.value;
  if (
    command.target &&
    typeof command.target === 'object' &&
    !Array.isArray(command.target) &&
    Object.prototype.hasOwnProperty.call(command.target, 'value')
  ) {
    return (command.target as Record<string, unknown>).value;
  }
  return undefined;
}

function querySelectorSafe(scope: ParentNode, selector: string): HTMLElement | null {
  try {
    return scope.querySelector<HTMLElement>(selector);
  } catch {
    return null;
  }
}

function resolveDomAgentTarget(
  root: ParentNode | null,
  target: unknown
): HTMLElement | null {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope || target == null) return null;
  if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) return target;

  if (typeof target === 'object' && !Array.isArray(target)) {
    const raw = target as Record<string, unknown>;
    return resolveDomAgentTarget(scope, raw.selector || raw.id || raw.agentId || raw.target || null);
  }

  const text = String(target).trim();
  if (!text) return null;

  const direct = querySelectorSafe(scope, text);
  if (direct) return direct;

  const escaped = cssEscape(text);
  return querySelectorSafe(
    scope,
    `[data-agent-id="${escaped}"], #${escaped}, [name="${escaped}"], [data-scene-id="${escaped}"], [data-instance-id="${escaped}"], [data-widget-id="${escaped}"]`
  );
}

function dispatchDomInputEvents(el: HTMLElement): void {
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function targetSummary(el: HTMLElement): Record<string, unknown> {
  return {
    id: elementId(el, 0),
    role: elementRole(el),
    label: elementLabel(el),
    selector: elementSelector(el)
  };
}

export function handleDomAgentCommand(
  command: AgentSurfaceCommand,
  root: ParentNode | null = typeof document !== 'undefined' ? document : null
): Record<string, unknown> {
  const action = commandAction(command);
  if (!action.startsWith('dom.')) return { handled: false, reason: 'unsupported-action', action };

  const target = resolveDomAgentTarget(root, commandTarget(command));
  if (!target) return { handled: false, reason: 'target-not-found', action };
  if (target.hasAttribute('disabled')) return { handled: false, reason: 'target-disabled', action, target: targetSummary(target) };

  if (action === 'dom.click') {
    target.click();
    return { handled: true, action, target: targetSummary(target) };
  }

  if (action === 'dom.focus') {
    target.focus();
    return { handled: true, action, target: targetSummary(target) };
  }

  if (action === 'dom.setValue') {
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    ) {
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
    if (!form) return { handled: false, reason: 'form-not-found', action, target: targetSummary(target) };
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
    const notCancelled = form.dispatchEvent(submitEvent);
    return { handled: true, action, submitted: notCancelled, target: targetSummary(form) };
  }

  return { handled: false, reason: 'unsupported-action', action, target: targetSummary(target) };
}

function elementState(el: HTMLElement): Record<string, unknown> {
  const state: Record<string, unknown> = {};
  if (el.classList.contains('active')) state.active = true;
  if (el.classList.contains('selected')) state.selected = true;
  if (el.hasAttribute('disabled')) state.disabled = true;
  if (el.getAttribute('aria-selected')) state.ariaSelected = el.getAttribute('aria-selected');
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    state.value = truncateAgentText(el.value, 300);
  }
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    state.checked = el.checked;
  }
  for (const key of ['sceneId', 'widgetId', 'behavior', 'tool', 'stageSceneAction']) {
    const datasetValue = el.dataset[key];
    if (datasetValue) state[key] = datasetValue;
  }
  return state;
}

function elementBounds(el: HTMLElement): Record<string, number> | undefined {
  if (typeof el.getBoundingClientRect !== 'function') return undefined;
  const rect = el.getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height)) return undefined;
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
}

export function buildDomAgentSnapshot(
  root: ParentNode | null = typeof document !== 'undefined' ? document : null,
  options: BuildDomSnapshotOptions = {}
): AgentSurfaceSnapshotPayload {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  const nodes = scope
    ? Array.from(scope.querySelectorAll<HTMLElement>(options.selector || SNAPSHOT_SELECTOR))
    : [];
  const maxNodes = Math.max(1, options.maxNodes || DEFAULT_NODE_LIMIT);
  const tree: AgentSnapshotNode[] = nodes.slice(0, maxNodes).map((el, index) => ({
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

function mergeAgentActions(...sets: Array<readonly AgentSurfaceAction[] | undefined>): AgentSurfaceAction[] {
  const merged = new Map<string, AgentSurfaceAction>();
  for (const set of sets) {
    for (const action of set || []) {
      const key = String(action.action || action.id || '').trim();
      if (key && !merged.has(key)) merged.set(key, action);
    }
  }
  return Array.from(merged.values());
}

function commandId(command: AgentSurfaceCommand): string {
  return String(command.id || command.commandId || '').trim();
}

function reportError(options: AgentSurfaceClientOptions, error: unknown): void {
  if (typeof options.onError === 'function') {
    options.onError(error);
    return;
  }
  if (typeof console !== 'undefined') {
    console.warn('[agentSurfaceClient]', error);
  }
}

function controlBasePayload(options: AgentControlClientOptions, surfaceId?: string): Record<string, unknown> {
  return {
    appName: options.appName,
    surfaceId: surfaceId || options.surfaceId || 'default',
    surfaceType: options.surfaceType || 'workspace',
    title: options.title || surfaceId || options.surfaceId || options.appName
  };
}

function reportControlError(options: AgentControlClientOptions, error: unknown): void {
  if (typeof options.onError === 'function') {
    options.onError(error);
    return;
  }
  if (typeof console !== 'undefined') {
    console.warn('[agentControlClient]', error);
  }
}

export function createAgentControlClient(options: AgentControlClientOptions): AgentControlClient {
  const emitOrNull = (): AgentEmit | null => getEmit();

  const safeEmit = async <T = unknown>(
    eventName: string,
    payload: Record<string, unknown> = {}
  ): Promise<T | null> => {
    const emit = emitOrNull();
    if (!emit) return null;
    try {
      return await emit<T>(eventName, payload);
    } catch (error) {
      reportControlError(options, error);
      return null;
    }
  };

  return {
    getCapabilities: () => safeEmit('agent.getCapabilities', controlBasePayload(options)),
    getApiDefinition: () => safeEmit<AgentApiDefinition>('agent.getApiDefinition', controlBasePayload(options)),
    getSystemContext: (systemOptions: AgentSystemContextOptions = {}) => safeEmit<AgentSystemContext>('agent.getSystemContext', {
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
    listSurfaces: async (filter: Record<string, unknown> = {}) => {
      const result = await safeEmit<unknown[]>('agent.listSurfaceSnapshots', {
        ...controlBasePayload(options, options.surfaceId),
        ...filter
      });
      return Array.isArray(result) ? result : [];
    },
    getSurfaceSnapshot: (surfaceId = options.surfaceId || 'default') => safeEmit<AgentSurfaceSnapshotPayload>('agent.getSurfaceSnapshot', {
      ...controlBasePayload(options, surfaceId)
    }),
    getSurfaceContext: (contextOptions: AgentSurfaceContextOptions = {}) => safeEmit<AgentSurfaceContext>('agent.getSurfaceContext', {
      ...controlBasePayload(options, contextOptions.surfaceId),
      includeTree: contextOptions.includeTree,
      includePreview: contextOptions.includePreview,
      includeCommands: contextOptions.includeCommands,
      includeControls: contextOptions.includeControls,
      includeActions: contextOptions.includeActions,
      commandLimit: contextOptions.commandLimit
    }),
    getSurfacePreview: (previewOptions: AgentSurfacePreviewOptions = {}) => safeEmit<AgentSurfacePreview>('agent.getSurfacePreview', {
      ...controlBasePayload(options, previewOptions.surfaceId),
      includeData: previewOptions.includeData,
      includePreview: previewOptions.includePreview
    }),
    inspectSurface: (inspectOptions: AgentSurfaceInspectionOptions = {}) => safeEmit<AgentSurfaceInspection>('agent.inspectSurface', {
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
      const result = await safeEmit<AgentActivityEvent[]>('agent.listActivity', {
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
    listActions: async (surfaceId = options.surfaceId || 'default', category?: string) => {
      const result = await safeEmit<AgentSurfaceAction[]>('agent.listSurfaceActions', {
        ...controlBasePayload(options, surfaceId),
        ...(category ? { category } : {})
      });
      return Array.isArray(result) ? result : [];
    },
    getAction: (action: string, surfaceId = options.surfaceId || 'default') => safeEmit<AgentSurfaceAction>('agent.getSurfaceAction', {
      ...controlBasePayload(options, surfaceId),
      action
    }),
    listCommands: async (surfaceId = options.surfaceId || 'default', limit = 25) => {
      const result = await safeEmit<AgentSurfaceCommand[]>('agent.listSurfaceCommands', {
        ...controlBasePayload(options, surfaceId),
        limit
      });
      return Array.isArray(result) ? result : [];
    },
    getCommand: (commandId: string, surfaceId = options.surfaceId || 'default') => safeEmit<AgentSurfaceCommand>('agent.getSurfaceCommand', {
      ...controlBasePayload(options, surfaceId),
      commandId
    }),
    waitForCommand: (
      commandId: string,
      waitOptions: { surfaceId?: string; timeoutMs?: number; intervalMs?: number } = {}
    ) => safeEmit<AgentSurfaceCommand>('agent.waitForSurfaceCommand', {
      ...controlBasePayload(options, waitOptions.surfaceId),
      commandId,
      timeoutMs: waitOptions.timeoutMs,
      intervalMs: waitOptions.intervalMs
    }),
    validateCommand: (command: AgentSurfaceCommandRequest) => safeEmit<AgentSurfaceCommandValidation>('agent.validateSurfaceCommand', {
      ...controlBasePayload(options, options.surfaceId),
      command
    }),
    validateWorkflow: (steps: readonly AgentSurfaceCommandRequest[], workflowOptions: Pick<AgentSurfaceWorkflowOptions, 'haltOnFailure'> = {}) => safeEmit<AgentSurfaceWorkflowValidation>('agent.validateSurfaceWorkflow', {
      ...controlBasePayload(options, options.surfaceId),
      steps,
      haltOnFailure: workflowOptions.haltOnFailure
    }),
    enqueueCommand: (command: AgentSurfaceCommandRequest) => safeEmit<AgentSurfaceCommand>('agent.enqueueSurfaceCommand', {
      ...controlBasePayload(options, options.surfaceId),
      command
    }),
    invokeCommand: (command: AgentSurfaceCommandRequest) => safeEmit<AgentSurfaceCommand>('agent.invokeSurfaceCommand', {
      ...controlBasePayload(options, options.surfaceId),
      command,
      wait: command.wait,
      waitForResult: command.waitForResult,
      timeoutMs: command.timeoutMs,
      intervalMs: command.intervalMs
    }),
    invokeAndObserve: (command: AgentSurfaceCommandRequest) => safeEmit<AgentCommandObservation>('agent.invokeSurfaceCommandAndObserve', {
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
    refreshSurface: (refreshOptions: Partial<AgentSurfaceCommandRequest> = {}) => safeEmit<AgentCommandObservation>('agent.refreshSurface', {
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
    invokeWorkflow: (steps: readonly AgentSurfaceCommandRequest[], workflowOptions: AgentSurfaceWorkflowOptions = {}) => safeEmit<AgentSurfaceWorkflow>('agent.invokeSurfaceWorkflow', {
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

export function createAgentSurfaceClient(options: AgentSurfaceClientOptions): AgentSurfaceClient {
  let running = false;
  let snapshotTimer: number | undefined;
  let commandTimer: number | undefined;
  let publishing = false;
  let polling = false;

  const basePayload = (): Record<string, unknown> => ({
    appName: options.appName,
    surfaceId: options.surfaceId,
    surfaceType: options.surfaceType || 'workspace',
    title: options.title || options.surfaceId
  });

  const publishSnapshot = async (reason = 'manual'): Promise<unknown> => {
    const emit = getEmit();
    if (!emit || publishing) return null;
    publishing = true;
    try {
      const snapshot = options.buildSnapshot
        ? await options.buildSnapshot({ reason })
        : buildDomAgentSnapshot(options.root || document, {
          title: options.title,
          surfaceType: options.surfaceType
        });
      const snapshotActions = Array.isArray(snapshot.actions)
        ? snapshot.actions as readonly AgentSurfaceAction[]
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
    } catch (error) {
      reportError(options, error);
      return null;
    } finally {
      publishing = false;
    }
  };

  const ackCommand = async (
    command: AgentSurfaceCommand,
    status: 'acked' | 'failed' = 'acked',
    result: unknown = null
  ): Promise<unknown> => {
    const emit = getEmit();
    const id = commandId(command);
    if (!emit || !id) return null;
    return emit('agent.ackSurfaceCommand', {
      ...basePayload(),
      commandId: id,
      status,
      ...(status === 'failed' ? { error: result instanceof Error ? result.message : String(result || 'Command failed') } : { result })
    });
  };

  const pollCommands = async (): Promise<AgentSurfaceCommand[]> => {
    const emit = getEmit();
    if (!emit || polling) return [];
    polling = true;
    try {
      const commands = await emit<AgentSurfaceCommand[]>('agent.pollSurfaceCommands', {
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
            if (!handledDomainCommand) snapshotReason = 'refresh';
            continue;
          }
          handledDomainCommand = true;
          snapshotReason = 'command';
          const result = options.handleCommand
            ? await options.handleCommand(command)
            : { handled: false };
          await ackCommand(command, 'acked', result ?? { handled: true });
          handledAny = true;
        } catch (error) {
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
    } catch (error) {
      reportError(options, error);
      return [];
    } finally {
      polling = false;
    }
  };

  const stop = (): void => {
    running = false;
    if (snapshotTimer) window.clearInterval(snapshotTimer);
    if (commandTimer) window.clearInterval(commandTimer);
    snapshotTimer = undefined;
    commandTimer = undefined;
  };

  const start = (): void => {
    if (running || typeof window === 'undefined') return;
    running = true;
    void (async () => {
      await publishSnapshot('start');
      if (running && options.handleCommand) await pollCommands();
    })();

    const snapshotInterval = Math.max(0, options.snapshotIntervalMs ?? DEFAULT_SNAPSHOT_INTERVAL_MS);
    if (snapshotInterval > 0) {
      snapshotTimer = window.setInterval(() => {
        if (running) void publishSnapshot('interval');
      }, snapshotInterval);
    }

    const pollInterval = Math.max(0, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
    if (options.handleCommand && pollInterval > 0) {
      commandTimer = window.setInterval(() => {
        if (running) void pollCommands();
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

export function startDomAgentSurface(options: DomAgentSurfaceOptions): AgentSurfaceClient {
  const root = options.root || (typeof document !== 'undefined' ? document : null);
  const genericActions = options.allowGenericCommands === false
    ? []
    : mergeAgentActions(options.actions || DOM_AGENT_ACTIONS, DOM_AGENT_ACTIONS);

  const buildSnapshot = async (context: BuildSnapshotContext): Promise<AgentSurfaceSnapshotPayload> => {
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
      actions: mergeAgentActions(genericActions, base.actions as readonly AgentSurfaceAction[] | undefined),
      meta: {
        ...(domSnapshot.meta || {}),
        ...(base.meta || {}),
        adapter: 'dom-agent-surface'
      }
    };
  };

  const handleCommand = async (command: AgentSurfaceCommand): Promise<unknown> => {
    if (options.handleCommand) {
      const result = await options.handleCommand(command);
      if (
        result &&
        typeof result === 'object' &&
        !Array.isArray(result) &&
        (result as Record<string, unknown>).handled !== false
      ) {
        return result;
      }
      if (options.allowGenericCommands === false) return result;
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
