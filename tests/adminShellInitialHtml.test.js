const path = require('path');
const { prepareAdminShellHtml } = require('../mother/server/http/adminShellRoutes');

test.each([
  [{ layout: { sidebar: 'empty-sidebar' } }, true],
  [{ layout: { inheritsLayout: false } }, true],
  [{ layout: { sidebar: 'default-sidebar' } }, false]
])('initial HTML respects existing sidebar metadata: %j', (pageMeta, hidden) => {
  const { html } = prepareAdminShellHtml({
    adminToken: 'fixture-token', csrfToken: 'fixture-csrf', escapeHtml: value => value,
    injectDevBanner: value => value, pageId: 1, pageMeta,
    plainSpaceVersion: 'fixture', publicPath: path.join(__dirname, '../public'),
    renderMode: 'client', slug: 'home'
  });
  expect(html.includes('<aside id="sidebar" style="display:none"')).toBe(hidden);
  expect(html).toContain('bp-loader--skeleton');
  expect(html).toContain('/ui/shell/entries/adminShellLoading.js');
  expect(html).toContain('/build/pageRenderer.js');
});
