const assert = require('assert');

const { extractStyleHints, _internals } = require('../mother/modules/importer/importers/wordpressStyleHints');

test('WordPress style hints extract CSS variables, colors, fonts and spacing', async () => {
  const files = new Map([
    ['theme/global.css', ':root { --brand-primary: #123456; --surface-bg: #ffffff; } body { color: #222; font-family: Inter, sans-serif; margin: 24px; } .hero { gap: 32px; }'],
    ['pages/home/page.css', '.button { background: rgba(10, 20, 30, 0.8); padding: 12px 18px; }']
  ]);
  const reader = {
    async has(path) {
      return files.has(path);
    },
    async readText(path) {
      return files.get(path);
    }
  };

  const hints = await extractStyleHints(reader, {
    theme: { styles: ['theme/global.css'] },
    pages: [{ styles: ['pages/home/page.css'] }]
  });

  assert.deepStrictEqual(hints.scannedStyles, ['theme/global.css', 'pages/home/page.css']);
  assert.strictEqual(hints.tokens.cssVariables['brand-primary'], '#123456');
  assert.strictEqual(hints.tokens.roles.primary, '#123456');
  assert(hints.tokens.colors.some(item => item.value === '#222'));
  assert(hints.tokens.fonts.some(item => item.value === 'Inter, sans-serif'));
  assert(hints.tokens.spacing.some(item => item.value === '12px 18px'));
});

test('WordPress style hints infer token roles from counted colors when variables are absent', () => {
  const roles = _internals.inferTokenRoles({}, [{ value: '#abcdef', count: 2 }]);

  assert.strictEqual(roles.primary, '#abcdef');
});

test('WordPress style hints accepts final CSS declarations without semicolons', async () => {
  const reader = {
    async has() {
      return true;
    },
    async readText() {
      return ':root{--brand:#4488cc} body{font-family:Inter,sans-serif;margin:24px;color:#111}';
    }
  };

  const hints = await extractStyleHints(reader, { theme: { styles: ['theme.css'] }, pages: [] });

  assert.strictEqual(hints.tokens.cssVariables.brand, '#4488cc');
  assert.strictEqual(hints.tokens.roles.primary, '#4488cc');
  assert(hints.tokens.fonts.some(item => item.value === 'Inter,sans-serif'));
});
