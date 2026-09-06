const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readCssRule(source, selector) {
  const normalisedSource = source.replace(/\r\n/g, '\n');
  const normalisedSelector = selector.replace(/\r\n/g, '\n');
  const escapedSelector = normalisedSelector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exactMatch = normalisedSource.match(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([^}]*)\\}`));
  if (exactMatch) return exactMatch[1];
  const start = normalisedSource.indexOf(normalisedSelector);
  if (start < 0) return '';
  const open = normalisedSource.indexOf('{', start);
  const close = normalisedSource.indexOf('}', open);
  return normalisedSource.slice(open + 1, close);
}

describe('navigation studio styles', () => {
  it('keeps local card chrome shadowless with explicit bordered and borderless variants', () => {
    const scss = readProjectFile('public/assets/scss/pages/_navigation-studio.scss');
    const siteCss = readProjectFile('public/assets/css/site.css');
    const widgetTs = readProjectFile('ui/widgets/plainspace/admin/navigationStudioWidget.ts');
    const docs = readProjectFile('docs/modules/navigationManager.md');

    const cardScss = readCssRule(scss, '.navigation-studio__card,\n.navigation-studio__panel');
    const borderedScss = readCssRule(scss, '.navigation-studio__card--bordered,\n.navigation-studio__panel');
    const activeTabScss = readCssRule(scss, '.navigation-studio__mode.is-active,\n.navigation-studio__preview-tab.is-active');
    const itemScss = readCssRule(scss, '.navigation-studio__item');
    const selectedItemScss = readCssRule(scss, '.navigation-studio__item.is-selected');

    expect(scss).toContain('--navigation-studio-card-border-width: 2px');
    expect(cardScss).toContain('border: 0');
    expect(cardScss).toContain('box-shadow: none');
    expect(borderedScss).toContain('border: var(--navigation-studio-card-border-width) solid var(--navigation-studio-card-border)');
    expect(activeTabScss).toContain('box-shadow: none');
    expect(itemScss).toContain('border: 1px solid transparent');
    expect(itemScss).toContain('box-shadow: none');
    expect(selectedItemScss).toContain('background: color-mix');
    expect(selectedItemScss).not.toContain('inset 3px');

    expect(widgetTs).toContain("NAVIGATION_STUDIO_PANEL_CARD_CLASS = 'navigation-studio__card'");
    expect(siteCss).toContain('--navigation-studio-card-border-width: 2px');
    expect(siteCss).toContain('.navigation-studio__card,');
    expect(siteCss).toContain('border: var(--navigation-studio-card-border-width) solid var(--navigation-studio-card-border)');
    expect(docs).toContain('shadowless local card utility');
  });

  it('fits the widget width and keeps optional controls out of the primary flow', () => {
    const css = readProjectFile('public/assets/css/site.css');
    expect(css).toContain('container: navigation-studio/inline-size');
    expect(css).toContain('@container navigation-studio (max-width: 800px)');
    expect(readCssRule(css, '.navigation-studio__layout')).toContain('minmax(0, 1fr) minmax(290px, 360px)');
    expect(readCssRule(css, '.navigation-studio [hidden]')).toContain('display: none !important');
    expect(readCssRule(css, '.navigation-studio__drop-child')).toContain('display: none');
    expect(readCssRule(css, '.navigation-studio__search-results')).toContain('max-height: 260px');
  });
});
