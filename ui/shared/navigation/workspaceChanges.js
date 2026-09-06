import { bpDialog } from '../dialogs/bpDialog.js';
const CHECK_CHANGES_EVENT = 'bp:workspace:check-changes';
export function registerWorkspaceChanges(root, state) {
    function unregister() {
        document.removeEventListener(CHECK_CHANGES_EVENT, collect);
        window.removeEventListener('beforeunload', beforeUnload);
    }
    function collect(event) {
        if (!root.isConnected) {
            unregister();
            return;
        }
        event.detail.states.push(state);
    }
    function beforeUnload(event) {
        if (!root.isConnected) {
            unregister();
            return;
        }
        if (!state.isDirty() && !state.isBusy?.())
            return;
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
export async function confirmWorkspaceNavigation() {
    const active = [];
    document.dispatchEvent(new CustomEvent(CHECK_CHANGES_EVENT, { detail: { states: active } }));
    if (active.some(state => state.isBusy?.())) {
        await bpDialog.alert('Please wait until the current operation finishes.');
        return false;
    }
    if (!active.some(state => state.isDirty()))
        return true;
    return bpDialog.confirm('Discard your unsaved changes and leave this page?', {
        title: 'Unsaved changes', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing'
    });
}
/** Read-only handoff signal for the shell's existing navigation owner. */
export function getWorkspaceChangeState() {
    const active = [];
    document.dispatchEvent(new CustomEvent(CHECK_CHANGES_EVENT, { detail: { states: active } }));
    return { dirty: active.some(state => state.isDirty()), busy: active.some(state => state.isBusy?.()) };
}
