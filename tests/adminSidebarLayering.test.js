const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readCssRule(source, selector) {
  const start = source.indexOf(selector);
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  return source.slice(open + 1, close);
}

describe('admin sidebar layering', () => {
  it('keeps circular nav shadows above the adjacent content plane', () => {
    const adminScss = readProjectFile('public/assets/scss/pages/_admin.scss');
    const sidebarBubbleScss = readProjectFile('public/assets/scss/components/_sidebar-bubble.scss');
    const contentAreaScss = readProjectFile('public/assets/scss/components/_content-area.scss');
    const siteCss = readProjectFile('public/assets/css/site.css');
    const sidebarHostCss = readCssRule(siteCss, '.main-content > #sidebar');
    const sidebarCss = readCssRule(siteCss, '.sidebar');
    const contentCss = readCssRule(siteCss, '#content');

    expect(adminScss).toContain('.main-content > #sidebar');
    expect(adminScss).toContain('z-index: 20');
    expect(adminScss).toContain('overflow: visible');
    expect(contentAreaScss).toContain('position: relative');
    expect(contentAreaScss).toContain('z-index: 0');
    expect(sidebarHostCss).toContain('position: relative');
    expect(sidebarHostCss).toContain('z-index: 20');
    expect(sidebarHostCss).toContain('overflow: visible');
    expect(sidebarBubbleScss).toContain('--studio-sidebar-shadow-bleed: 16px');
    expect(sidebarBubbleScss).toContain('width: calc(88px + var(--studio-sidebar-shadow-bleed))');
    expect(sidebarBubbleScss).toContain('padding: 28px calc(18px + var(--studio-sidebar-shadow-bleed)) 0 18px');
    expect(sidebarCss).toContain('--studio-sidebar-shadow-bleed: 16px');
    expect(sidebarCss).toContain('width: calc(88px + var(--studio-sidebar-shadow-bleed))');
    expect(sidebarCss).toContain('padding: 28px calc(18px + var(--studio-sidebar-shadow-bleed)) 0 18px');
    expect(siteCss).toContain('width: calc(64px + var(--studio-sidebar-shadow-bleed))');
    expect(contentCss).toContain('position: relative');
    expect(contentCss).toContain('z-index: 0');
  });
});
