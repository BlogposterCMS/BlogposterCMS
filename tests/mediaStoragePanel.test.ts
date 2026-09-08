/** @jest-environment jsdom */
import { createMediaStoragePanel } from '../ui/shared/media/mediaStoragePanel';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const reply = (data: unknown, ok = true) => ({ ok, json: async () => data }) as Response;

test('storage form masks credentials, retains failed drafts and disables publication while dirty', async () => {
  const request = jest.fn(async (_resource: RequestInfo | URL, _options?: RequestInit) => reply({ provider: 'alibaba-oss', bucket: 'bucket', region: 'oss-cn-hangzhou', publicBaseUrl: 'https://cdn.example.com', credentialsConfigured: true, canConfigure: true }));
  const panel = createMediaStoragePanel({ request: request as typeof fetch, csrfToken: 'csrf' });
  document.body.replaceChildren(panel);
  (panel as HTMLDetailsElement).open = true; panel.dispatchEvent(new Event('toggle')); await tick();
  const secret = panel.querySelector<HTMLInputElement>('[name=accessKeySecret]')!;
  expect(secret.type).toBe('password'); expect(secret.value).toBe('');
  secret.value = 'replacement'; secret.dispatchEvent(new Event('input', { bubbles: true }));
  expect(panel.querySelectorAll('fieldset')[1]!.disabled).toBe(true);
  request.mockImplementation(async () => reply({ error: 'MEDIA_STORAGE_OPERATION_FAILED' }, false));
  panel.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await tick();
  expect(secret.value).toBe('replacement');
  expect(panel.textContent).toContain('MEDIA_STORAGE_OPERATION_FAILED');
  expect(request.mock.calls.at(-1)?.[1]).toMatchObject({ method: 'PUT', headers: { 'X-CSRF-Token': 'csrf' } });
});

test('custom-select change-only events disable publish until settings are saved', async () => {
  const request = jest.fn(async () => reply({ provider: 'local', canConfigure: true }));
  const panel = createMediaStoragePanel({ request: request as typeof fetch });
  (panel as HTMLDetailsElement).open = true; panel.dispatchEvent(new Event('toggle')); await tick();
  const provider = panel.querySelector('select')!;
  provider.value = 'alibaba-oss'; provider.dispatchEvent(new Event('change', { bubbles: true }));
  expect(panel.querySelectorAll('fieldset')[1]!.disabled).toBe(true);
  expect(panel.textContent).toContain('Unsaved storage settings.');
  expect(panel.querySelector<HTMLInputElement>('[name=forcePathStyle]')!.parentElement!.parentElement!.hidden).toBe(true);
});

test('failed initial load leaves storage writes disabled and exposes retry', async () => {
  const request = jest.fn(async () => reply({ error: 'MEDIA_STORAGE_CONFIG_UNREADABLE' }, false));
  const panel = createMediaStoragePanel({ request: request as typeof fetch });
  (panel as HTMLDetailsElement).open = true; panel.dispatchEvent(new Event('toggle')); await tick();
  expect(Array.from(panel.querySelectorAll('fieldset')).every(field => field.disabled)).toBe(true);
  expect(panel.textContent).toContain('Reload storage settings');
});
