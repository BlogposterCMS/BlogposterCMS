/**
 * @jest-environment jsdom
 */

import {
  FONT_PACKAGE_ROLES,
  activateFontPackage,
  applyActiveFontPackage,
  configureFontPackagesClient,
  createFontPackage,
  fontPackagesAgentState,
  getActiveFontPackage,
  getFontPackagesSnapshot,
  refreshFontPackages,
  updateFontPackageRole,
  type FontPackage,
  type FontRoleStyles
} from '../ui/shared/fonts/fontPackages';

function roleStyles(overrides: Partial<FontRoleStyles> = {}): FontRoleStyles {
  return {
    fontFamily: 'Work Sans',
    fontSize: '16px',
    fontWeight: '400',
    lineHeight: '1.5',
    letterSpacing: '0px',
    color: '#111827',
    fontStyle: 'normal',
    textTransform: 'none',
    textDecoration: 'none',
    ...overrides
  };
}

function fontPackage(id: string, name: string): FontPackage {
  return {
    id,
    name,
    roles: Object.fromEntries(
      FONT_PACKAGE_ROLES.map(role => [
        role,
        roleStyles(role === 'h1'
          ? { fontFamily: 'Manrope', fontSize: '48px', fontWeight: '700' }
          : {})
      ])
    ) as FontPackage['roles']
  };
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.documentElement.removeAttribute('data-bp-font-package-ready');
  document.documentElement.removeAttribute('data-bp-font-packages-lane');
});

test('font package client publishes active semantic typography as scoped CSS', async () => {
  const defaultPackage = fontPackage('font-package-default', 'Default');
  defaultPackage.roles.body.fontFamily = 'inherit';
  const emit = jest.fn(async () => ({
    version: 1,
    activePackageId: defaultPackage.id,
    packages: [defaultPackage]
  }));
  configureFontPackagesClient({
    emit: emit as NonNullable<Window['meltdownEmit']>,
    token: 'admin-token',
    lane: 'admin'
  });

  await refreshFontPackages();

  expect(getActiveFontPackage()?.name).toBe('Default');
  const css = document.getElementById('bp-font-package-tokens')?.textContent || '';
  expect(css).toContain('--bp-type-h1-font-family: "Manrope", system-ui, sans-serif');
  expect(css).toContain('--bp-type-body-font-family: inherit');
  expect(css).not.toContain('"inherit"');
  expect(css).toContain('.builder-themed h1');
  expect(css).toContain('var(--bp-type-link-color)');
  expect(document.documentElement.dataset.bpFontPackageReady).toBe('true');
  expect(fontPackagesAgentState()).toMatchObject({
    status: 'ready',
    packageCount: 1,
    activePackageName: 'Default'
  });
});

test('font package client creates, activates and updates packages through the admin facade', async () => {
  const base = fontPackage('font-package-default', 'Default');
  const editorial = fontPackage('11111111-2222-4333-8444-555555555555', 'Editorial');
  let library = { version: 1, activePackageId: base.id, packages: [base] };
  const emit = jest.fn(async (_eventName: string, payload: Record<string, any>) => {
    const action = payload.action;
    if (action === 'list') return library;
    if (action === 'create') {
      library = { version: 1, activePackageId: editorial.id, packages: [base, editorial] };
      return { package: editorial, library };
    }
    if (action === 'activate') {
      library = { ...library, activePackageId: String(payload.params.id) };
      return { package: editorial, library };
    }
    if (action === 'updateRole') {
      const changed = {
        ...editorial,
        roles: {
          ...editorial.roles,
          link: {
            ...editorial.roles.link,
            color: String(payload.params.settings.color)
          }
        }
      };
      library = { ...library, packages: [base, changed] };
      return { package: changed, library };
    }
    return null;
  });
  configureFontPackagesClient({
    emit: emit as NonNullable<Window['meltdownEmit']>,
    token: 'admin-token',
    lane: 'admin'
  });
  await refreshFontPackages();

  await createFontPackage({ name: 'Editorial', copyFromId: base.id });
  await activateFontPackage(editorial.id);
  await updateFontPackageRole({
    id: editorial.id,
    role: 'link',
    settings: {
      color: 'var(--bp-color-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee, #336699)'
    }
  });

  expect(getFontPackagesSnapshot().activePackageId).toBe(editorial.id);
  expect(getActiveFontPackage()?.roles.link.color)
    .toBe('var(--bp-color-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee, #336699)');
  expect(emit).toHaveBeenLastCalledWith('cmsAdminApiRequest', expect.objectContaining({
    resource: 'fontPackages',
    action: 'updateRole'
  }));

  const style = applyActiveFontPackage();
  expect(style.textContent).toContain('var(--bp-color-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee, #336699)');
});
