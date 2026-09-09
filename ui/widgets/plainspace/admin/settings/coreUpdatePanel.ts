import { emitRuntimeAdmin } from '../../../../shared/api-client/runtimeFacade.js';
import { bpDialog } from '../../../../shared/dialogs/bpDialog.js';
import { createCoreModuleUpdateList, type CoreModuleUpdateRow } from './coreModuleUpdateList.js';

export interface CoreUpdateStatus {
  configured: boolean;
  installedVersion?: string;
  installedRelease?: { latestVersion: string; releaseNotes: string; releaseUrl?: string };
  phase: string;
  jobId?: string;
  canCancel?: boolean;
  progress?: { completedBytes: number; totalBytes: number; resumable: boolean };
  errorCode?: string;
  lastCheckedAt?: string;
  moduleUpdates?: CoreModuleUpdateRow[];
  moduleUpdateBatch?: { status: string; total: number; completed: number; failed: number; currentModule: string | null } | null;
  candidate?: { currentVersion: string; latestVersion: string; image: string; available: boolean; releaseNotes?: string; releaseUrl?: string };
}

const ACTIVE = new Set(['checking', 'installing', 'downloading', 'cancelling', 'backing_up', 'restarting', 'verifying', 'rolling_back']);
const LABELS: Record<string, string> = {
  idle: 'Ready to check for updates.', checking: 'Checking for updates…',
  current: 'Blogposter is up to date.', available: 'An update is available.',
  installing: 'Preparing update…', downloading: 'Downloading and verifying update…',
  backing_up: 'Creating a backup…', restarting: 'Installing and restarting Blogposter…',
  verifying: 'Verifying the updated installation…', completed: 'Update installed successfully.',
  rolling_back: 'Restoring the previous version…', rolled_back: 'The update failed. The previous version was restored.',
  recovery_failed: 'The update was interrupted. Your hosting administrator needs to check recovery.',
  paused: 'Download paused. Verified parts will be reused.', cancelling: 'Stopping download…',
  failed: 'The update operation failed. Check again before retrying.'
};

export function coreUpdateRequest(emit: Window['meltdownEmit'], jwt: string, action: 'status' | 'check' | 'install', params: Record<string, unknown> = {}): Promise<CoreUpdateStatus> {
  if (!emit) return Promise.reject(new Error('CORE_UPDATE_EMITTER_UNAVAILABLE'));
  return emitRuntimeAdmin<CoreUpdateStatus>(emit, jwt, 'coreUpdates', action, params);
}

