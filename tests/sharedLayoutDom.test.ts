/**
 * @jest-environment jsdom
 */

import {
  deleteContainer,
  deserializeLayout,
  duplicateContainer,
  activatePageSection,
  ensurePageSectionRoot,
  getPageSectionElement,
  ensureLayoutRootContainer,
  moveContainer,
  placeContainer,
  serializeLayout,
  renderLayoutTree,
  setContainerLayoutMode,
  setContainerSettings,
  setDefaultWorkarea,
  unlinkContainerStyleSource
} from '../ui/shared/layout/layoutDom';

describe('shared layout DOM adapter', () => {
  it('round-trips explicit height and sticky settings through the public renderer', () => {
    const root = document.createElement('div');
    deserializeLayout({ type: 'leaf', nodeId: 'aside', settings: { height: '240px', position: 'sticky' } }, root);
    const target = document.createElement('div');
    const aside = renderLayoutTree(serializeLayout(root), target).get('aside')!;
    expect(aside.style.getPropertyValue('--layout-height')).toBe('240px');
    expect(aside.dataset.layoutPosition).toBe('sticky');
    setContainerSettings(root, { height: 'auto', position: 'normal' });
    expect(root.style.getPropertyValue('--layout-height')).toBe('auto');
    expect(root.dataset.layoutPosition).toBe('normal');
  });
  it('keeps a right-only separator through Studio serialization and public rendering', () => {
    const root = document.createElement('div');
    deserializeLayout({ type: 'leaf', nodeId: 'aside' }, root);
    setContainerSettings(root, { borderWidth: '0px', borderRightWidth: '1px', borderStyle: 'solid', borderColor: '#123456' });
    expect(root.style.borderRightWidth).toBe('1px');
    expect(root.style.borderLeftWidth).toBe('0px');
    const target = document.createElement('div');
    const publicAside = renderLayoutTree(serializeLayout(root), target).get('aside')!;
    expect(publicAside.style.borderRightWidth).toBe('1px');
    expect(publicAside.style.borderTopWidth).toBe('0px');
    expect(publicAside.style.borderBottomWidth).toBe('0px');
    setContainerSettings(root, { borderRightWidth: '0px' });
    expect(root.style.borderRightWidth).toBe('0px');
  });

  it('preserves borders on the outer container through save, render and linked copies', () => {
    const root = document.createElement('div');
    deserializeLayout({ type: 'split', nodeId: 'root', children: [
      { type: 'leaf', nodeId: 'aside' },
      { type: 'leaf', nodeId: 'content', isDynamicHost: true }
    ] }, root);
    const aside = root.querySelector<HTMLElement>('[data-node-id="aside"]')!;
    setContainerSettings(aside, { borderWidth: '2px', borderStyle: 'solid', borderColor: '#123456', borderRadius: '8px' });
    expect(aside.style.borderWidth).toBe('2px');
    expect(root.querySelector<HTMLElement>('[data-node-id="content"]')!.style.borderWidth).toBe('');
    const saved = serializeLayout(root);
    const publicRoot = document.createElement('div');
    deserializeLayout(saved, publicRoot);
    const rendered = publicRoot.querySelector<HTMLElement>('[data-node-id="aside"]')!;
    expect(rendered.style.border).toBe(aside.style.border);
    expect(rendered.style.borderRadius).toBe('8px');
    const copy = duplicateContainer(aside, { linked: true });
    expect(copy?.style.borderWidth).toBe('2px');
    setContainerSettings(aside, { borderWidth: '0px', borderStyle: 'none' });
    expect(aside.style.borderStyle).toBe('none');
    expect(serializeLayout(root).children?.[0].settings?.borderWidth).toBe('0px');
  });

  function options() {
    let idx = 0;
    return {
      labels: {
        splitHint: 'Split here',
        workareaLabel: 'Workarea'
      },
      generateNodeId: () => `node-${++idx}`
    };
  }

  it('round-trips a container visual stack separately from editing layers', () => {
    const root = document.createElement('div');
    deserializeLayout({ type: 'split', nodeId: 'root', children: [
      { type: 'leaf', nodeId: 'imported-container', workarea: true, placement: { zIndex: 37 } }
    ] }, root, options());
    const container = root.querySelector<HTMLElement>('[data-node-id="imported-container"]')!;
    container.classList.add('layout-grid-container'); // Registered by the Studio's recursive grid registry.
    expect(container.dataset.layerOrder).toBe('37');
    expect(container.style.zIndex).toBe('37');
    expect(serializeLayout(root).children?.[0].placement?.zIndex).toBe(37);
  });

  it('round-trips split trees through DOM serialization', () => {
    const root = document.createElement('div');
    const layout = {
      type: 'split',
      orientation: 'vertical',
      nodeId: 'root',
      sizes: [2, 1],
      children: [
        { type: 'leaf', nodeId: 'static', designRef: 'hero-design' },
        { type: 'leaf', nodeId: 'work', workarea: true }
      ]
    };

    deserializeLayout(layout, root, options());

    expect(root.dataset.split).toBe('true');
    expect(root.children).toHaveLength(2);
    expect(serializeLayout(root)).toEqual(layout);
  });

  it('places, moves and deletes containers without designer-only helpers', () => {
    const host = document.createElement('section');
    const root = document.createElement('div');
    root.className = 'layout-container';
    root.dataset.nodeId = 'root';
    host.appendChild(root);
    const afterChange = jest.fn();

    placeContainer(root, 'right', { ...options(), onAfterChange: afterChange });

    const split = host.firstElementChild as HTMLElement;
    expect(split.dataset.split).toBe('true');
    expect(split.dataset.orientation).toBe('vertical');
    expect(split.children).toHaveLength(2);
    expect(afterChange).toHaveBeenCalled();

    const first = split.children[0] as HTMLElement;
    const second = split.children[1] as HTMLElement;
    moveContainer(second, first, 'left', options());
    expect(split.children[0]).toBe(second);

    deleteContainer(second);
    expect(host.firstElementChild).toBe(first);
    expect(first.classList.contains('layout-container')).toBe(true);
  });

  it('auto-places containers from the parent layout rule and preserves the workarea leaf', () => {
    const root = document.createElement('div');
    root.className = 'layout-container';
    root.dataset.nodeId = 'root';
    root.dataset.workarea = 'true';
    root.dataset.workareaLabel = 'Main';
    setContainerLayoutMode(root, 'stack');

    const grid = document.createElement('div');
    grid.id = 'workspaceMain';
    root.appendChild(grid);

    placeContainer(root, 'auto', options());

    expect(root.dataset.split).toBe('true');
    expect(root.dataset.orientation).toBe('horizontal');
    expect(root.dataset.layoutMode).toBe('stack');
    expect(root.children).toHaveLength(2);

    const firstLeaf = root.children[0] as HTMLElement;
    expect(firstLeaf.dataset.workarea).toBe('true');
    expect(firstLeaf.querySelector('#workspaceMain')).toBe(grid);
    expect(serializeLayout(root)).toMatchObject({
      type: 'split',
      orientation: 'horizontal',
      children: [
        { type: 'leaf', workarea: true },
        { type: 'leaf' }
      ]
    });
  });

  it('serializes shared container settings and switches split direction for row mode', () => {
    const root = document.createElement('div');
    deserializeLayout({
      type: 'split',
      orientation: 'horizontal',
      nodeId: 'root',
      settings: { mode: 'stack', gap: '16px', padding: '24px', background: '#f8fafc' },
      children: [
        { type: 'leaf', nodeId: 'a', workarea: true },
        { type: 'leaf', nodeId: 'b' }
      ]
    }, root, options());

    setContainerLayoutMode(root, 'row');
    setContainerSettings(root, { gap: '20px', padding: '12px' });

    expect(root.dataset.orientation).toBe('vertical');
    expect(root.style.flexDirection).toBe('row');
    expect(root.style.gap).toBe('20px');
    expect(root.style.padding).toBe('12px');
    expect(serializeLayout(root)).toMatchObject({
      type: 'split',
      orientation: 'vertical',
      settings: {
        mode: 'row',
        gap: '20px',
        padding: '12px',
        background: '#f8fafc'
      }
    });
  });

  it('keeps newly created and moved containers independent by default', () => {
    const root = document.createElement('div');
    root.className = 'layout-root layout-container';
    root.dataset.nodeId = 'root';

    placeContainer(root, 'auto', options());

    const first = root.children[0] as HTMLElement;
    const second = root.children[1] as HTMLElement;
    expect(first.dataset.styleSourceRole).toBeUndefined();
    expect(second.dataset.styleSourceRole).toBeUndefined();

    moveContainer(second, first, 'inside', options());

    expect(second.dataset.styleSourceRole).toBeUndefined();
    expect(second.dataset.styleSourceId).toBeUndefined();
  });

  it('creates independent and linked recursive container copies explicitly', () => {
    const root = document.createElement('div');
    root.className = 'layout-root layout-container';
    root.dataset.nodeId = 'root';
    document.body.appendChild(root);
    const layoutOptions = options();
    placeContainer(root, 'auto', layoutOptions);

    const source = root.children[0] as HTMLElement;
    placeContainer(source, 'inside', layoutOptions);
    const sourceChild = source.querySelector('.layout-container') as HTMLElement;
    setContainerSettings(sourceChild, { padding: '6px' });
    source.dataset.layoutGap = '22px';
    source.setAttribute('gs-w', '420');
    const independent = duplicateContainer(source, {
      ...layoutOptions,
      layoutRoot: root,
      linked: false
    }) as HTMLElement;
    const linked = duplicateContainer(source, {
      ...layoutOptions,
      layoutRoot: root,
      linked: true
    }) as HTMLElement;

    expect(independent.dataset.nodeId).not.toBe(source.dataset.nodeId);
    expect(independent.dataset.styleSourceId).toBeUndefined();
    expect(linked.dataset.styleSourceRole).toBe('follower');
    expect(linked.dataset.styleSourceId).toBe(source.dataset.nodeId);
    expect(linked.getAttribute('gs-w')).toBe('420');
    const linkedChild = linked.querySelector('.layout-container') as HTMLElement;
    expect(linkedChild.dataset.styleSourceRole).toBe('follower');
    expect(linkedChild.dataset.styleSourceId).toBe(sourceChild.dataset.nodeId);

    setContainerSettings(source, { gap: '30px', padding: '14px' });
    setContainerSettings(sourceChild, { padding: '18px' });

    expect(linked.style.gap).toBe('30px');
    expect(linked.style.padding).toBe('14px');
    expect(linkedChild.style.padding).toBe('18px');
    expect(independent.style.gap).not.toBe('30px');
  });

  it('can unlink a follower container from its style source', () => {
    const root = document.createElement('div');
    deserializeLayout({
      type: 'split',
      orientation: 'horizontal',
      nodeId: 'root',
      children: [
        {
          type: 'leaf',
          nodeId: 'leader',
          settings: { gap: '12px', padding: '8px' },
          styleSource: { enabled: true, role: 'source', syncLayout: true, syncDesign: true }
        },
        {
          type: 'leaf',
          nodeId: 'follower',
          styleSource: { enabled: true, role: 'follower', sourceId: 'leader', syncLayout: true, syncDesign: true }
        }
      ]
    }, root, options());

    const leader = root.children[0] as HTMLElement;
    const follower = root.children[1] as HTMLElement;
    expect(follower.style.padding).toBe('8px');

    unlinkContainerStyleSource(follower);
    setContainerSettings(leader, { padding: '24px' });

    expect(follower.dataset.styleSourceEnabled).toBeUndefined();
    expect(follower.dataset.styleSourceId).toBeUndefined();
    expect(follower.style.padding).toBe('8px');
  });

  it('can treat the root container itself as the default free workarea', () => {
    const root = document.createElement('div');
    root.className = 'layout-root';

    const container = ensureLayoutRootContainer(root, options()) as HTMLElement;
    setDefaultWorkarea(root, options());

    expect(container).toBe(root);
    expect(root.dataset.workarea).toBe('true');
    expect(root.dataset.layoutMode).toBe('free');
    expect(serializeLayout(root)).toMatchObject({
      type: 'leaf',
      workarea: true
    });
  });

  it('does not replace the Designer root when a root split collapses', () => {
    const shell = document.createElement('section');
    const root = document.createElement('div');
    root.className = 'layout-root layout-container';
    root.dataset.split = 'true';
    root.dataset.orientation = 'horizontal';
    shell.appendChild(root);

    const first = document.createElement('div');
    first.className = 'layout-container';
    const second = document.createElement('div');
    second.className = 'layout-container';
    root.append(first, second);

    deleteContainer(second);

    expect(shell.firstElementChild).toBe(root);
    expect(root.dataset.split).toBe('true');
    expect(root.children).toHaveLength(1);
  });

  it('migrates the legacy workarea into ordered canonical page Sections', () => {
    const root = document.createElement('div');
    root.className = 'layout-root layout-container builder-grid canvas-grid';
    root.dataset.nodeId = 'legacy-root';
    root.dataset.workarea = 'true';
    const workspace = document.createElement('div');
    workspace.id = 'workspaceMain';
    root.appendChild(workspace);

    ensurePageSectionRoot(root, [
      { id: 'hero', title: 'Hero' },
      {
        id: 'features',
        title: 'Features',
        background: '#f8fafc',
        backgroundImageUrl: '/media/features.jpg',
        backgroundImageId: 'features-image'
      }
    ], options());
    const active = activatePageSection(root, 'features');

    expect(root.classList.contains('layout-page-root')).toBe(true);
    expect(root.dataset.layoutMode).toBe('stack');
    expect(root.style.flexDirection).toBe('column');
    expect(getPageSectionElement(root, 'hero')?.querySelector('#workspaceMain')).toBe(workspace);
    expect(active?.dataset.nodeId).toBe('features');
    expect(active?.dataset.bgImageUrl).toBe('/media/features.jpg');
    expect(active?.style.backgroundImage).toContain('/media/features.jpg');
    expect(serializeLayout(root)).toMatchObject({
      type: 'split',
      orientation: 'horizontal',
      settings: { mode: 'stack' },
      children: [
        { nodeId: 'hero', section: { id: 'hero', title: 'Hero' } },
        {
          nodeId: 'features',
          workarea: true,
          section: {
            id: 'features',
            title: 'Features',
            background: '#f8fafc',
            backgroundImageUrl: '/media/features.jpg',
            backgroundImageId: 'features-image'
          }
        }
      ]
    });
  });

  it('adds a nested Container without wrapping or replacing its canonical Section workarea', () => {
    const root = document.createElement('div');
    root.className = 'layout-root layout-container builder-grid canvas-grid';
    const workspace = document.createElement('div');
    workspace.id = 'workspaceMain';
    root.appendChild(workspace);

    ensurePageSectionRoot(root, [{ id: 'hero', title: 'Hero' }], options());
    const section = getPageSectionElement(root, 'hero') as HTMLElement;
    activatePageSection(root, 'hero');

    placeContainer(section, 'auto', { ...options(), layoutRoot: root });

    expect(section.dataset.split).toBe('true');
    expect(section.querySelector(':scope > #workspaceMain')).toBe(workspace);
    expect(section.querySelectorAll(':scope > .layout-container')).toHaveLength(1);
    expect(section.dataset.workarea).toBe('true');

    setContainerLayoutMode(section, 'free');
    expect(section.dataset.layoutMode).toBe('free');
  });

  it('keeps DOM mutations when the after-change callback fails', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const root = document.createElement('div');
    root.className = 'layout-container';
    root.dataset.nodeId = 'root';

    try {
      expect(() => {
        placeContainer(root, 'auto', {
          ...options(),
          layoutRoot: root,
          onAfterChange: () => {
            throw new Error('callback failed');
          }
        });
      }).not.toThrow();

      expect(root.dataset.split).toBe('true');
      expect(root.children).toHaveLength(2);
      expect(warnSpy).toHaveBeenCalledWith(
        '[LayoutDom] LAYOUT_CONTAINER_AFTER_CHANGE_FAILED',
        expect.objectContaining({ nodeId: 'root' }),
        expect.any(Error)
      );
    } finally {
      warnSpy.mockRestore();
    }
  });
});
