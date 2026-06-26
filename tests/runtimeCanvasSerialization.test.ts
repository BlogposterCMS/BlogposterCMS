/**
 * @jest-environment jsdom
 */

import {
  serializeRuntimeCanvasItem,
  serializeRuntimeCanvasLayout
} from '../ui/runtime/main/runtimeCanvasSerialization';

describe('runtimeCanvasSerialization', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('serializes canvas items with scene metadata and merged widget code', () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-item';
    wrapper.dataset.instanceId = 'hero-1';
    wrapper.dataset.widgetId = 'hero';
    wrapper.dataset.x = '2';
    wrapper.dataset.y = '3';
    wrapper.dataset.behavior = 'pinned';
    wrapper.dataset.sceneTitle = 'Dataset title';
    wrapper.setAttribute('gs-w', '4');
    wrapper.setAttribute('gs-h', '5');

    const serialized = serializeRuntimeCanvasItem(wrapper, {
      code: { html: '<p>Hello</p>' },
      sceneId: 'meta-scene',
      opacity: '75',
      effects: '[{"id":"fadeIn"}]'
    });

    expect(serialized).toMatchObject({
      id: 'hero-1',
      widgetId: 'hero',
      x: 2,
      y: 3,
      w: 4,
      h: 5,
      behavior: 'pinned',
      sceneId: 'meta-scene',
      sceneTitle: 'Dataset title',
      opacity: '75',
      effects: [{ id: 'fadeIn' }]
    });
    expect(serialized.code).toEqual({
      html: '<p>Hello</p>',
      meta: {
        behavior: 'pinned',
        sceneId: 'meta-scene',
        sceneTitle: 'Dataset title',
        opacity: '75',
        effects: [{ id: 'fadeIn' }]
      }
    });
  });

  it('serializes canvas layouts through a metadata resolver', () => {
    const gridEl = document.createElement('div');
    const first = document.createElement('div');
    first.className = 'canvas-item';
    first.dataset.instanceId = 'first';
    first.dataset.widgetId = 'text';
    first.dataset.x = '1';
    first.dataset.y = '2';
    first.setAttribute('gs-w', '3');
    first.setAttribute('gs-h', '4');
    const second = document.createElement('div');
    second.className = 'canvas-item';
    second.dataset.instanceId = 'second';
    second.dataset.widgetId = 'image';
    second.dataset.x = '5';
    second.dataset.y = '6';
    second.setAttribute('gs-w', '7');
    second.setAttribute('gs-h', '8');
    gridEl.append(first, second);

    const resolveMeta = jest.fn((instanceId: string) => (
      instanceId === 'second' ? { sceneTitle: 'Second' } : {}
    ));

    expect(serializeRuntimeCanvasLayout(gridEl, resolveMeta)).toEqual([
      {
        id: 'first',
        widgetId: 'text',
        x: 1,
        y: 2,
        w: 3,
        h: 4,
        code: null
      },
      {
        id: 'second',
        widgetId: 'image',
        x: 5,
        y: 6,
        w: 7,
        h: 8,
        sceneTitle: 'Second',
        code: null
      }
    ]);
    expect(resolveMeta).toHaveBeenCalledWith('first', first);
    expect(resolveMeta).toHaveBeenCalledWith('second', second);
  });
});
