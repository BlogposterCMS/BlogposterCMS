/**
 * @jest-environment jsdom
 */

import { init as initCanvasGrid } from '../ui/runtime/main/canvasGrid';
import {
  fetchRuntimeDesign,
  fetchRuntimePageById,
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
    (fetchRuntimePageById as jest.Mock).mockResolvedValue(null);
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
    expect(contentEl.querySelector('[data-node-id="main-workarea"].canvas-grid')).not.toBeNull();
    expect(contentEl.querySelector<HTMLElement>('.canvas-item')?.dataset.widgetId).toBe('hero');
    expect(renderRuntimeCanvasWidget).toHaveBeenCalledWith(expect.objectContaining({
      lane: 'public',
      emit
    }));
  });

  it('renders placements into their canonical Section node ids', async () => {
    const contentEl = document.createElement('main');
    const emit = jest.fn().mockResolvedValue(undefined);
    (fetchRuntimeDesign as jest.Mock).mockResolvedValue({
      design: {
        layout: {
          type: 'split',
          orientation: 'horizontal',
          nodeId: 'page-root',
          settings: { mode: 'stack', background: 'transparent' },
          children: [
            {
              type: 'leaf',
              nodeId: 'hero',
              section: { id: 'hero', title: 'Hero' },
              settings: { minHeight: '320px', background: 'transparent' }
            },
            {
              type: 'leaf',
              nodeId: 'features',
              section: { id: 'features', title: 'Features' },
              settings: { mode: 'grid', columns: 3, background: '#f8fafc' }
            }
          ]
        }
      },
      widgets: [
        {
          instance_id: 'hero-1',
          widget_id: 'hero',
          workarea_id: 'hero',
          x_percent: 0,
          y_percent: 0,
          w_percent: 100,
          h_percent: 40
        },
        {
          instance_id: 'feature-1',
          widget_id: 'feature',
          metadata: JSON.stringify({ workareaId: 'features', sceneId: 'features' }),
          x_percent: 0,
          y_percent: 0,
          w_percent: 33,
          h_percent: 20
        }
      ]
    });

    await renderPublicRuntimePageContent({
      page: { id: 'page-1', meta: { designId: 'design-1' } },
      contentEl,
      globalLayout: [],
      allWidgets: [{ id: 'hero' }, { id: 'feature' }],
      lane: 'public',
      emit,
      widgetEmit: emit
    });

    expect(contentEl.querySelector('[data-node-id="hero"] .canvas-item[data-widget-id="hero"]')).not.toBeNull();
    expect(contentEl.querySelector('[data-node-id="features"] .canvas-item[data-widget-id="feature"]')).not.toBeNull();
    expect(contentEl.querySelector<HTMLElement>('[data-node-id="features"]')?.dataset.layoutMode).toBe('grid');
  });

  it('renders a nested Container as both a parent-grid item and its own grid host', async () => {
    const contentEl = document.createElement('main');
    const emit = jest.fn().mockResolvedValue(undefined);
    (fetchRuntimeDesign as jest.Mock).mockResolvedValue({
      design: {
        layout: {
          type: 'split',
          orientation: 'horizontal',
          nodeId: 'page-root',
          settings: { mode: 'stack' },
          children: [{
            type: 'split',
            orientation: 'horizontal',
            nodeId: 'hero',
            section: { id: 'hero', title: 'Hero' },
            settings: { mode: 'free', minHeight: '480px' },
            children: [{
              type: 'leaf',
              nodeId: 'cards',
              settings: { mode: 'grid', columns: 3, minHeight: '240px' },
              placement: { x: 80, y: 120, w: 720, h: 240 }
            }]
          }]
        }
      },
      widgets: [
        {
          instance_id: 'hero-title',
          widget_id: 'hero',
          workarea_id: 'hero',
          x: 40,
          y: 24,
          w: 480,
          h: 72
        },
        {
          instance_id: 'card-1',
          widget_id: 'feature',
          workarea_id: 'cards',
          x_percent: 0,
          y_percent: 0,
          w_percent: 33,
          h_percent: 100
        }
      ]
    });

    await renderPublicRuntimePageContent({
      page: { id: 'page-1', meta: { designId: 'design-1' } },
      contentEl,
      globalLayout: [],
      allWidgets: [{ id: 'hero' }, { id: 'feature' }],
      lane: 'public',
      emit,
      widgetEmit: emit
    });

    const cards = contentEl.querySelector<HTMLElement>('[data-node-id="cards"]');
    expect(cards?.classList.contains('runtime-layout-grid-item')).toBe(true);
    expect(cards?.classList.contains('canvas-grid')).toBe(true);
    expect(cards?.dataset.x).toBe('80');
    expect(cards?.getAttribute('gs-w')).toBe('720');
    expect(cards?.querySelector('.canvas-item[data-widget-id="feature"]')).not.toBeNull();
    expect(contentEl.querySelector('[data-node-id="hero"] > .canvas-item[data-widget-id="hero"]')).not.toBeNull();
  });

  it('inherits the nearest parent design and keeps child page html visible', async () => {
    const contentEl = document.createElement('main');
    const emit = jest.fn().mockResolvedValue(undefined);
    (fetchRuntimePageById as jest.Mock).mockResolvedValueOnce({
      id: 'collection',
      parentId: null,
      meta: { designId: 'collection-design' }
    });
    (fetchRuntimeDesign as jest.Mock).mockResolvedValue({
      design: {
        bg_color: '#ffffff',
        layout: {
          type: 'leaf',
          nodeId: 'collection-workarea',
          workarea: true
        }
      },
      widgets: []
    });

    await renderPublicRuntimePageContent({
      page: {
        id: 'child-page',
        parentId: 'collection',
        html: '<article><h1>Nivea</h1><script>bad()</script></article>',
        meta: {}
      },
      contentEl,
      globalLayout: [],
      allWidgets: [],
      lane: 'public',
      emit,
      widgetEmit: emit
    });

    expect(fetchRuntimePageById).toHaveBeenCalledWith(emit, 'collection', 'public');
    expect(fetchRuntimeDesign).toHaveBeenCalledWith(emit, 'collection-design', 'public');
    const workarea = contentEl.querySelector('[data-node-id="collection-workarea"]');
    expect(workarea?.innerHTML).toContain('<h1>Nivea</h1>');
    expect(workarea?.innerHTML).not.toContain('<script>');
  });
});
