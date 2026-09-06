import { createAgentSurfaceClient, type AgentSurfaceAction, type AgentSurfaceCommand } from './agentSurfaceClient.js';
import { registerWorkspaceChanges } from '../navigation/workspaceChanges.js';
import { showToast } from '../feedback/toast.js';
import { emitRuntimeAdmin } from '../api-client/runtimeFacade.js';

/** The admin host uses its existing facade, never raw internal Meltdown events. */
export async function emitWorkspaceAgent<T = unknown>(event: string, payload?: Record<string, unknown>): Promise<T> {
  const actions: Record<string, string> = {
    'agent.publishSurfaceSnapshot': 'publish', 'agent.pollSurfaceCommands': 'poll', 'agent.ackSurfaceCommand': 'ack'
  };
  const action = actions[event];
  if (!action || !window.meltdownEmit) throw new Error('CMS_AGENT_TRANSPORT_UNAVAILABLE');
  return emitRuntimeAdmin<T>(window.meltdownEmit, window.ADMIN_TOKEN, 'agentSurface', action, payload);
}

export interface WorkspaceAgentState {
  dirty: boolean;
  busy: boolean;
  error?: string | null;
  selection?: unknown;
  [key: string]: unknown;
}

export interface WorkspaceAgentAction extends AgentSurfaceAction {
  action: string;
  run: (params: Record<string, unknown>) => unknown | Promise<unknown>;
  readOnly?: boolean;
  acceptsDraft?: boolean;
  confirm?: boolean;
}

/** Read the real owner's state at execution time, not the last published copy.
 * The instance prefix also prevents commands for an old tab from editing a new one.
 */
export function createWorkspaceCommandGuard(read: () => WorkspaceAgentState) {
  const instance = Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16)).join('-');
  let version = 0;
  let fingerprint = '';
  let executing = false;
  let lastResult: Record<string, unknown> | null = null;
  function snapshot() {
    const state = read();
    const next = JSON.stringify(state);
    if (next !== fingerprint) { fingerprint = next; version += 1; }
    return { ...state, busy: state.busy || executing, stateRevision: `${instance}:${version}`, lastCommand: lastResult };
  }
  async function execute(command: AgentSurfaceCommand, actions: readonly WorkspaceAgentAction[]) {
    const action = actions.find(candidate => candidate.action === (command.action || command.type));
    if (!action) throw new Error('CMS_AGENT_ACTION_UNSUPPORTED: Refresh the surface action catalog.');
    const params = command.params || {};
    const current = snapshot();
    if (current.busy) throw new Error('CMS_AGENT_WORKSPACE_BUSY: Wait for the current operation to finish.');
    if (!action.readOnly && params.expectedRevision !== current.stateRevision) {
      throw new Error('CMS_AGENT_STATE_CHANGED: Read the current state and pass its stateRevision as expectedRevision.');
    }
    if (!action.readOnly && current.dirty && (!action.acceptsDraft || params.acceptDraft !== true)) {
      throw new Error('CMS_AGENT_DRAFT_REVIEW_REQUIRED: Review the existing draft before editing or saving it with acceptDraft=true.');
    }
    if (action.confirm && params.confirm !== true) {
      throw new Error('CMS_AGENT_CONFIRM_REQUIRED: This action requires confirm=true.');
    }
    executing = true;
    const notice = !action.readOnly ? showToast({ title: 'Agent is working', message: action.label || action.action, tone: 'info', duration: 0 }) : null;
    try {
      const result = await action.run(params);
      if (result && typeof result === 'object' && 'handled' in result && result.handled === false) {
        const failure = result as Record<string, unknown>;
        throw new Error(`${failure.code || 'CMS_AGENT_ACTION_FAILED'}: ${String(failure.message || failure.reason || action.action)}`);
      }
      lastResult = { action: action.action, status: 'succeeded' };
      if (notice) showToast({ title: 'Agent finished', message: action.label || action.action, tone: 'success' });
      executing = false;
      return { handled: true, result: result ?? null, state: snapshot() };
    } catch (error) {
      lastResult = { action: action.action, status: 'failed', error: error instanceof Error ? error.message : String(error) };
      if (notice) showToast({ title: 'Agent action failed', message: lastResult.error, tone: 'error' });
      throw error;
    } finally { executing = false; notice?.dismiss(); }
  }
  return { instance, snapshot, execute, isExecuting: () => executing };
}

