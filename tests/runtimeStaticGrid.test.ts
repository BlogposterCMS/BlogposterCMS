/**
 * @jest-environment jsdom
 */

import { init as initCanvasGrid } from '../ui/runtime/main/canvasGrid';
import { renderStaticRuntimeGrid } from '../ui/runtime/main/runtimeStaticGrid';
import { renderRuntimeCanvasWidget } from '../ui/runtime/main/runtimeWidgetMounting';

jest.mock('../ui/runtime/main/canvasGrid', () => ({
  init: jest.fn()
}));

jest.mock('../ui/runtime/main/runtimeWidgetMounting', () => ({
  renderRuntimeCanvasWidget: jest.fn()
}));

describe('runtimeStaticGrid', () => {
  function createGrid() {
    return {
      options: {},
      widgets: [],
      makeWidget: jest.fn(function makeWidget(el: HTMLElement) {
        this.widgets.push(el);
      }),
      update: jest.fn()
    };
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    (initCanvasGrid as jest.Mock).mockImplementation(() => createGrid());
    (renderRuntimeCanvasWidget as jest.Mock).mockResolvedValue(undefined);
  });

  it('renders static runtime grids with projected layout metadata', async () => {
    const target = document.createElement('section');
    const gridEl = document.createElement('div');
    target.appendChild(gridEl);
    const grid = createGrid();
    Object.defineProperty(gridEl, 'clientWidth', { value: 200, configurable: true });
    gridEl.getBoundingClientRect = jest.fn(() => ({
      width: 200,
      height: 0,
      top: 0,
      right: 200,
      bottom: 0,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => ({})
    }));
    const widgetEmit = jest.fn().mockResolvedValue(undefined);

    const result = await renderStaticRuntimeGrid(
      target,
      [
        {
          id: 'hero-1',
          widgetId: 'hero',
          xPercent: 10,
          yPercent: 20,
          wPercent: 30,
          hPercent: 40
        }
      ],
      [{ id: 'hero', metadata: { label: 'Hero' } }],
      'public',
      {
        append: true,
        gridEl,
        grid,
        widgetEmit
      }
    );

    expect(result.gridEl).toBe(gridEl);
    expect(result.grid?.options).toMatchObject({
      columnWidth: 1,
      cellHeight: 1,
      columns: Infinity,
      rows: Infinity
    });
    expect(result.gridEl?.style.height).toBe('200px');
    const wrapper = target.querySelector<HTMLElement>('.canvas-item');
    expect(wrapper?.dataset.x).toBe('20');
    expect(wrapper?.dataset.y).toBe('40');
    expect(wrapper?.getAttribute('gs-w')).toBe('60');
    expect(wrapper?.getAttribute('gs-h')).toBe('80');
    expect(wrapper?.dataset.xPercent).toBe('10');
    expect(renderRuntimeCanvasWidget).toHaveBeenCalledWith(expect.objectContaining({
      wrapper,
      emit: widgetEmit,
      lane: 'public'
    }));
  });

});
