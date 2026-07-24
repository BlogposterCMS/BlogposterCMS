/**
 * @jest-environment jsdom
 */

import { configureColorLibraryClient, refreshColorLibrary } from '../ui/shared/colors/colorLibrary';
import {
  FONT_PACKAGE_ROLES,
  configureFontPackagesClient,
  refreshFontPackages,
  type FontPackage,
  type FontRoleStyles
} from '../ui/shared/fonts/fontPackages';
import { initStyleLibrariesPanel } from '../ui/designer/app/managers/styleLibrariesPanel';

function styles(): FontRoleStyles {
  return {
    fontFamily: 'Work Sans',
    fontSize: '16px',
    fontWeight: '400',
    lineHeight: '1.5',
    letterSpacing: '0px',
    color: '#111827',
    fontStyle: 'normal',
    textTransform: 'none',
    textDecoration: 'none'
  };
}

function pkg(): FontPackage {
  return {
    id: 'font-package-default',
    name: 'Default',
    roles: Object.fromEntries(
      FONT_PACKAGE_ROLES.map(role => [role, styles()])
    ) as FontPackage['roles']
  };
}

test('designer exposes separate Color scheme and Font packages management surfaces', async () => {
  document.body.innerHTML = `
    <aside id="sidebar">
      <div data-color-scheme-host></div>
      <div data-font-packages-host></div>
    </aside>
  `;
  const activePackage = pkg();
  const emit = jest.fn(async (_event: string, payload: Record<string, any>) => {
    if (payload.resource === 'colors') {
      const colors = [
        { id: 'default-1', name: 'Primary', value: '#00C4CC' },
        { id: 'default-2', name: 'Text', value: '#111827' }
      ];
      return {
        version: 2,
        activeSchemeId: 'color-scheme-default',
        schemes: [{ id: 'color-scheme-default', name: 'Default', colors }],
        colors
      };
    }
    if (payload.resource === 'fonts') {
      return [{ name: 'Work Sans' }, { name: 'Manrope' }];
    }
    if (payload.resource === 'fontPackages') {
      return {
        version: 1,
        activePackageId: activePackage.id,
        packages: [activePackage]
      };
    }
    return null;
  });
  configureColorLibraryClient({
    emit: emit as NonNullable<Window['meltdownEmit']>,
    token: 'admin-token',
    lane: 'admin'
  });
  configureFontPackagesClient({
    emit: emit as NonNullable<Window['meltdownEmit']>,
    token: 'admin-token',
    lane: 'admin'
  });
  await refreshColorLibrary();
  await refreshFontPackages();

  const cleanup = initStyleLibrariesPanel(document.getElementById('sidebar') as HTMLElement);
  await Promise.resolve();
  await Promise.resolve();

  expect(document.querySelector('[aria-label="Color scheme"]')).not.toBeNull();
  expect(document.querySelector('[data-color-scheme-host]')?.textContent).toContain('Default 1 · Primary');
  expect(document.querySelector('[data-color-scheme-host]')?.textContent).toContain('Add default');
  expect(document.querySelector('[data-font-packages-host]')?.textContent).toContain('Create copy');
  expect(document.querySelector('[data-font-packages-host]')?.textContent).toContain('Heading 6');
  expect(document.querySelector('[data-font-packages-host]')?.textContent).toContain('Default 1 · Body');
  expect(document.querySelectorAll('[aria-label="Typography role"] option')).toHaveLength(
    FONT_PACKAGE_ROLES.length
  );
  expect((document.querySelector('[aria-label="Font package"]') as HTMLSelectElement).value)
    .toBe(activePackage.id);
  expect((document.querySelector('[aria-label="Color scheme name"]') as HTMLInputElement).value)
    .toBe('Default');
  expect((document.querySelector('[aria-label="Default color name"]') as HTMLInputElement).value)
    .toBe('Primary');
  expect((document.querySelector('[aria-label="Default color value"]') as HTMLInputElement).value)
    .toBe('#00C4CC');
  expect((document.querySelector('[aria-label="Choose default color"]') as HTMLInputElement).value)
    .toBe('#00c4cc');
  expect((document.querySelector('[aria-label="Font package name"]') as HTMLInputElement).value)
    .toBe('Default');
  expect((document.querySelector('[aria-label="Role color"]') as HTMLInputElement).value)
    .toBe('#111827');
  expect((document.querySelector('[aria-label="Size"]') as HTMLInputElement).value)
    .toBe('16px');

  cleanup();
});
