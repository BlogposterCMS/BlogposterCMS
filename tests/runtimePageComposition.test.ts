/**
 * @jest-environment jsdom
 */

import { init as initCanvasGrid } from '../ui/runtime/main/canvasGrid';
import {
  fetchRuntimeDesign,
  loadRuntimeLayoutForViewport
} from '../ui/runtime/main/runtimePageData';
import { renderAttachedRuntimeContent } from '../ui/runtime/main/runtimeAttachedContent';
import { renderPublicRuntimePageContent } from '../ui/runtime/main/runtimePageComposition';
import { renderRuntimeCanvasWidget } from '../ui/runtime/main/runtimeWidgetMounting';

jest.mock('../ui/runtime/main/canvasGrid', () => ({
  init: jest.fn()
}));

jest.mock('../ui/runtime/main/runtimeWidgetMounting', () => ({
  renderRuntimeCanvasWidget: jest.fn()
}));

jest.mock('../ui/runtime/main/runtimeAttachedContent', () => ({
  renderAttachedRuntimeContent: jest.fn()
}));

jest.mock('../ui/runtime/main/runtimePageData', () => ({
  fetchRuntimeChildPages: jest.fn(),
  fetchRuntimeDesign: jest.fn(),
  fetchRuntimePageById: jest.fn(),
  loadRuntimeLayoutForViewport: jest.fn(),
  loadRuntimeLayoutTemplate: jest.fn()
}));

describe('runtimePageComposition', () => {
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
    (renderAttachedRuntimeContent as jest.Mock).mockResolvedValue(undefined);
    (loadRuntimeLayoutForViewport as jest.Mock).mockResolvedValue([]);
    (fetchRuntimeDesign as jest.Mock).mockResolvedValue(null);
  });

  it('renders public fallback widget grids from page metadata widgets', async () => {
    const contentEl = document.createElement('main');
    const header = document.createElement('div');
    header.id = 'content-header';
    contentEl.appendChild(header);
    const emit = jest.fn().mockResolvedValue(undefined);

    await renderPublicRuntimePageContent({
      page: { id: 'page-1', meta: { widgets: ['hero'] } },
      contentEl,
      globalLayout: [],
      allWidgets: [{ id: 'hero' }],
      lane: 'public',
      emit,
      widgetEmit: emit
    });

    expect(contentEl.firstElementChild).toBe(header);
    expect(loadRuntimeLayoutForViewport).toHaveBeenCalledWith(emit, 'page-1', 'public');
    expect(contentEl.querySelector('#publicGrid')).not.toBeNull();
    expect(contentEl.querySelector<HTMLElement>('.canvas-item')?.dataset.widgetId).toBe('hero');
    expect(renderRuntimeCanvasWidget).toHaveBeenCalledWith(expect.objectContaining({
      lane: 'public',
      emit
    }));
    expect(renderAttachedRuntimeContent).toHaveBeenCalledWith(expect.objectContaining({
      page: { id: 'page-1', meta: { widgets: ['hero'] } },
      lane: 'public',
      container: contentEl,
      emit
    }));
  });

  it('renders design documents through their saved layout tree', async () => {
    const contentEl = document.createElement('main');
    const emit = jest.fn().mockResolvedValue(undefined);
    (fetchRuntimeDesign as jest.Mock).mockResolvedValue({
      design: {
        bg_color: '#ffffff',
        layout: {
          type: 'leaf',
          nodeId: 'main-workarea',
          workarea: true
        }
      },
      widgets: [
        {
          instance_id: 'hero-1',
          widget_id: 'hero',
          x_percent: 0,
          y_percent: 0,
          w_percent: 100,
          h_percent: 40
        }
      ]
    });

    await renderPublicRuntimePageContent({
      page: { id: 'page-1', meta: { designId: 'design-1' } },
      contentEl,
      globalLayout: [],
      allWidgets: [{ id: 'hero' }],
      lane: 'public',
      emit,
      widgetEmit: emit
    });

    expect(fetchRuntimeDesign).toHaveBeenCalledWith(emit, 'design-1', 'public');
    expect(contentEl.querySelector('.runtime-design-document')).not.toBeNull();
    expect(contentEl.querySelector('[data-node-id="main-workarea"] .canvas-grid')).not.toBeNull();
    expect(contentEl.querySelector<HTMLElement>('.canvas-item')?.dataset.widgetId).toBe('hero');
    expect(renderRuntimeCanvasWidget).toHaveBeenCalledWith(expect.objectContaining({
      lane: 'public',
      emit
    }));
  });
});
