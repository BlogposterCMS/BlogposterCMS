/** @jest-environment jsdom */
import { bindEditingScope, inspectorLayoutContainer, parentLayoutContainer } from '../ui/designer/app/managers/editingScope.js';
import { firstSectionCapture } from '../ui/shared/preview/sectionCapture.js';
import { serializeLayout, deserializeLayout } from '../ui/shared/layout/layoutDom';

describe('Designer layout and page-content focus', () => {
  it('selects the menu container and then its Section without escaping to the page root', () => {
    const root = document.createElement('div');
    root.className = 'layout-container';
    root.innerHTML = '<section class="layout-container layout-section"><aside class="layout-container"><div class="menu"></div></aside></section>';
    const menu = root.querySelector('.menu');
    const aside = parentLayoutContainer(menu, root);
    expect(aside?.tagName).toBe('ASIDE');
    const section = parentLayoutContainer(aside, root);
    expect(section?.tagName).toBe('SECTION');
    expect(parentLayoutContainer(section, root)).toBeNull();
    expect(parentLayoutContainer(document.createElement('div'), root)).toBeNull();
  });

  it('targets the selected nested Container rather than changing its entire Section', () => {
    const root = document.createElement('div');
    root.innerHTML = '<section class="layout-section" data-section-id="body"><div class="layout-container layout-container--active" data-node-id="article"></div></section><section class="layout-section" data-section-id="footer"></section>';
    expect(inspectorLayoutContainer(root, 'body')?.dataset.nodeId).toBe('article');
    expect(inspectorLayoutContainer(root, 'footer')?.dataset.sectionId).toBe('footer');
    expect(inspectorLayoutContainer(root, 'missing')).toBeNull();
  });
  it('dims only inactive branches and switches focus without changing the document', () => {
    const root = document.createElement('div');
    root.id = 'layoutRoot';
    document.body.append(root);
    deserializeLayout({ type: 'split', nodeId: 'body', children: [
      { type: 'leaf', nodeId: 'menu' },
      { type: 'leaf', nodeId: 'article', isDynamicHost: true }
    ] }, root);
    const before = serializeLayout(root);
    const select = jest.fn();
    const controller = bindEditingScope({ layoutRoot: root, onSelect: select });
    const article = root.querySelector('[data-node-id="article"]')!;
    const menu = root.querySelector('[data-node-id="menu"]')!;
    expect(root.dataset.editingScope).toBe('layout');
    const cover = article.querySelector('[data-designer-edit-overlay]')!;
    expect(menu.querySelector('[data-designer-edit-overlay]')).toBeNull();
    expect(firstSectionCapture(root).options.filter(cover)).toBe(false);
    cover.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(root.dataset.editingScope).toBe('content');
    expect(select).toHaveBeenCalledWith(article);
    expect(article.querySelector('[data-designer-edit-overlay]')).toBeNull();
    const layoutCover = menu.querySelector('[data-designer-edit-overlay]')!;
    expect(layoutCover).not.toBeNull();
    layoutCover.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(root.dataset.editingScope).toBe('layout');
    expect(serializeLayout(root)).toEqual(before);
    controller.destroy();
    root.remove();
  });

  it('does not invent a second scope for a design without a content outlet', () => {
    const root = document.createElement('div');
    root.innerHTML = '<section class="layout-container" data-workarea="true"></section>';
    const controller = bindEditingScope({ layoutRoot: root });
    expect(root.dataset.editingScope).toBe('design');
    expect(root.querySelector('[data-designer-edit-overlay]')).toBeNull();
    controller.destroy();
  });
});