export async function renderCoreUpdatePanel(mount: HTMLElement, emit: Window['meltdownEmit'], jwt: string, externalCheck = false, widgetMount?: HTMLElement, toolbarMount?: HTMLElement): Promise<() => Promise<void>> {
  mount.classList.add('core-update-panel');
  mount.classList.remove('settings-section--form');
  const version = document.createElement('h4');
  const status = document.createElement('p'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const checked = document.createElement('p'); checked.className = 'settings-hint';
  const requestError = document.createElement('p'); requestError.setAttribute('role', 'alert');
  const notes = document.createElement('pre'); notes.style.whiteSpace = 'pre-wrap'; notes.style.fontFamily = 'inherit'; notes.style.overflowWrap = 'anywhere';
  const documentArea = document.createElement('section'); documentArea.className = 'core-update-document-area';
  documentArea.setAttribute('aria-label', 'Changelog');
  const documentPage = document.createElement('details'); documentPage.className = 'core-update-document';
  const documentTitle = document.createElement('summary'); documentTitle.textContent = 'Blogposter System';
  const documentVersion = document.createElement('p'); documentVersion.className = 'settings-hint';
  const release = document.createElement('a'); release.textContent = 'Release notes'; release.target = '_blank'; release.rel = 'noopener noreferrer';
  const actions = document.createElement('div'); actions.className = 'form-actions';
  const check = document.createElement('button'); check.type = 'button'; check.className = 'button ghost sm'; check.textContent = 'Check for updates';
  check.hidden = externalCheck;
  const install = document.createElement('button'); install.type = 'button'; install.className = 'button primary sm'; install.textContent = 'Install update'; install.hidden = true;
  const hint = document.createElement('p'); hint.className = 'settings-hint'; hint.textContent = 'Installation includes a backup and a brief restart. You can leave this page and return to see progress.';
  const summary = document.createElement('div'); summary.className = 'core-update-summary';
  const identity = document.createElement('div'); identity.className = 'core-update-identity';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'button ghost sm'; cancel.textContent = 'Cancel download'; cancel.hidden = true;
  identity.append(version, status, checked); actions.append(check, install, cancel); summary.append(identity, actions);
  // Group related status and controls; empty messages must not reserve grid rows.
  documentPage.append(documentTitle, documentVersion, notes, release, install);
  documentArea.append(documentPage);
  mount.append(summary, requestError, documentArea);
  documentPage.append(hint);
  let state: CoreUpdateStatus | null = null;
  let submitting = false;
  let confirming = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Keep explicit opt-outs across status polls; newly available packages start selected.
  const deselected = new Set<string>();
  const bulk = document.createElement('div'); bulk.className = 'core-module-update-selection';
  const allLabel = document.createElement('label');
  const all = document.createElement('input'); all.type = 'checkbox';
  allLabel.append(all, 'Select all module and widget updates');
  const updateSelected = document.createElement('button'); updateSelected.type = 'button'; updateSelected.className = 'button primary sm';
  const progress = document.createElement('span'); progress.setAttribute('role', 'status');
  bulk.append(allLabel, updateSelected, progress); (toolbarMount || mount).append(bulk);
  const eligible = () => (state?.moduleUpdates || []).filter(row => row.available && row.generationId && row.latestVersion);
  const selection = {
    selected: (row: CoreModuleUpdateRow) => (row.available || ['queued', 'installing'].includes(row.status)) && !deselected.has(row.moduleName),
    change: (row: CoreModuleUpdateRow, selected: boolean) => {
      if (selected) deselected.delete(row.moduleName); else deselected.add(row.moduleName);
      if (state) draw(state);
    }
  };
  all.addEventListener('change', () => {
    for (const row of eligible()) {
      if (all.checked) deselected.delete(row.moduleName); else deselected.add(row.moduleName);
    }
    if (state) draw(state);
  });
  const drawCoreModules = createCoreModuleUpdateList(mount, row => { void confirmModule(row); }, 'CMS module updates', selection);
  const drawWidgetModules = createCoreModuleUpdateList(widgetMount || mount, row => { void confirmModule(row); }, 'Bundled widget updates', selection);
  const drawModules = (rows: CoreModuleUpdateRow[], disabled: boolean, checkedAt?: string) => {
    drawCoreModules(rows.filter(row => row.kind !== 'widget'), disabled, checkedAt);
    drawWidgetModules(rows.filter(row => row.kind === 'widget'), disabled, checkedAt);
  };
  function draw(next: CoreUpdateStatus) {
    // A CMS restart temporarily removes the bridge; preserve known job progress.
    if (!next.configured && state && ACTIVE.has(state.phase)) {
      status.textContent = 'Reconnecting to Blogposter after restart…';
      check.disabled = install.disabled = cancel.disabled = true;
      drawModules(state.moduleUpdates || [], true);
      return;
    }
    state = next;
    version.textContent = 'Service updates';
    status.textContent = next.configured ? (LABELS[next.phase] || 'Update status unavailable.') :
      next.errorCode === 'CORE_UPDATE_HOST_NOT_CONFIGURED' ? 'Updates are not connected yet. Your hosting administrator needs to enable them once.' : 'The update service is temporarily unavailable. Please try again.';
    // Keep diagnostics available without turning the summary into a large alert.
    status.title = next.errorCode || '';
    if (!next.configured) status.textContent = 'Update service unavailable';
    if (next.configured && next.phase === 'current') status.textContent = 'Up to date';
    checked.textContent = next.lastCheckedAt ? `Last checked: ${new Date(next.lastCheckedAt).toLocaleString()}` : 'Not checked yet.';
    documentArea.hidden = !next.candidate?.available && !ACTIVE.has(next.phase) && !next.installedRelease?.releaseNotes;
    const systemName = document.createElement('span'); systemName.textContent = 'Blogposter System';
    const systemVersions = document.createElement('span'); systemVersions.className = 'update-versions';
    systemVersions.textContent = `${next.installedVersion || next.candidate?.currentVersion || 'Unknown'} → ${next.candidate?.latestVersion || 'Pending'}`;
    documentTitle.replaceChildren(systemName, systemVersions);
    const changelog = next.candidate?.releaseNotes ? next.candidate : next.installedRelease;
    documentVersion.textContent = changelog?.latestVersion ? `Version ${changelog.latestVersion}` : 'Release notes';
    // Keep release text inert and state missing notes honestly, even before host setup.
    notes.textContent = changelog?.releaseNotes || 'No release notes have been loaded yet.';
    const url = changelog?.releaseUrl || '';
    release.hidden = !/^https:\/\/github\.com\/BlogposterCMS\/BlogposterCMS\/releases\/tag\/v\d+\.\d+\.\d+$/.test(url);
    if (!release.hidden) release.href = url;
    check.disabled = submitting || confirming || !next.configured || ACTIVE.has(next.phase) || next.phase === 'recovery_failed' || next.moduleUpdateBatch?.status === 'installing' || Boolean(next.moduleUpdates?.some(row => ['queued', 'installing'].includes(row.status)));
    install.textContent = next.phase === 'paused' ? 'Resume update' : 'Install update';
    cancel.hidden = !next.canCancel;
    cancel.disabled = !next.canCancel || !next.configured || submitting || confirming;
    if (next.progress && ['downloading', 'paused'].includes(next.phase)) status.textContent += ` ${Math.floor(next.progress.completedBytes / next.progress.totalBytes * 100)}%`;
    install.hidden = !next.candidate?.available;
    install.disabled = check.disabled;
    drawModules(next.moduleUpdates || [], check.disabled, next.lastCheckedAt);
    const available = eligible();
    const selected = available.filter(selection.selected);
    all.checked = available.length > 0 && selected.length === available.length;
    all.indeterminate = selected.length > 0 && selected.length < available.length;
    all.disabled = check.disabled || !available.length;
    updateSelected.textContent = `Update selected (${selected.length})`;
    updateSelected.disabled = check.disabled || !selected.length || Boolean(next.moduleUpdates?.some(row => row.status === 'checking'));
    const batch = next.moduleUpdateBatch;
    progress.textContent = batch ? `${batch.completed + batch.failed} / ${batch.total} processed · ${batch.completed} updated · ${batch.failed} failed${batch.currentModule ? ` · Updating ${batch.currentModule}…` : ''}` : '';
  }
  async function refresh() {
    try { draw(await coreUpdateRequest(emit, jwt, 'status')); }
    catch { status.textContent = state && ACTIVE.has(state.phase) ? 'Reconnecting to Blogposter after restart…' : 'Unable to check update status. Please try again.'; }
  }
  async function run(action: 'check' | 'install', params: Record<string, unknown> = {}) {
    if (submitting) return;
    submitting = true; check.disabled = install.disabled = cancel.disabled = true;
    requestError.textContent = '';
    try {
      const result = await coreUpdateRequest(emit, jwt, action, params);
      if (typeof result.configured === 'boolean') draw(result);
    }
    catch (err) { requestError.textContent = err instanceof Error ? err.message : 'CORE_UPDATE_REQUEST_FAILED'; }
    finally { submitting = false; }
    // Reconcile status after every response, including an ambiguous network failure.
    await refresh();
    if (action === 'install') {
      clearTimeout(timer);
      timer = setTimeout(poll, 3000);
    }
  }
  cancel.addEventListener('click', () => { if (state?.canCancel && state.jobId) void run('install', { operation: 'cancel', jobId: state.jobId }); });
  check.addEventListener('click', () => { void run('check'); });
  updateSelected.addEventListener('click', async () => {
    if (updateSelected.disabled) return;
    const selected = eligible().filter(selection.selected);
    confirming = true;
    if (state) draw(state);
    try {
      const result = await bpDialog.open({ kind: 'modal', title: `Update ${selected.length} selected modules and widgets?`,
        message: `Updates run one at a time and continue when you leave this page.\n${selected.map(row => `${row.label || row.moduleName}: ${row.currentVersion} → ${row.latestVersion}${row.breakingChange ? ' (breaking update; review its changelog)' : ''}`).join('\n')}`,
        actions: [{ id: 'cancel', label: 'Later', variant: 'ghost' }, { id: 'install', label: 'Install selected updates', variant: 'primary' }] });
      if (result.action === 'install') await run('install', { targetModules: selected.map(row => ({ moduleName: row.moduleName, generationId: row.generationId, version: row.latestVersion })) });
    } catch (error) { requestError.textContent = error instanceof Error ? error.message : 'CORE_MODULE_CONFIRMATION_FAILED'; }
    finally { confirming = false; await refresh(); }
  });
  async function confirmModule(row: CoreModuleUpdateRow) {
    if (submitting || confirming || check.disabled || !row.available || !row.generationId) return;
    confirming = true;
    if (state) draw(state);
    try {
      const result = await bpDialog.open({ kind: 'modal', title: `Update ${row.label || row.moduleName} to ${row.latestVersion}?`,
        message: row.kind === 'widget'
          ? 'New page loads will use this widget version. Already open pages keep their loaded version until reloaded.'
          : 'Only this module will pause briefly. Blogposter and the other modules keep running.',
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
    timer = setTimeout(poll, state && (ACTIVE.has(state.phase) || state.moduleUpdateBatch?.status === 'installing' || state.moduleUpdates?.some(row => ['checking', 'queued', 'installing'].includes(row.status))) ? 3000 : 30000);
  };
  timer = setTimeout(poll, 3000);
  // Polls stop when this existing settings surface is unmounted.
  void timer;
  return async () => { if (!check.disabled) await run('check'); };
}
