/**
 * @jest-environment jsdom
 */

import {
  loadRuntimeLayoutForViewport,
  saveRuntimeLayoutForViewport
} from '../ui/runtime/main/runtimePageData';
import { renderAttachedRuntimeContent } from '../ui/runtime/main/runtimeAttachedContent';
import { renderAdminRuntimeGrid } from '../ui/runtime/main/runtimeAdminGrid';
import { renderRuntimeCanvasWidget } from '../ui/runtime/main/runtimeWidgetMounting';
import { attachAdminDashboardControls } from '../ui/runtime/main/widgetRuntimeGateway';

jest.mock('../ui/runtime/main/runtimePageData', () => ({
  loadRuntimeLayoutForViewport: jest.fn(),
  saveRuntimeLayoutForViewport: jest.fn()
}));

jest.mock('../ui/runtime/main/runtimeAttachedContent', () => ({
  renderAttachedRuntimeContent: jest.fn()
}));

jest.mock('../ui/runtime/main/runtimeWidgetMounting', () => ({
  renderRuntimeCanvasWidget: jest.fn()
}));

jest.mock('../ui/runtime/main/widgetRuntimeGateway', () => ({
  attachAdminDashboardControls: jest.fn()
}));

const HERO_WIDGET = {
  id: 'hero',
  metadata: {
    layout: {
      defaultSlot: 'half',
      supportedSlots: [
        { name: 'half', minCols: 6, maxCols: 6 },
        { name: 'full', minCols: 12, maxCols: 12 }
      ],
      breakpoints: {
        mobile: ['full'],
        tablet: ['half', 'full'],
        desktop: ['half', 'full']
      }
    }
  }
};

describe('runtimeAdminGrid', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    jest.clearAllMocks();
    delete window.adminGrid;
    delete window.adminCurrentLayout;
    delete window.adminPageContext;
    delete window.addDashboardWidget;
    delete window.saveAdminLayout;
    delete window.availableWidgets;
    window.requestAnimationFrame = callback => {
      callback(0);
      return 1;
    };
    (loadRuntimeLayoutForViewport as jest.Mock).mockResolvedValue([
      {
        id: 'hero-1',
        widgetId: 'hero',
        slot: 'half',
        order: 20,
        code: { html: '<p>Hero</p>' }
      }
    ]);
    (saveRuntimeLayoutForViewport as jest.Mock).mockResolvedValue(undefined);
    (renderRuntimeCanvasWidget as jest.Mock).mockResolvedValue(undefined);
    (renderAttachedRuntimeContent as jest.Mock).mockResolvedValue(undefined);
  });

  it('sets up the dashboard flow grid, globals, mounted widgets, and attached content', async () => {
    const contentEl = document.createElement('main');
    const contentHeader = document.createElement('div');
    contentHeader.id = 'content-header';
    contentEl.append(contentHeader, document.createElement('p'));
    const emit = jest.fn().mockResolvedValue(undefined);

    const result = await renderAdminRuntimeGrid({
      page: { id: 'page-1' },
      contentEl,
      globalLayout: [{ id: 'global-1', widgetId: 'global', slot: 'full', order: 0 }],
      allWidgets: [HERO_WIDGET, { id: 'global' }],
      lane: 'admin',
      emit,
      widgetEmit: emit
    });

    expect(loadRuntimeLayoutForViewport).toHaveBeenCalledWith(emit, 'page-1', 'admin');
    expect(contentEl.firstElementChild).toBe(contentHeader);
    expect(result.gridEl.id).toBe('adminGrid');
    expect(result.gridEl.classList.contains('dashboard-grid')).toBe(true);
    expect(result.gridEl.style.getPropertyValue('--dashboard-columns')).toBe('12');
    expect(result.grid.options.columns).toBe(12);
    expect(document.body.classList.contains('grid-mode')).toBe(true);
    expect(document.body.classList.contains('dashboard-flow-mode')).toBe(true);
    expect(window.adminGrid).toBe(result.grid);
    expect(window.adminPageContext).toEqual({ pageId: 'page-1', lane: 'admin' });
    expect(window.adminCurrentLayout).toEqual(result.layout);

    const hero = result.gridEl.querySelector<HTMLElement>('[data-instance-id="hero-1"]');
    expect(hero?.dataset.widgetId).toBe('hero');
    expect(hero?.dataset.dashboardSlot).toBe('half');
    expect(hero?.dataset.dashboardColumns).toBe('6');
    expect(hero?.dataset.x).toBeUndefined();
    expect(hero?.getAttribute('gs-w')).toBeNull();
    expect(renderRuntimeCanvasWidget).toHaveBeenCalledWith(expect.objectContaining({
      wrapper: hero,
      lane: 'admin',
      emit,
      afterRender: attachAdminDashboardControls
    }));
    expect(renderAttachedRuntimeContent).toHaveBeenCalledWith(expect.objectContaining({
      page: { id: 'page-1' },
      lane: 'admin',
      container: contentEl,
      emit
    }));
  });

  it('adds dropped widgets through the dashboard flow add hook while edit mode is active', async () => {
    const contentEl = document.createElement('main');
    const emit = jest.fn().mockResolvedValue(undefined);
    const result = await renderAdminRuntimeGrid({
      page: { id: 'page-1' },
      contentEl,
      allWidgets: [HERO_WIDGET],
      lane: 'admin',
      emit,
      widgetEmit: emit
    });
    document.body.classList.add('dashboard-edit-mode');
    window.availableWidgets = [{ id: 'stats' }];
    window.addDashboardWidget = jest.fn();

    const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        getData: (type: string) => (type === 'text/plain' ? 'stats' : '')
      }
    });
    result.gridEl.dispatchEvent(event);

    expect(window.addDashboardWidget).toHaveBeenCalledWith({ id: 'stats' });
  });

  it('serializes dashboard slot changes and saves the latest layout', async () => {
    const contentEl = document.createElement('main');
    const emit = jest.fn().mockResolvedValue(undefined);
    const result = await renderAdminRuntimeGrid({
      page: { id: 'page-1' },
      contentEl,
      allWidgets: [HERO_WIDGET],
      lane: 'admin',
      emit,
      widgetEmit: emit
    });
    const hero = result.gridEl.querySelector<HTMLElement>('[data-instance-id="hero-1"]');

    result.grid.updateSlot(hero!, 'full', HERO_WIDGET);
    await window.saveAdminLayout?.();

    expect(window.adminCurrentLayout?.[0]).toMatchObject({
      id: 'hero-1',
      widgetId: 'hero',
      slot: 'full',
      order: 0,
      code: { html: '<p>Hero</p>' }
    });
    expect(saveRuntimeLayoutForViewport).toHaveBeenCalledWith(
      emit,
      'page-1',
      'admin',
      window.adminCurrentLayout
    );
  });
});
