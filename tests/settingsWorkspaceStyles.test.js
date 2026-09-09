const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '../public/assets/css/site.css'), 'utf8');
const rule = selector => css.slice(css.indexOf(selector)).split('}')[0];

test('Add page centers the label independently and gives its icon text contrast', () => {
  expect(rule('.app-scope .page-manager .button[data-action=add] {')).toContain('padding-inline: 32px');
  const icon = rule('.page-manager .button[data-action=add]::before {');
  expect(icon).toContain('background: currentColor');
  expect(icon).toContain('translateY(-50%)');
});

test('notification bell sits immediately before the account menu', () => {
  const html = fs.readFileSync(path.join(__dirname, '../public/plainspace/partials/top-header.html'), 'utf8');
  expect(html).toMatch(/class="right-icons">\s*<button[^>]*aria-label="Open notifications"[^>]*>\s*<img src="\/assets\/icons\/bell.svg"[^>]*\/>\s*<\/button>\s*<div id="account-menu"/);
  expect(rule('.top-header .logo {')).toContain('min-width: var(--studio-control-size)');
});

test('header controls share symmetric desktop and mobile insets', () => {
  expect(rule('.top-header {')).toContain('padding: 8px 24px');
  expect(rule('.main-header {')).toContain('padding: 18px 24px 12px');
  expect(rule('.top-header .left-icons a.project-link {')).toContain('justify-content: center');
  expect(css).toMatch(/@media \(max-width: 700px\)\s*\{\s*\.top-header \{\s*padding-inline: 12px/);
  expect(rule('#content-header[hidden], .content-header[hidden] {')).toContain('display: none');
});

test('admin tools omit redundant titles without hiding dialog or section headings', () => {
  for (const selector of [
    '.media-explorer--manage > .media-explorer__heading {',
    '.page-manager__header > div:first-child {',
    '.settings-surface-header > :is(.page-title, .settings-hint) {',
    '.widget-library__header > div:first-child {',
    '.modules-title-bar {',
    '.navigation-studio__header > div:first-child {'
  ]) expect(rule(selector)).toContain('display: none');
});

test('icon sidebar labels escape the rail and branding remains icon-only', () => {
  expect(rule('.admin-panel:has(#content[data-dashboard-layout=fixed]) .sidebar {')).toContain('overflow: visible');
  expect(rule('.admin-panel:has(#content[data-dashboard-layout=fixed]) .sidebar.settings-sidebar {')).toContain('overflow-y: auto');
  expect(rule('.top-header .project-link__name {')).toContain('display: none');
});

test('header search has no square focus ring and shared headers omit legacy layout editing', () => {
  expect(rule('.top-header .search-container input:focus {')).toContain('box-shadow: none');
  for (const partial of ['content-header.html', 'content-header-pages.html']) {
    const html = fs.readFileSync(path.join(__dirname, '../public/plainspace/partials', partial), 'utf8');
    expect(html).not.toContain('id="edit-toggle"');
    expect(html).toContain('id="content-breadcrumb"');
  }
});

test('Settings fill a bounded workspace with a scrolling body instead of nested cards', () => {
  expect(rule('.settings-surface {')).toMatch(/flex: 1 1 0/);
  expect(rule('.settings-surface {')).toMatch(/min-height: 0/);
  expect(rule('.settings-surface {')).toContain('box-shadow: 0 2px 8px');
  expect(rule('.settings-tab-panels {')).toContain('overflow: auto');
  expect(rule('.settings-surface :is(.page-list-card, .user-list-card, .settings-section) {')).toContain('background: transparent');
  expect(rule('body.has-content-footer .admin-panel #content[data-dashboard-layout=fixed]:has(> .settings-surface) {')).toContain('padding-bottom: 20px');
});

test('breadcrumbs use transparent, borderless flow below navigation', () => {
  const header = rule('.content-header {');
  expect(header).toContain('position: static');
  expect(header).toContain('background: transparent');
  expect(header).toContain('border-top: 0');
  expect(header).toContain('box-shadow: none');
  expect(header).toContain('padding-left: 24px');
  expect(rule('.content-header #content-breadcrumb {')).toContain('padding-left: 0');
  expect(rule('.admin-panel > #content-header {')).not.toContain('padding-left');
  expect(css).toMatch(/@media \(max-width: 700px\)\s*\{\s*\.content-header \{[^}]*padding-left: 12px/);
});

test('workspace navigation is plain until selected, including the create action', () => {
  const shell = rule('.main-header .nav-icons a::before,');
  expect(shell).toContain('background: transparent');
  expect(shell).toContain('box-shadow: none');
  const selected = rule('.main-header .nav-icons a.active::before,');
  expect(selected).toContain('background: var(--studio-surface-solid)');
  expect(selected).toContain('border-color: var(--studio-border)');
});

test('workspace creation aligns with the left sidebar icon rail', () => {
  expect(rule('.main-header {')).toContain('padding-left: 24px');
  expect(css).toMatch(/@media \(max-width: 700px\)[\s\S]*?\.main-header \{\s*padding-left: 12px/);
});

test('Settings tabs, narrow layouts and module inspectors use the shared theme', () => {
  expect(rule('.bp-tabs.bp-tabs--underline > .button {')).toContain('color: var(--studio-text-muted)');
  expect(rule('.bp-tabs.bp-tabs--underline > .button:hover {')).toContain('box-shadow: none');
  expect(rule('.module-detail-panel {')).toContain('border: 1px solid var(--studio-border)');
  expect(css).toContain('@container settings-workspace (max-width: 680px)');
  expect(css).toContain('.main-content:has(.settings-sidebar)');
  expect(rule('.sidebar.settings-sidebar .sidebar-nav .sidebar-item .label {')).toContain('position: static');
});

test('system and installed update sections share minimum height and spacing', () => {
  const shared = rule('.core-update-summary,');
  expect(shared).toContain('.core-module-updates,');
  expect(shared).toContain('.installed-update-panel .modules-list-mount');
  expect(shared).toContain('min-height: 260px');
  expect(shared).toContain('align-content: start');
});

test('light ghost buttons remain shadowless at rest and on hover', () => {
  expect(rule('.app-scope .button.ghost {')).toContain('box-shadow: none');
  expect(rule('.app-scope .button.ghost:not(:disabled):hover,')).toContain('box-shadow: none');
});