export function workspaceActionCatalog(actions: readonly WorkspaceAgentAction[]): AgentSurfaceAction[] {
  return actions.map(({ run: _run, acceptsDraft, confirm, readOnly, ...action }) => ({
    ...action, readOnly: Boolean(readOnly), acceptsDraft: Boolean(acceptsDraft), requiresConfirmation: Boolean(confirm),
    params: [
      ...(action.params || []),
      ...(!readOnly ? [{ name: 'expectedRevision', type: 'string', required: true }] : []),
      ...(acceptsDraft ? [{ name: 'acceptDraft', type: 'boolean', required: false }] : []),
      ...(confirm ? [{ name: 'confirm', type: 'boolean', required: true }] : [])
    ]
  }));
}

/** A thin adapter on AgentManager. The workspace retains its model and services;
 * no generic clicks, arbitrary fields, credentials or parallel draft store.
 */
export function registerWorkspaceAgent(options: {
  root: HTMLElement;
  id: string;
  title: string;
  read: () => WorkspaceAgentState;
  actions: readonly WorkspaceAgentAction[];
  onCommandSettled?: (command: AgentSurfaceCommand, acknowledged: boolean) => void;
}) {
  const { root } = options;
  const guard = createWorkspaceCommandGuard(options.read);
  const surfaceId = `cms.${options.id}.${guard.instance}`;
  let closed = false;
  let awaitingAck = false;
  let previousInert: boolean | null = null;
  const unregisterChanges = registerWorkspaceChanges(root, { isDirty: () => false, isBusy: () => guard.isExecuting() || awaitingAck });
  const client = createAgentSurfaceClient({
    emit: emitWorkspaceAgent,
    appName: 'plainspace', surfaceId, surfaceType: 'cms-workspace', title: options.title,
    buildSnapshot: () => {
      if (!root.isConnected) stop();
      return {
        status: closed ? 'closed' : 'active', route: window.location.pathname,
        summary: { workspaceId: options.id }, state: guard.snapshot(),
        selection: options.read().selection,
        actions: closed ? [] : workspaceActionCatalog(options.actions)
      };
    },
    handleCommand: async command => {
      if (closed || !root.isConnected) throw new Error('CMS_AGENT_WORKSPACE_CLOSED: Reopen and inspect the workspace.');
      previousInert = Boolean(root.inert);
      root.inert = true;
      const operation = guard.execute(command, options.actions);
      awaitingAck = true;
      return operation;
    },
    onCommandSettled: (command, acknowledged) => {
      awaitingAck = false;
      if (previousInert !== null) { root.inert = previousInert; previousInert = null; }
      options.onCommandSettled?.(command, acknowledged);
    }
  });
  function stop() {
    if (closed) return;
    closed = true;
    client.stop();
    unregisterChanges();
  }
  // Widget construction may happen before its host is attached.
  queueMicrotask(() => { if (root.isConnected) client.start(); });
  return { ...guard, stop };
}

export function agentString(params: Record<string, unknown>, name: string): string {
  if (typeof params[name] !== 'string' || !params[name].trim()) {
    throw new Error(`CMS_AGENT_PARAM_INVALID: ${name} must be a non-empty string.`);
  }
  return params[name];
}

/** Forms are the existing draft owner in these workspaces. This explicit field
 * allowlist exposes their state without turning the DOM into a generic write API.
 */
export function readAgentForm(root: ParentNode, names: readonly string[]): Record<string, string | boolean> {
  return Object.fromEntries(names.map(name => {
    const input = root.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${name}"]`);
    return [name, input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input?.value ?? ''];
  }));
}

export function patchAgentForm(root: ParentNode, fields: unknown, names: readonly string[]): void {
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('CMS_AGENT_FIELDS_INVALID: Supply an object of editable fields.');
  const entries = Object.entries(fields);
  // Validate the entire patch before applying any part of it.
  for (const [name, value] of entries) {
    const input = names.includes(name) ? root.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(`[name="${name}"]`) : null;
    const checkbox = input instanceof HTMLInputElement && input.type === 'checkbox';
    if (!input || typeof value !== (checkbox ? 'boolean' : 'string') || (input instanceof HTMLSelectElement && !Array.from(input.options).some(option => option.value === value))) {
      throw new Error(`CMS_AGENT_FIELD_INVALID: ${name} is unavailable or its value is invalid.`);
    }
  }
  for (const [name, value] of entries) {
    const input = root.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
    if (input.type === 'checkbox') input.checked = value as boolean;
    else input.value = value as string;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
