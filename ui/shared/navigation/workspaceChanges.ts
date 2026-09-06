import { bpDialog } from '../dialogs/bpDialog.js';

interface WorkspaceChanges {
  isDirty: () => boolean;
  isBusy?: () => boolean;
}

const CHECK_CHANGES_EVENT = 'bp:workspace:check-changes';
type ChangesEvent = CustomEvent<{ states: WorkspaceChanges[] }>;

export function registerWorkspaceChanges(root: HTMLElement, state: WorkspaceChanges): () => void {
  function unregister(): void {
    document.removeEventListener(CHECK_CHANGES_EVENT, collect);
    window.removeEventListener('beforeunload', beforeUnload);
  }
  function collect(event: Event): void {
    if (!root.isConnected) { unregister(); return; }
    (event as ChangesEvent).detail.states.push(state);
  }
  function beforeUnload(event: BeforeUnloadEvent): void {
    if (!root.isConnected) { unregister(); return; }
    if (!state.isDirty() && !state.isBusy?.()) return;
    event.preventDefault();
    event.returnValue = '';
  }
  // Bundled shell code and dynamically imported widgets do not share module
  // instances. A synchronous DOM lifecycle event reaches both without storing
  // drafts globally or adding a second navigation/persistence owner.
  document.addEventListener(CHECK_CHANGES_EVENT, collect);
  window.addEventListener('beforeunload', beforeUnload);
  return unregister;
}

export async function confirmWorkspaceNavigation(): Promise<boolean> {
  const active: WorkspaceChanges[] = [];
  document.dispatchEvent(new CustomEvent(CHECK_CHANGES_EVENT, { detail: { states: active } }));
  if (active.some(state => state.isBusy?.())) {
    await bpDialog.alert('Please wait until the current operation finishes.');
    return false;
  }
  if (!active.some(state => state.isDirty())) return true;
  return bpDialog.confirm('Discard your unsaved changes and leave this page?', {
    title: 'Unsaved changes', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing'
  });
}

/** Read-only handoff signal for the shell's existing navigation owner. */
export function getWorkspaceChangeState(): { dirty: boolean; busy: boolean } {
  const active: WorkspaceChanges[] = [];
  document.dispatchEvent(new CustomEvent(CHECK_CHANGES_EVENT, { detail: { states: active } }));
  return { dirty: active.some(state => state.isDirty()), busy: active.some(state => state.isBusy?.()) };
}
