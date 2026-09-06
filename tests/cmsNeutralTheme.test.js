const fs = require('fs');
const path = require('path');
const read = relative => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

test('the default preset and account fallback use the same neutral primary', () => {
  const preset = JSON.parse(read('presets/site-preset-default/preset.json'));
  expect(preset.colorScheme.colors.find(color => color.id === 'default-1').value).toBe('#171717');
  const defaults = require('../mother/modules/colorLibrary/colorLibraryService')._internals.defaultScheme();
  expect(defaults.colors[0].value).toBe('#171717');
  expect(read('mother/modules/userManagement/userCrudEvents.js')).toContain("uiColor     || '#171717'");
});

test('list selection uses the full row without a leading accent stripe', () => {
  const pages = read('public/assets/scss/pages/_pages.scss');
  expect(pages).toContain('.page-manager__toggle-space { display: none; }');
  expect(pages).toContain(".page-manager__row:has(.page-manager__select[aria-pressed='true'])");
  for (const name of ['pages', 'widgets', 'navigation-studio', 'modules']) {
    expect(read(`public/assets/scss/pages/_${name}.scss`)).not.toMatch(/box-shadow:\s*inset 3px 0/);
  }
  const tokens = read('public/assets/scss/_variables.scss');
  expect(tokens.match(/--user-color: hsl\(var\(--accent-h\), var\(--accent-s\), var\(--accent-dark-l\)\)/g)).toHaveLength(2);
});
