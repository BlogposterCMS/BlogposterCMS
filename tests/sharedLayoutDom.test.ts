/**
 * @jest-environment jsdom
 */

import {
  deleteContainer,
  deserializeLayout,
  moveContainer,
  placeContainer,
  serializeLayout
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
});
