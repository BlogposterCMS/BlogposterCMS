/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');
const { renderPublicRuntimePageContent } = require('../ui/runtime/main/runtimePageComposition.ts');
jest.mock('../ui/runtime/main/runtimeAttachedContent.ts', () => ({ renderAttachedRuntimeContent: jest.fn() }));

test('the canonical page renderer sanitizes page HTML after retiring the old Designer loader', async () => {
  const contentEl = document.createElement('main');
  await renderPublicRuntimePageContent({
    page: { id: 'html-page', html: '<p>Visible</p><script>bad()</script><img src="x" onerror="bad()">', meta: {} },
    contentEl, allWidgets: [], lane: 'public', emit: jest.fn()
  });
  expect(contentEl.textContent).toContain('Visible');
  expect(contentEl.querySelector('script')).toBeNull();
  expect(contentEl.querySelector('[onerror]')).toBeNull();
  expect(fs.existsSync(path.join(__dirname, '../ui/designer/app/runtime/pageLoader.js'))).toBe(false);
});
