import { emitRuntimeAdmin } from '../../../../shared/api-client/runtimeFacade.js';
import { bpDialog } from '../../../../shared/dialogs/bpDialog.js';
import { createCoreModuleUpdateList, type CoreModuleUpdateRow } from './coreModuleUpdateList.js';

export interface CoreUpdateStatus {
  configured: boolean;
  installedVersion?: string;
  phase: string;
  jobId?: string;
  errorCode?: string;
  lastCheckedAt?: string;
  moduleUpdates?: CoreModuleUpdateRow[];
  candidate?: { currentVersion: string; latestVersion: string; image: string; available: boolean; releaseNotes?: string; releaseUrl?: string };
}

const ACTIVE = new Set(['checking', 'installing', 'downloading', 'backing_up', 'restarting', 'verifying', 'rolling_back']);
const LABELS: Record<string, string> = {
  idle: 'Ready to check for updates.', checking: 'Checking for updates…',
  current: 'Blogposter is up to date.', available: 'An update is available.',
  installing: 'Preparing update…', downloading: 'Downloading and verifying update…',
  backing_up: 'Creating a backup…', restarting: 'Installing and restarting Blogposter…',
  verifying: 'Verifying the updated installation…', completed: 'Update installed successfully.',
  rolling_back: 'Restoring the previous version…', rolled_back: 'The update failed. The previous version was restored.',
  recovery_failed: 'The update was interrupted. Your hosting administrator needs to check recovery.',
  failed: 'The update operation failed. Check again before retrying.'
};

export function coreUpdateRequest(emit: Window['meltdownEmit'], jwt: string, action: 'status' | 'check' | 'install', params: Record<string, unknown> = {}): Promise<CoreUpdateStatus> {
  if (!emit) return Promise.reject(new Error('CORE_UPDATE_EMITTER_UNAVAILABLE'));
  return emitRuntimeAdmin<CoreUpdateStatus>(emit, jwt, 'coreUpdates', action, params);
}

