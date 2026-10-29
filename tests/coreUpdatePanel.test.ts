/** @jest-environment jsdom */
import { renderCoreUpdatePanel } from '../ui/widgets/plainspace/admin/settings/coreUpdatePanel';
import { bpDialog } from '../ui/shared/dialogs/bpDialog';

test('default selection spans modules and widgets and preserves opt-outs during polling', async () => {
  const rows = ['contentEngine', 'widgetHtml'].map((moduleName, index) => ({ moduleName, kind: index ? 'widget' : 'module',
    currentVersion: '1.0.0', latestVersion: '1.1.0', generationId: 'a'.repeat(64), status: 'available', available: true }));
  const emit = emitterFor({ configured: true, phase: 'current', moduleUpdates: rows });
  await renderCoreUpdatePanel(mount, emit, 'user');
  const checkboxes = [...mount.querySelectorAll<HTMLInputElement>('.core-module-update-entry input')];
  const master = mount.querySelector<HTMLInputElement>('.core-module-update-selection input')!;
  const button = mount.querySelector<HTMLButtonElement>('.core-module-update-selection button')!;
  expect(checkboxes.every(box => box.checked)).toBe(true);
  expect(button.textContent).toBe('Update selected (2)');
  checkboxes[1].click();
  await jest.advanceTimersByTimeAsync(3000);
  expect(checkboxes[1].checked).toBe(false);
  expect(master.indeterminate).toBe(true);
  expect(button.textContent).toBe('Update selected (1)');
  const dialog = jest.spyOn(bpDialog, 'open').mockResolvedValue({ action: 'install' });
  button.click();
  for (let i = 0; i < 12; i++) await Promise.resolve();
  const installCall = emit.mock.calls.find(call => (call as any)[1]?.action === 'install') as any;
  expect(installCall[1].params).toEqual({ targetModules: [{ moduleName: 'contentEngine', version: '1.1.0', generationId: 'a'.repeat(64) }] });
  dialog.mockRestore();
  master.click();
  expect(checkboxes.every(box => box.checked)).toBe(true);
  master.click();
  expect(button.disabled).toBe(true);
});

let mount: HTMLElement;
beforeEach(() => { jest.useFakeTimers(); mount = document.createElement('section'); document.body.append(mount); });
afterEach(() => { mount.remove(); jest.clearAllTimers(); jest.useRealTimers(); });
const candidate = { currentVersion: '0.9.4', latestVersion: '0.9.5', image: `ghcr.io/blogpostercms/blogpostercms@sha256:${'a'.repeat(64)}`, available: true, releaseNotes: '<script>unsafe()</script>', releaseUrl: 'javascript:alert(1)' };
function emitterFor(state: any) { return jest.fn(async () => ({ resource: 'coreUpdates', action: 'status', data: state })); }

test('shows update and notes as text without trusting release URLs or markup', async () => {
  await renderCoreUpdatePanel(mount, emitterFor({ configured: true, phase: 'available', installedVersion: '0.9.4', candidate }), 'user');
  expect(mount.textContent).toContain('0.9.4 → 0.9.5');
  expect(mount.querySelector('.core-update-document pre')?.textContent).toBe(candidate.releaseNotes);
  expect(mount.querySelector('.core-update-summary .form-actions')).not.toBeNull();
  expect(mount.classList.contains('settings-section--form')).toBe(false);
  expect(mount.querySelector('script')).toBeNull();
  expect(mount.querySelector('a')?.hidden).toBe(true);
  expect([...mount.querySelectorAll('button')].find(b => b.textContent === 'Install update')?.disabled).toBe(false);
});
test('missing host disables installation and gives an honest setup status', async () => {
  await renderCoreUpdatePanel(mount, emitterFor({ configured: false, phase: 'unavailable', errorCode: 'CORE_UPDATE_HOST_NOT_CONFIGURED' }), 'user');
  expect(mount.textContent).toContain('Update service unavailable');
  expect(mount.querySelector('.core-update-document')?.textContent).toContain('No release notes have been loaded yet.');
  expect([...mount.querySelectorAll('button')].every(b => b.disabled)).toBe(true);
});

test('keeps installed release notes visible without an available update', async () => {
  await renderCoreUpdatePanel(mount, emitterFor({ configured: false, phase: 'unavailable',
    installedRelease: { latestVersion: '0.9.5', releaseNotes: 'Installed release changes' } }), 'user');
  expect(mount.querySelector('.core-update-document')?.textContent).toContain('Version 0.9.5');
  expect(mount.querySelector('pre')?.textContent).toBe('Installed release changes');
});

