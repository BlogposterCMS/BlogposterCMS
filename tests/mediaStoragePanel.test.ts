/** @jest-environment jsdom */
import { createMediaStoragePanel } from '../ui/shared/media/mediaStoragePanel';
import { getWorkspaceChangeState } from '../ui/shared/navigation/workspaceChanges';
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const reply = (data: unknown, ok = true) => ({ ok, json: async () => data }) as Response;
const snapshot = () => ({ defaultConnectionId: 'china', canConfigure: true,
  connections: [{ connectionId: 'local', name: 'Local server', provider: 'local' },
    { connectionId: 'china', name: 'China downloads', provider: 'alibaba-oss', bucket: 'test-bucket', credentialsConfigured: true, publicBaseUrl: 'https://cdn.example.com' }],
  adapters: [{ id: 'local', label: 'Local server', fields: [] }, { id: 'alibaba-oss', label: 'Alibaba OSS', fields: [
    { name: 'bucket', label: 'Bucket', required: true }, { name: 'accessKeySecret', label: 'Access key secret', secret: true, required: true }
  ] }, { id: 'custom', label: 'Custom server adapter', fields: [{ name: 'endpoint', label: 'Server address', type: 'url', required: true }] }]
});
afterEach(() => document.body.replaceChildren());

test('Settings masks credentials, retains failed drafts and registers unsaved state', async () => {
  const request = jest.fn(async (_resource: RequestInfo | URL, _options?: RequestInit) => reply(snapshot()));
  const panel = createMediaStoragePanel({ mode: 'edit', request: request as typeof fetch, csrfToken: 'csrf' });
  document.body.replaceChildren(panel); await tick();
  const secret = panel.querySelector<HTMLInputElement>('[name=accessKeySecret]')!;
  expect(secret.type).toBe('password'); expect(secret.value).toBe('');
  expect(panel.querySelector('[name=downloadFile]')).toBeNull();
  secret.value = 'replacement'; secret.dispatchEvent(new Event('input', { bubbles: true }));
  expect(getWorkspaceChangeState().dirty).toBe(true);
  request.mockImplementation(async () => reply({ error: 'MEDIA_STORAGE_OPERATION_FAILED' }, false));
  panel.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true })); await tick();
  expect(secret.value).toBe('replacement');
  expect(panel.textContent).toContain('MEDIA_STORAGE_OPERATION_FAILED');
  expect(request.mock.calls.at(-1)?.[1]).toMatchObject({ method: 'PUT', headers: { 'X-CSRF-Token': 'csrf' } });
  Array.from(panel.querySelectorAll('button')).find(button => button.textContent === 'Discard changes')!.click();
  expect(getWorkspaceChangeState().dirty).toBe(false);
  expect(panel.querySelector<HTMLInputElement>('[name=accessKeySecret]')!.value).toBe('');
});

test('new adapters supply their form fields without hard-coded provider UI', async () => {
  const panel = createMediaStoragePanel({ mode: 'edit', initialConnectionId: 'new', request: jest.fn(async () => reply(snapshot())) as typeof fetch });
  document.body.replaceChildren(panel); await tick();
  const provider = panel.querySelector<HTMLSelectElement>('[name=provider]')!;
  provider.value = 'custom'; provider.dispatchEvent(new Event('change', { bubbles: true }));
  expect(panel.querySelector<HTMLInputElement>('[name=endpoint]')!.type).toBe('url');
  expect(panel.querySelector('[name=accessKeySecret]')).toBeNull();
  expect(panel.textContent).toContain('Unsaved connection changes.');
  expect(Array.from(panel.querySelectorAll('button')).every(button => button.classList.contains('button'))).toBe(true);
});

test('publication selects the requested destination and contains no storage configuration', async () => {
  const request = jest.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => reply(snapshot()));
  const panel = createMediaStoragePanel({ mode: 'publish', initialConnectionId: 'china', request: request as typeof fetch });
  document.body.replaceChildren(panel); await tick();
  expect(panel.querySelector<HTMLSelectElement>('[name=connectionId]')!.value).toBe('china');
  expect(panel.querySelector('[name=provider]')).toBeNull();
  expect(panel.querySelector('[type=password]')).toBeNull();
  const file = panel.querySelector<HTMLInputElement>('[name=downloadFile]')!;
  expect(file.hidden).toBe(true);
  Object.defineProperty(file, 'files', { value: [new File(['apk'], 'app.apk')] });
  request.mockImplementation(async () => reply({ url: 'https://cdn.example.com/app.apk', checksum: 'hash' }));
  Array.from(panel.querySelectorAll('button')).find(button => button.textContent === 'Upload and publish')!.click(); await tick();
  expect(request.mock.calls.at(-1)?.[0]).toBe('/admin/api/media/storage/upload?connectionId=china');
});

test('failed initial load keeps writes disabled and exposes retry', async () => {
  const panel = createMediaStoragePanel({ mode: 'settings', request: jest.fn(async () => reply({ error: 'MEDIA_STORAGE_CONFIG_UNREADABLE' }, false)) as typeof fetch });
  document.body.replaceChildren(panel); await tick();
  expect(Array.from(panel.querySelectorAll('button')).find(button => button.textContent === 'Add connection')!.disabled).toBe(true);
  expect(panel.textContent).toContain('Reload connections');
});

test('overview opens a guarded modal without showing inline credential fields', async () => {
  const panel = createMediaStoragePanel({ mode: 'settings', request: jest.fn(async () => reply(snapshot())) as typeof fetch });
  document.body.replaceChildren(panel); await tick();
  expect(panel.textContent).toContain('China downloads');
  expect(panel.textContent).toContain('Default destination');
  expect(panel.querySelector('input')).toBeNull();
  panel.querySelector<HTMLButtonElement>('[aria-label="Edit China downloads"]')!.click(); await tick();
  const dialog = document.querySelector<HTMLElement>('[role=dialog]')!;
  expect(dialog).toBeTruthy();
  const secret = dialog.querySelector<HTMLInputElement>('[name=accessKeySecret]')!;
  secret.value = 'draft'; secret.dispatchEvent(new Event('input', { bubbles: true }));
  dialog.querySelector<HTMLButtonElement>('[data-action=close]')!.click();
  expect(dialog.textContent).toContain('Save or discard');
  Array.from(dialog.querySelectorAll('button')).find(button => button.textContent === 'Discard changes')!.click();
  dialog.querySelector<HTMLButtonElement>('[data-action=close]')!.click(); await tick();
  expect(panel.querySelector('input')).toBeNull();
});
