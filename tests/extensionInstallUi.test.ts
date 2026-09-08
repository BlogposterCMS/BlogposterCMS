/** @jest-environment jsdom */
import { openExtensionUpload } from '../ui/shared/module-access/extensionUpload';
import { reviewWidgetPackage } from '../ui/widgets/plainspace/admin/widgetPackageControls';

beforeEach(() => { document.body.innerHTML = ''; delete (window as any).bpDialog; });

test('file picker rejects multiple files before inspection', async () => {
  const install = jest.fn();
  openExtensionUpload(install);
  const input = document.querySelector('input')!;
  Object.defineProperty(input, 'files', { value: [new File(['x'], 'a.zip'), new File(['x'], 'b.zip')] });
  input.dispatchEvent(new Event('change'));
  expect(install).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain('EXTENSION_FILE_INVALID');
});

test('dropping a file uses the same inspection callback without installing on cancellation', async () => {
  let inspected: (value: unknown) => void;
  const completed = new Promise(resolve => { inspected = resolve; });
  const install = jest.fn(async (data: string, name: string) => { inspected({ data, name }); return false; });
  openExtensionUpload(install);
  const drop = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(drop, 'dataTransfer', { value: { files: [new File(['zip bytes'], 'sample.zip')] } });
  document.querySelector('.module-upload-box')!.dispatchEvent(drop);
  await expect(completed).resolves.toEqual({ data: btoa('zip bytes'), name: 'sample.zip' });
  expect(install).toHaveBeenCalledTimes(1);
});

test('review preselects configured services only and submits the user selection', async () => {
  (window as any).bpDialog = { open: async ({ body }: { body: HTMLElement }) => {
    const checks = body.querySelectorAll<HTMLInputElement>('input');
    expect(checks[0]!.checked).toBe(true);
    expect(checks[1]!.checked).toBe(false);
    expect(checks[1]!.disabled).toBe(true);
    checks[0]!.checked = false;
    return { action: 'confirm' };
  } };
  const result = await reviewWidgetPackage({ widgetId: 'sample', requestedAccess: [{ service: 'draft', name: 'draft', reason: 'Unsent text', available: true }, { service: 'operation', name: 'send', reason: 'Send text', available: false }] }, true);
  expect(result).toEqual([]);
});

test('missing dialog cannot silently grant manifest access', async () => {
  await expect(reviewWidgetPackage({ widgetId: 'sample', requestedAccess: [] }, true)).rejects.toThrow('EXTENSION_REVIEW_UNAVAILABLE');
});

test('editing existing grants keeps revoked capabilities unchecked', async () => {
  (window as any).bpDialog = { open: async ({ body }: { body: HTMLElement }) => {
    expect(body.querySelector<HTMLInputElement>('input')!.checked).toBe(false);
    return { action: 'cancel' };
  } };
  expect(await reviewWidgetPackage({ widgetId: 'sample', approvedAccess: [], requestedAccess: [{ service: 'draft', name: 'draft', reason: 'Unsent text' }] }, false)).toBeNull();
});