test('external refresh reuses core check while hiding the duplicate control', async () => {
  const emit = emitterFor({ configured: true, phase: 'current' });
  const check = await renderCoreUpdatePanel(mount, emit, 'user', true);
  await check();
  expect(emit.mock.calls.some(call => (call as any)[1]?.action === 'check')).toBe(true);
  expect([...mount.querySelectorAll('button')].find(b => b.textContent === 'Check for updates')?.hidden).toBe(true);
});
test('restart disconnection retains the running job and disables new installs', async () => {
  const emit = emitterFor({ configured: true, phase: 'restarting', candidate });
  await renderCoreUpdatePanel(mount, emit, 'user');
  emit.mockResolvedValue({ resource: 'coreUpdates', action: 'status', data: { configured: false, phase: 'unavailable' } });
  await jest.advanceTimersByTimeAsync(3000);
  expect(mount.textContent).toContain('Reconnecting');
  expect([...mount.querySelectorAll('button')].every(b => b.disabled)).toBe(true);
});
test('polling stops after settings panel unmount', async () => {
  const emit = emitterFor({ configured: true, phase: 'current' });
  await renderCoreUpdatePanel(mount, emit, 'user'); mount.remove();
  await jest.advanceTimersByTimeAsync(3000);
  expect(emit).toHaveBeenCalledTimes(1);
});

test('module installation disables host install and retains module version and progress', async () => {
  await renderCoreUpdatePanel(mount, emitterFor({ configured: true, phase: 'available', candidate,
    moduleUpdates: [{ moduleName: 'translationManager', currentVersion: '0.9.4', latestVersion: '0.9.5', status: 'installing', available: false }] }), 'user');
  expect(mount.textContent).toContain('translationManager');
  expect([...mount.querySelectorAll('button')].every(button => button.disabled)).toBe(true);
});

test('module package errors are rendered as text and cannot offer an install', async () => {
  await renderCoreUpdatePanel(mount, emitterFor({ configured: true, phase: 'current', moduleUpdates: [{ moduleName: 'translationManager',
    currentVersion: '0.9.4', latestVersion: '0.9.5', status: 'error', available: false, errorCode: '<script>bad()</script>' }] }), 'user');
  expect(mount.querySelector('script')).toBeNull();
  expect(mount.textContent).toContain('<script>bad()</script>');
});

test('module update list omits unchanged and unchecked modules and hides its empty section', async () => {
  const emit = emitterFor({ configured: true, phase: 'current', moduleUpdates: [
    { moduleName: 'unchanged', currentVersion: '1.0.0', latestVersion: '1.0.0', status: 'current', available: false },
    { moduleName: 'unchecked', currentVersion: '1.0.0', status: 'not_checked', available: false },
    { moduleName: 'changed', currentVersion: '1.0.0', latestVersion: '1.1.0', status: 'available', available: true }
  ] });
  await renderCoreUpdatePanel(mount, emit, 'user');
  const section = mount.querySelector<HTMLElement>('.core-module-updates')!;
  expect(section.textContent).not.toContain('unchanged');
  expect(section.textContent).not.toContain('unchecked');
  expect(section.querySelectorAll('.core-module-update-row')).toHaveLength(1);
  emit.mockResolvedValue({ resource: 'coreUpdates', action: 'status', data: { configured: true, phase: 'current', moduleUpdates: [] } });
  await jest.advanceTimersByTimeAsync(3000);
  expect(section.hidden).toBe(false);
  expect(section.textContent).toContain('Not checked yet');
  expect(section.querySelectorAll('.core-module-update-row')).toHaveLength(0);
});


test('changed module renders a compact accordion and optional compatibility badge', async () => {
  await renderCoreUpdatePanel(mount, emitterFor({ configured: true, phase: 'current', moduleUpdates: [
    { moduleName: 'contentEngine', currentVersion: '1.0.0', latestVersion: '2.0.0', status: 'available', available: true,
      releaseNotes: 'Changed content API.', breakingChange: true }
  ] }), 'user');
  const row = mount.querySelector<HTMLDetailsElement>('details.core-module-update-row')!;
  expect(row.open).toBe(false);
  expect(row.querySelector('.update-versions')?.textContent).toBe('1.0.0 → 2.0.0');
  expect(row.querySelector('pre')?.textContent).toContain('Changed content API.');
  expect(row.querySelector('.module-access-badge--danger')?.textContent).toBe('Breaking update');
});


test('both sections show up to date and the successful check time', async () => {
  const lastCheckedAt = '2026-09-09T09:00:00Z';
  await renderCoreUpdatePanel(mount, emitterFor({ configured: true, phase: 'current', lastCheckedAt,
    moduleUpdates: [{ moduleName: 'contentEngine', currentVersion: '1.0.0', status: 'current', available: false }] }), 'user');
  for (const selector of ['.core-update-identity', '.core-module-updates']) {
    const text = mount.querySelector(selector)!.textContent;
    expect(text).toContain('Up to date');
    expect(text).toContain(`Last checked: ${new Date(lastCheckedAt).toLocaleString()}`);
  }
  expect(mount.querySelectorAll('.core-module-update-row')).toHaveLength(0);
});
