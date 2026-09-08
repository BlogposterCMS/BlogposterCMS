const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '../public/assets/css/site.css'), 'utf8');
const rule = selector => css.slice(css.indexOf(selector)).split('}')[0];

test('Settings fill a bounded workspace with a scrolling body instead of nested cards', () => {
  expect(rule('.settings-surface {')).toMatch(/flex: 1 1 0/);
  expect(rule('.settings-surface {')).toMatch(/min-height: 0/);
  expect(rule('.settings-tab-panels {')).toContain('overflow: auto');
  expect(rule('.settings-surface :is(.page-list-card, .user-list-card, .settings-section) {')).toContain('background: transparent');
  expect(rule('body.has-content-footer .admin-panel #content[data-dashboard-layout=fixed]:has(> .settings-surface) {')).toContain('padding-bottom: 20px');
});

test('Settings tabs, narrow layouts and module inspectors use the shared theme', () => {
  expect(rule('.bp-tabs.bp-tabs--underline > .button {')).toContain('color: var(--studio-text-muted)');
  expect(rule('.bp-tabs.bp-tabs--underline > .button:hover {')).toContain('box-shadow: none');
  expect(rule('.module-detail-panel {')).toContain('border: 1px solid var(--studio-border)');
  expect(css).toContain('@container settings-workspace (max-width: 680px)');
  expect(css).toContain('.main-content:has(.settings-sidebar)');
  expect(rule('.sidebar.settings-sidebar .sidebar-nav .sidebar-item .label {')).toContain('position: static');
});
