/** @jest-environment jsdom */

import { renderLayoutTreeSidebar } from '../ui/designer/app/renderer/layoutTreeView';

function dragEvent(type: string) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    dataTransfer?: Record<string, unknown>;
  };
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: jest.fn()
    }
  });
  return event;
}

describe('Design Studio recursive Layout tree', () => {
  it('shows Sections and nested Containers with their local modes', () => {
    const panel = document.createElement('aside');
    panel.innerHTML = '<div class="layout-tree"></div>';
    const root = document.createElement('main');
    root.className = 'layout-container layout-page-root';
    const hero = document.createElement('section');
    hero.className = 'layout-container layout-section';
    hero.dataset.nodeId = 'hero';
    hero.dataset.sectionId = 'hero';
    hero.dataset.sectionTitle = 'Hero';
    hero.dataset.layoutMode = 'free';
    const cards = document.createElement('div');
    cards.className = 'layout-container layout-grid-container';
    cards.dataset.nodeId = 'cards';
    cards.dataset.layoutMode = 'grid';
    hero.appendChild(cards);
    root.appendChild(hero);

    renderLayoutTreeSidebar(panel, root, jest.fn(), jest.fn());

    expect(panel.querySelector('[data-node-id="hero"] .layout-tree-title')?.textContent).toBe('Hero');
    expect(panel.querySelector('[data-node-id="hero"] .layout-tree-mode')?.textContent).toBe('Free');
    expect(panel.querySelector('[data-node-id="cards"] .layout-tree-mode')?.textContent).toBe('Grid');
    expect((panel.querySelector('[data-node-id="hero"]') as HTMLElement).draggable).toBe(false);
    expect((panel.querySelector('[data-node-id="cards"]') as HTMLElement).draggable).toBe(true);
  });

  it('reparents a Container only through an explicit tree drop', () => {
    const panel = document.createElement('aside');
    panel.innerHTML = '<div class="layout-tree"></div>';
    const root = document.createElement('main');
    root.className = 'layout-container layout-page-root';
    const hero = document.createElement('section');
    hero.className = 'layout-container layout-section';
    hero.dataset.nodeId = 'hero';
    hero.dataset.sectionId = 'hero';
    const cards = document.createElement('div');
    cards.className = 'layout-container layout-grid-container';
    cards.dataset.nodeId = 'cards';
    hero.appendChild(cards);
    const features = document.createElement('section');
    features.className = 'layout-container layout-section';
    features.dataset.nodeId = 'features';
    features.dataset.sectionId = 'features';
    root.append(hero, features);
    const onMove = jest.fn();

    renderLayoutTreeSidebar(panel, root, jest.fn(), onMove);
    panel.querySelector('[data-node-id="cards"]')!.dispatchEvent(dragEvent('dragstart'));
    panel.querySelector('[data-node-id="features"]')!.dispatchEvent(dragEvent('dragover'));
    panel.querySelector('[data-node-id="features"]')!.dispatchEvent(dragEvent('drop'));

    expect(onMove).toHaveBeenCalledWith(cards, features, 'inside');
  });
});
