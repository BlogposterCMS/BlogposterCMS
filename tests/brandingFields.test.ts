/** @jest-environment jsdom */
import { createBrandingFields } from '../ui/widgets/plainspace/admin/settings/brandingFields';

test('dark preview follows the light fallback and removing a custom dark logo restores it', () => {
  const editor = createBrandingFields({ logoUrl: '/light.svg', logoDarkUrl: '/dark.svg', faviconUrl: '' }, async () => null, jest.fn());
  const dark = editor.root.querySelector('.branding-image--logoDarkUrl')!;
  (dark.querySelector('[aria-label="Remove Logo (dark)"]') as HTMLButtonElement).click();
  expect(editor.fields.logoDarkUrl!.value).toBe('');
  expect(dark.querySelector('img')!.getAttribute('src')).toBe('/light.svg');
  expect(dark.textContent).toContain('Uses the light logo');
  editor.fields.logoUrl!.value = '/new.svg';
  editor.fields.logoUrl!.dispatchEvent(new Event('change'));
  expect(dark.querySelector('img')!.getAttribute('src')).toBe('/new.svg');
});

test('picker updates the shared input and unsafe preview URLs remain inert', async () => {
  const pick = jest.fn(async () => '/picked.png');
  const editor = createBrandingFields({ logoUrl: '', logoDarkUrl: '', faviconUrl: '' }, pick, jest.fn());
  (editor.root.querySelector('.button') as HTMLButtonElement).click();
  await Promise.resolve();
  expect(editor.fields.logoUrl!.value).toBe('/picked.png');
  editor.fields.logoUrl!.value = 'javascript:alert(1)';
  editor.fields.logoUrl!.dispatchEvent(new Event('input'));
  expect(editor.root.querySelector('img')!.hasAttribute('src')).toBe(false);
  expect(editor.root.querySelector('details')!.open).toBe(false);
});
