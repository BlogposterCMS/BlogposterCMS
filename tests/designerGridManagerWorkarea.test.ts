/**
 * @jest-environment jsdom
 */

jest.mock('/ui/runtime/main/canvasGrid.js', () => ({
  init: jest.fn()
}));

import { getCurrentLayout } from '../ui/designer/app/managers/gridManager';

describe('designer grid manager workarea serialization', () => {
  it('persists the nearest layout container id on widget placements', () => {
    const workarea = document.createElement('section');
    workarea.className = 'layout-container';
    workarea.dataset.nodeId = 'hero-workarea';

    const grid = document.createElement('div');
    const widget = document.createElement('div');
    widget.className = 'canvas-item';
    widget.dataset.instanceId = 'w1';
    widget.dataset.widgetId = 'textBox';
    widget.dataset.xPercent = '10';
    widget.dataset.yPercent = '20';
    widget.dataset.wPercent = '30';
    widget.dataset.hPercent = '40';
    grid.appendChild(widget);
    workarea.appendChild(grid);
    document.body.appendChild(workarea);

    expect(getCurrentLayout(grid, {})[0]).toMatchObject({
      id: 'w1',
      widgetId: 'textBox',
      workareaId: 'hero-workarea',
      code: {
        meta: {
          workareaId: 'hero-workarea'
        }
      }
    });
  });
});
