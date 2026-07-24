'use strict';

const fs = require('fs');
const path = require('path');

test('designer keeps direct font overrides and offers Font Package default inheritance', () => {
  const toolbar = fs.readFileSync(
    path.join(__dirname, '..', 'ui', 'designer', 'app', 'editor', 'toolbar', 'toolbar.js'),
    'utf8'
  );
  const familyHelper = fs.readFileSync(
    path.join(__dirname, '..', 'ui', 'designer', 'app', 'editor', 'toolbar', 'fontFamily.js'),
    'utf8'
  );

  expect(toolbar).toContain("applyFont(opt.dataset.font)");
  expect(toolbar).toContain("opt.dataset.font || 'Default'");
  expect(toolbar).toContain("if (!carrier.style.fontFamily)");
  expect(familyHelper).toContain('data-font-default="true">Default</span>');
});
