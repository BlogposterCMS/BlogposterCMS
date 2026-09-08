/** @jest-environment jsdom */
import { mountWebsiteDesignPreview } from '../ui/shared/design-system/websiteDesignPreview';
import { configureColorLibraryClient, refreshColorLibrary } from '../ui/shared/colors/colorLibrary';
import { configureFontPackagesClient, refreshFontPackages, FONT_PACKAGE_ROLES } from '../ui/shared/fonts/fontPackages';

test('visual list renders names beside both theme variants and updates from the canonical library', async () => {
  let darkValue = '#FFFFFF';
  const emit = jest.fn(async (_event, request) => {
    if (request.resource === 'colors') {
      const colors = [{ id: 'default-1', name: 'Brand', value: '#111111', darkValue }];
      return { version: 2, activeSchemeId: 'scheme-test', schemes: [{ id: 'scheme-test', name: 'Test', colors }], colors };
    }
    return { version: 1, activePackageId: 'font-test', packages: [{ id: 'font-test', name: 'Test', roles: Object.fromEntries(FONT_PACKAGE_ROLES.map(role => [role, { fontFamily: 'Arial', fontSize: '16px', color: 'var(--bp-color-default-1, #111111)' }])) }] };
  });
  configureColorLibraryClient({ emit, token: 'test', lane: 'admin' });
  configureFontPackagesClient({ emit, token: 'test', lane: 'admin' });
  await Promise.all([refreshColorLibrary(), refreshFontPackages()]);
  const host = document.createElement('div'); document.body.appendChild(host);
  const dispose = mountWebsiteDesignPreview(host, () => ({ logoUrl: '/light.svg', logoDarkUrl: '/dark.svg' }));
  const row = host.querySelector('[data-design-token="Brand"]')!;
  expect(row.firstElementChild?.textContent).toBe('Brand');
  expect(row.querySelectorAll('[data-preview-theme]')).toHaveLength(2);
  expect(row.textContent).toContain('#FFFFFF');
  expect(host.querySelector('[data-design-token="Logo"] [data-preview-theme="dark"] img')?.getAttribute('src')).toBe('/dark.svg');
  expect(host.querySelectorAll('.bp-button-widget')).toHaveLength(2);
  expect(host.querySelector('[data-design-token-id="default-1"]')).not.toBeNull();
  darkValue = '#AAAAAA'; await refreshColorLibrary();
  expect(host.querySelector('[data-design-token="Brand"]')?.textContent).toContain('#AAAAAA');
  dispose(); host.remove();
});

test('selected kit preview reads that kit without activating it', () => {
  const host = document.createElement('div');
  const dispose = mountWebsiteDesignPreview(host, undefined, () => ({
    colors: [{ id: 'default-1', name: 'Imported brand', value: '#123456', darkValue: '#ABCDEF' }], fontPackage: null
  }));
  expect(host.textContent).toContain('Imported brand');
  expect(host.textContent).toContain('#ABCDEF');
  dispose();
});
