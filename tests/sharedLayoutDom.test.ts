/**
 * @jest-environment jsdom
 */

import {
  deleteContainer,
  deserializeLayout,
  ensureLayoutRootContainer,
  moveContainer,
  placeContainer,
  serializeLayout,
  setContainerLayoutMode,
  setContainerSettings,
  setDefaultWorkarea,
  toggleContainerStyleSource
} from '../ui/shared/layout/layoutDom';

describe('shared layout DOM adapter', () => {
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

  it('links new containers to the first style source while keeping content independent', () => {
    const root = document.createElement('div');
    root.className = 'layout-root layout-container';
    root.dataset.nodeId = 'root';

    placeContainer(root, 'auto', options());

    const first = root.children[0] as HTMLElement;
    const second = root.children[1] as HTMLElement;
    first.appendChild(document.createElement('strong')).textContent = 'Leader content';
    second.appendChild(document.createElement('em')).textContent = 'Follower content';

    expect(first.dataset.styleSourceRole).toBe('source');
    expect(second.dataset.styleSourceRole).toBe('follower');
    expect(second.dataset.styleSourceId).toBe(first.dataset.nodeId);

    setContainerSettings(first, { gap: '22px', padding: '14px', background: '#ffffff' });

    expect(second.style.gap).toBe('22px');
    expect(second.style.padding).toBe('14px');
    expect(second.dataset.layoutBackground).toBe('#ffffff');
    expect(first.textContent).toBe('Leader content');
    expect(second.textContent).toBe('Follower content');
    expect(serializeLayout(root)).toMatchObject({
      children: [
        { styleSource: { enabled: true, role: 'source' } },
        { styleSource: { enabled: true, role: 'follower', sourceId: first.dataset.nodeId } }
      ]
    });
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

    toggleContainerStyleSource(root, follower);
    setContainerSettings(leader, { padding: '24px' });

    expect(follower.dataset.styleSourceEnabled).toBe('false');
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
