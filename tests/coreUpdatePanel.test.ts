/** @jest-environment jsdom */
import { renderCoreUpdatePanel } from '../ui/widgets/plainspace/admin/settings/coreUpdatePanel';

let mount: HTMLElement;
beforeEach(() => { jest.useFakeTimers(); mount = document.createElement('section'); document.body.append(mount); });
afterEach(() => { mount.remove(); jest.clearAllTimers(); jest.useRealTimers(); });
const candidate = { currentVersion: '0.9.4', latestVersion: '0.9.5', image: `ghcr.io/blogpostercms/blogpostercms@sha256:${'a'.repeat(64)}`, available: true, releaseNotes: '<script>unsafe()</script>', releaseUrl: 'javascript:alert(1)' };
function emitterFor(state: any) { return jest.fn(async () => ({ resource: 'coreUpdates', action: 'status', data: state })); }

test('shows update and notes as text without trusting release URLs or markup', async () => {
  await renderCoreUpdatePanel(mount, emitterFor({ configured: true, phase: 'available', installedVersion: '0.9.4', candidate }), 'user');
  expect(mount.textContent).toContain('Available: 0.9.5');
  expect(mount.querySelector('script')).toBeNull();
  expect(mount.querySelector('a')?.hidden).toBe(true);
  expect([...mount.querySelectorAll('button')].find(b => b.textContent === 'Install update')?.disabled).toBe(false);
});
test('missing host disables installation and gives an honest setup status', async () => {
  await renderCoreUpdatePanel(mount, emitterFor({ configured: false, phase: 'unavailable', errorCode: 'CORE_UPDATE_HOST_NOT_CONFIGURED' }), 'user');
  expect(mount.textContent).toContain('hosting administrator');
  expect([...mount.querySelectorAll('button')].every(b => b.disabled)).toBe(true);
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
    currentVersion: '0.9.4', status: 'error', available: false, errorCode: '<script>bad()</script>' }] }), 'user');
  expect(mount.querySelector('script')).toBeNull();
  expect(mount.textContent).toContain('<script>bad()</script>');
});