export async function renderCoreUpdatePanel(mount: HTMLElement, emit: Window['meltdownEmit'], jwt: string): Promise<void> {
  const version = document.createElement('p');
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const checked = document.createElement('p'); checked.className = 'settings-hint';
  const requestError = document.createElement('p'); requestError.setAttribute('role', 'alert');
  const notes = document.createElement('pre'); notes.style.whiteSpace = 'pre-wrap'; notes.style.fontFamily = 'inherit'; notes.style.overflowWrap = 'anywhere';
  const release = document.createElement('a'); release.textContent = 'Release notes'; release.target = '_blank'; release.rel = 'noopener noreferrer';
  const actions = document.createElement('div'); actions.className = 'form-actions';
  const check = document.createElement('button'); check.type = 'button'; check.className = 'button ghost sm'; check.textContent = 'Check for updates';
  const install = document.createElement('button'); install.type = 'button'; install.className = 'button primary sm'; install.textContent = 'Install update'; install.hidden = true;
  const hint = document.createElement('p'); hint.className = 'settings-hint'; hint.textContent = 'Installation includes a backup and a brief restart. You can leave this page and return to see progress.';
  actions.append(check, install); mount.append(version, status, requestError, checked, notes, release, actions, hint);
  let state: CoreUpdateStatus | null = null;
  let submitting = false;
  let confirming = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const drawModules = createCoreModuleUpdateList(mount, row => { void confirmModule(row); });
  function draw(next: CoreUpdateStatus) {
    // A CMS restart temporarily removes the bridge; preserve known job progress.
    if (!next.configured && state && ACTIVE.has(state.phase)) {
      status.textContent = 'Reconnecting to Blogposter after restart…';
      check.disabled = install.disabled = true;
      drawModules(state.moduleUpdates || [], true);
      return;
    }
    state = next;
    version.textContent = `Installed version: ${next.installedVersion || next.candidate?.currentVersion || 'Unknown'}${next.candidate?.available ? ` · Available: ${next.candidate.latestVersion}` : ''}`;
    status.textContent = next.configured ? (LABELS[next.phase] || 'Update status unavailable.') :
      next.errorCode === 'CORE_UPDATE_HOST_NOT_CONFIGURED' ? 'Updates are not connected yet. Your hosting administrator needs to enable them once.' : 'The update service is temporarily unavailable. Please try again.';
    if (next.errorCode) status.textContent += ` (${next.errorCode})`;
    checked.textContent = next.lastCheckedAt ? `Last checked: ${new Date(next.lastCheckedAt).toLocaleString()}` : 'Not checked yet.';
    notes.textContent = next.candidate?.releaseNotes || '';
    const url = next.candidate?.releaseUrl || '';
    release.hidden = !/^https:\/\/github\.com\/BlogposterCMS\/BlogposterCMS\/releases\/tag\/v\d+\.\d+\.\d+$/.test(url);
    if (!release.hidden) release.href = url;
    check.disabled = submitting || confirming || !next.configured || ACTIVE.has(next.phase) || next.phase === 'recovery_failed' || Boolean(next.moduleUpdates?.some(row => row.status === 'installing'));
    install.hidden = !next.candidate?.available;
    install.disabled = check.disabled;
    drawModules(next.moduleUpdates || [], check.disabled);
  }
  async function refresh() {
    try { draw(await coreUpdateRequest(emit, jwt, 'status')); }
    catch { status.textContent = state && ACTIVE.has(state.phase) ? 'Reconnecting to Blogposter after restart…' : 'Unable to check update status. Please try again.'; }
  }
  async function run(action: 'check' | 'install', params: Record<string, unknown> = {}) {
    if (submitting) return;
    submitting = true; check.disabled = install.disabled = true;
    requestError.textContent = '';
    try {
      const result = await coreUpdateRequest(emit, jwt, action, params);
      if (typeof result.configured === 'boolean') draw(result);
    }
    catch (err) { requestError.textContent = err instanceof Error ? err.message : 'CORE_UPDATE_REQUEST_FAILED'; }
    finally { submitting = false; }
    // Reconcile status after every response, including an ambiguous network failure.
    await refresh();
  }
  check.addEventListener('click', () => { void run('check'); });
  async function confirmModule(row: CoreModuleUpdateRow) {
    if (submitting || confirming || check.disabled || !row.available || !row.generationId) return;
    confirming = true;
    if (state) draw(state);
    try {
      const result = await bpDialog.open({ kind: 'modal', title: `Update ${row.moduleName} to ${row.latestVersion}?`,
        message: 'Only this module will pause briefly. Blogposter and the other modules keep running.',
        actions: [{ id: 'cancel', label: 'Later', variant: 'ghost' }, { id: 'install', label: 'Install module update', variant: 'primary' }] });
      if (result.action === 'install') await run('install', { targetModuleName: row.moduleName, version: row.latestVersion, generationId: row.generationId });
    } catch (error) { requestError.textContent = error instanceof Error ? error.message : 'CORE_MODULE_CONFIRMATION_FAILED'; }
    finally { confirming = false; await refresh(); }
  }
  install.addEventListener('click', async () => {
    const candidate = state?.candidate;
    if (!candidate?.available || install.disabled) return;
    confirming = true;
    install.disabled = true;
    try {
      const result = await bpDialog.open({ kind: 'modal', title: `Install Blogposter ${candidate.latestVersion}?`,
      message: 'Your data will be backed up. Blogposter will be briefly unavailable while it restarts.',
      actions: [{ id: 'cancel', label: 'Later', variant: 'ghost' }, { id: 'install', label: 'Install update', variant: 'primary' }] });
      if (result.action === 'install') await run('install', { version: candidate.latestVersion, image: candidate.image });
    } catch (err) { requestError.textContent = err instanceof Error ? err.message : 'CORE_UPDATE_CONFIRMATION_FAILED'; }
    finally { confirming = false; await refresh(); }
  });
  await refresh();
  const poll = async () => {
    if (!mount.isConnected) return;
    await refresh();
    timer = setTimeout(poll, state && (ACTIVE.has(state.phase) || state.moduleUpdates?.some(row => ['checking', 'installing'].includes(row.status))) ? 3000 : 30000);
  };
  timer = setTimeout(poll, 3000);
  // Polls stop when this existing settings surface is unmounted.
  void timer;
}
