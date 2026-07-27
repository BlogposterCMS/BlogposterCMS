/** @jest-environment jsdom */

import { createLayoutGridRegistry } from '../ui/designer/app/managers/layoutGridRegistry';

function section(id: string, title = id) {
  const element = document.createElement('section');
  element.className = 'layout-container layout-section';
  element.dataset.sectionId = id;
  element.dataset.nodeId = id;
  element.dataset.sectionTitle = title;
  return element;
}

function container(id: string) {
  const element = document.createElement('div');
  element.className = 'layout-container';
  element.dataset.nodeId = id;
  return element;
}

describe('Design Studio recursive layout grid registry', () => {
  it('uses each Section and nested Container as one persistent CanvasGrid surface', () => {
    const root = document.createElement('main');
    const hero = section('hero', 'Hero');
    const group = container('hero-group');
    const nested = container('hero-nested');
    group.appendChild(nested);
    hero.appendChild(group);
    const features = section('features', 'Features');
    const legacyWorkspace = document.createElement('div');
    legacyWorkspace.id = 'workspaceMain';
    const legacyWidget = document.createElement('article');
    legacyWidget.className = 'canvas-item';
    legacyWidget.dataset.widgetId = 'textBox';
    legacyWorkspace.appendChild(legacyWidget);
    hero.appendChild(legacyWorkspace);
    root.append(hero, features);

    const createGrid = jest.fn(surface => ({
      el: surface,
      makeWidget: jest.fn(),
      removeWidget: jest.fn()
    }));
    const registry = createLayoutGridRegistry({
      layoutRoot: root,
      legacyWorkspace,
      createGrid
    });

    const firstSync = registry.sync();
    const secondSync = registry.sync();

    expect(firstSync.map(record => record.surfaceId)).toEqual([
      'hero',
      'hero-group',
      'hero-nested',
      'features'
    ]);
    expect(secondSync.map(record => record.surface)).toEqual(
      firstSync.map(record => record.surface)
    );
    expect(createGrid).toHaveBeenCalledTimes(4);
    expect(hero.classList.contains('layout-grid-surface')).toBe(true);
    expect(group.classList.contains('layout-grid-surface')).toBe(true);
    expect(group.classList.contains('canvas-item')).toBe(true);
    expect(nested.classList.contains('canvas-item')).toBe(true);
    expect(hero.contains(legacyWidget)).toBe(true);
    expect(legacyWorkspace.isConnected).toBe(false);
  });

  it('partitions widgets across Section and nested Container surface ids', () => {
    const root = document.createElement('main');
    const hero = section('hero');
    hero.appendChild(container('hero-group'));
    root.append(hero, section('features'));
    const registry = createLayoutGridRegistry({
      layoutRoot: root,
      createGrid: surface => ({
        el: surface,
        makeWidget: jest.fn(),
        removeWidget: jest.fn()
      })
    });
    registry.sync();

    const { groups, unassigned } = registry.partition([
      { id: 'hero-title', workareaId: 'hero', code: { meta: {} } },
      { id: 'nested-copy', workareaId: 'hero-group', code: { meta: {} } },
      { id: 'legacy-copy', code: { meta: {} } }
    ], 'hero');

    expect(unassigned).toEqual([]);
    expect(groups.get('hero')?.map(item => item.id)).toEqual(['hero-title', 'legacy-copy']);
    expect(groups.get('hero-group')?.map(item => item.id)).toEqual(['nested-copy']);
    expect(groups.get('hero-group')?.[0].code.meta).toMatchObject({
      workareaId: 'hero-group'
    });
  });

  it('unregisters and re-registers a Container when its parent grid changes', () => {
    const root = document.createElement('main');
    const hero = section('hero');
    const group = container('hero-group');
    hero.appendChild(group);
    const features = section('features');
    root.append(hero, features);
    const grids = new Map<HTMLElement, {
      makeWidget: jest.Mock;
      unregisterWidget: jest.Mock;
      removeWidget: jest.Mock;
    }>();
    const registry = createLayoutGridRegistry({
      layoutRoot: root,
      createGrid: surface => {
        const grid = {
          makeWidget: jest.fn(),
          unregisterWidget: jest.fn(),
          removeWidget: jest.fn()
        };
        grids.set(surface, grid);
        return grid;
      }
    });
    registry.sync();

    features.appendChild(group);
    registry.sync();

    expect(grids.get(hero)?.unregisterWidget).toHaveBeenCalledWith(group, { silent: true });
    expect(grids.get(features)?.makeWidget).toHaveBeenCalledWith(group, { silent: true });
    expect(group.dataset.parentGridRegistered).toBe('features');
  });
});
