import { emitRuntimeAdmin } from '../../../../shared/api-client/runtimeFacade.js';
import { bpDialog } from '../../../../shared/dialogs/bpDialog.js';
import { createCoreModuleUpdateList, type CoreModuleUpdateRow } from './coreModuleUpdateList.js';

export interface CoreUpdateStatus {
  configured: boolean;
  installedVersion?: string;
  installedRelease?: { latestVersion: string; releaseNotes: string; releaseUrl?: string };
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

export async function renderCoreUpdatePanel(mount: HTMLElement, emit: Window['meltdownEmit'], jwt: string, externalCheck = false, widgetMount?: HTMLElement): Promise<() => Promise<void>> {
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
  identity.append(version, status, checked); actions.append(check, install); summary.append(identity, actions);
  // Group related status and controls; empty messages must not reserve grid rows.
  documentPage.append(documentTitle, documentVersion, notes, release, install);
  documentArea.append(documentPage);
  mount.append(summary, requestError, documentArea);
  documentPage.append(hint);
  let state: CoreUpdateStatus | null = null;
  let submitting = false;
  let confirming = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const drawCoreModules = createCoreModuleUpdateList(mount, row => { void confirmModule(row); });
  const drawWidgetModules = createCoreModuleUpdateList(widgetMount || mount, row => { void confirmModule(row); }, 'Bundled widget updates');
  const drawModules = (rows: CoreModuleUpdateRow[], disabled: boolean, checkedAt?: string) => {
    drawCoreModules(rows.filter(row => row.kind !== 'widget'), disabled, checkedAt);
    drawWidgetModules(rows.filter(row => row.kind === 'widget'), disabled, checkedAt);
  };
  function draw(next: CoreUpdateStatus) {
    // A CMS restart temporarily removes the bridge; preserve known job progress.
    if (!next.configured && state && ACTIVE.has(state.phase)) {
      status.textContent = 'Reconnecting to Blogposter after restart…';
      check.disabled = install.disabled = true;
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
    documentArea.hidden = !next.candidate?.available && !ACTIVE.has(next.phase);
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
    check.disabled = submitting || confirming || !next.configured || ACTIVE.has(next.phase) || next.phase === 'recovery_failed' || Boolean(next.moduleUpdates?.some(row => row.status === 'installing'));
    install.hidden = !next.candidate?.available;
    install.disabled = check.disabled;
    drawModules(next.moduleUpdates || [], check.disabled, next.lastCheckedAt);
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
    timer = setTimeout(poll, state && (ACTIVE.has(state.phase) || state.moduleUpdates?.some(row => ['checking', 'installing'].includes(row.status))) ? 3000 : 30000);
  };
  timer = setTimeout(poll, 3000);
  // Polls stop when this existing settings surface is unmounted.
  void timer;
  return async () => { if (!check.disabled) await run('check'); };
}
