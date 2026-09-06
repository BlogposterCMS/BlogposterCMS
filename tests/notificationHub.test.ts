/** @jest-environment jsdom */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import initNotificationHub from '../ui/shell/notifications/notificationHub';
import { fetchRecentNotifications } from '../ui/shell/notifications/notificationHubData';

jest.mock('../ui/shell/notifications/notificationHubData', () => ({ fetchRecentNotifications: jest.fn() }));
const fetchRecent = jest.mocked(fetchRecentNotifications);
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const hub = () => document.querySelector<HTMLElement>('#notification-hub')!;
const trigger = () => document.querySelector<HTMLButtonElement>('.logo')!;
const refresh = () => document.querySelector<HTMLButtonElement>('[data-notification-refresh]')!;

beforeEach(() => {
  jest.useFakeTimers();
  fetchRecent.mockReset().mockResolvedValue([]);
  sessionStorage.clear();
  document.body.innerHTML = readFileSync(join(__dirname, '../public/plainspace/partials/top-header.html'), 'utf8');
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); delete window.bpToast; });

test('shows loading, empty and populated states through the existing recent facade', async () => {
  let complete!: (items: []) => void;
  fetchRecent.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
  initNotificationHub();
  trigger().click();
  expect(hub().hidden).toBe(false);
  expect(trigger().getAttribute('aria-expanded')).toBe('true');
  expect(hub().textContent).toContain('Loading notifications');
  expect(refresh().disabled).toBe(true);
  expect(fetchRecent).toHaveBeenCalledTimes(1);
  complete([]); await flush();
  expect(hub().textContent).toContain('No notifications yet');
  expect(refresh().disabled).toBe(false);
  fetchRecent.mockResolvedValueOnce([{ moduleName: 'Pages', priority: 'success', message: 'Saved', timestamp: '2026-09-06T10:00:00Z' }]);
  refresh().click(); await flush();
  expect(hub().querySelector('li')?.textContent).toContain('Pages');
  expect(hub().querySelector('time')?.dateTime).toBe('2026-09-06T10:00:00.000Z');
  expect(hub().querySelector<HTMLElement>('[role="status"]')?.hidden).toBe(true);
});

test('retains history on failed refresh and offers recovery without duplicate loading', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  fetchRecent.mockResolvedValueOnce([{ message: 'Earlier notice' }]);
  initNotificationHub(); await flush();
  fetchRecent.mockRejectedValueOnce(new Error('Offline'));
  refresh().click(); await flush();
  expect(hub().textContent).toContain('Earlier notice');
  expect(hub().textContent).toContain('SHELL_NOTIFICATION_HUB_LOAD_FAILED');
  refresh().click(); await flush();
  expect(hub().textContent).toContain('No notifications yet');
  expect(hub().textContent).not.toContain('SHELL_NOTIFICATION_HUB_LOAD_FAILED');
  log.mockRestore();
});

test('Escape and Close restore focus; outside clicks close without stealing focus', async () => {
  initNotificationHub(); await flush();
  trigger().click();
  refresh().focus();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(hub().hidden).toBe(true);
  expect(document.activeElement).toBe(trigger());
  trigger().click();
  document.querySelector<HTMLButtonElement>('[data-notification-close]')!.click();
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
  trigger().click();
  document.body.click();
  expect(hub().hidden).toBe(true);
});

test('preserves the update action and one toast per session, without unsafe destinations or markup', async () => {
  const info = jest.fn();
  window.bpToast = { info } as unknown as NonNullable<Window['bpToast']>;
  const items = [
    { id: 'blogposter-update-test', actionPath: '/admin/settings/updates', message: 'Update available', actionLabel: 'View update' },
    { moduleName: '<script>bad()</script>', priority: '__proto__', message: '<img src=x>', actionPath: 'https://example.com/', timestamp: 'invalid' }
  ];
  fetchRecent.mockResolvedValue(items);
  initNotificationHub(); await flush();
  const action = hub().querySelector('a')!;
  action.focus();
  refresh().click(); await flush();
  expect(hub().querySelector('a')).toBe(action);
  expect(info).toHaveBeenCalledTimes(1);
  expect(hub().querySelectorAll('a')).toHaveLength(1);
  expect(action.getAttribute('href')).toBe('/admin/settings/updates');
  expect(hub().querySelector('script')).toBeNull();
  expect(hub().querySelector('time')).toBeNull();
  expect(hub().textContent).toContain('<img src=x>');
});
