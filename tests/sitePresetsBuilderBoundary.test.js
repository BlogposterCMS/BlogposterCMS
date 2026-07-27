'use strict';

const fs = require('fs');
const path = require('path');

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('Builder reuses the existing Layout panel for Site Presets and keeps color and font modules separate', () => {
  const sidebar = source('apps/designer/partials/sidebar-builder.html');
  const header = source('apps/designer/partials/builder-header.html');
  const layoutPanel = source('apps/designer/partials/layout-panel.html');
  const layoutMode = source('ui/designer/app/renderer/layoutMode.js');

  expect(header).toContain('id="globalDesignSettingsBtn"');
  expect(header).toContain('aria-label="Design settings"');
  expect(sidebar).toContain('data-sidebar-panel="design"');
  expect(sidebar).toContain('data-color-scheme-host');
  expect(sidebar).toContain('data-font-packages-host');
  expect(sidebar).not.toContain('data-sidebar-panel-target="colors"');
  expect(sidebar).not.toContain('data-sidebar-panel-target="fonts"');
  expect(sidebar).not.toContain('data-sidebar-panel-target="site-presets"');
  expect(layoutPanel).toContain('data-site-presets-host');
  expect(layoutMode).toContain('applySitePreset');
  expect(layoutMode).toContain('captureSitePresetDemo');
  expect(layoutMode).toContain('applySitePresetDemo');
});

test('public runtime uses central CSS and has no active Theme package dependency', () => {
  const runtimeShell = source('ui/runtime/main/runtimePageShell.ts');
  const publicRoutes = source('mother/server/http/publicPageRoutes.js');
  const adminRoutes = source('mother/server/http/adminShellRoutes.js');
  const staticAssets = source('mother/server/http/staticAssets.js');

  expect(runtimeShell).toContain("return '/assets/css/runtime.css'");
  expect(runtimeShell).not.toContain('ACTIVE_THEME');
  expect(publicRoutes).not.toContain('ACTIVE_THEME');
  expect(adminRoutes).not.toContain('ACTIVE_THEME');
  expect(staticAssets).not.toContain("app.use('/themes'");
  expect(staticAssets).not.toContain("app.use('/presets'");
});
