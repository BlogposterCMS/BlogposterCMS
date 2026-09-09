/** @jest-environment jsdom */
import { createImageField } from '../ui/shared/media/imageField';

test('media selection stages the URL, cancellation preserves it, removal inherits, errors remain visible', async () => {
  const input = document.createElement('input');
  const emit = jest.fn().mockResolvedValue({ shareURL: '/picked.jpg' });
  const reportError = jest.fn();
  const { root } = createImageField('Link preview image', input, {
    hint: 'Optional', emit, jwt: 't', reportError, fallback: () => '/fallback.jpg'
  });
  const changed = jest.fn(); input.addEventListener('input', changed);
  const choose = root.querySelector<HTMLButtonElement>('button')!;
  expect(choose.textContent).toBe('Choose from file manager');
  expect(choose.getAttribute('aria-label')).toBe('Choose from file manager: Link preview image');
  expect(choose.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  choose.click(); await new Promise(resolve => setTimeout(resolve, 0));
  expect(input.value).toBe('/picked.jpg'); expect(changed).toHaveBeenCalledTimes(1);
  expect(emit).toHaveBeenCalledWith('openMediaExplorer', { jwt: 't', publicUrlOnly: true });
  emit.mockResolvedValueOnce({ cancelled: true });
  choose.click(); await new Promise(resolve => setTimeout(resolve, 0));
  expect(input.value).toBe('/picked.jpg');
  root.querySelector<HTMLButtonElement>('[aria-label="Remove link preview image"]')!.click();
  expect(input.value).toBe(''); expect(root.querySelector('img')!.getAttribute('src')).toBe('/fallback.jpg');
  input.value = 'javascript:alert(1)'; input.dispatchEvent(new Event('input'));
  expect(root.querySelector('img')!.hasAttribute('src')).toBe(false);
  expect(root.textContent).toContain('IMAGE_PREVIEW_UNAVAILABLE');
  emit.mockRejectedValueOnce(new Error('offline'));
  choose.click(); await new Promise(resolve => setTimeout(resolve, 0));
  expect(reportError).toHaveBeenCalledWith('IMAGE_PICKER_FAILED: offline'); expect(choose.disabled).toBe(false);
});
