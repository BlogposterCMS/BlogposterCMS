/**
 * @jest-environment jsdom
 */

import { renderWidget } from '../ui/widgets/rendering/widgetRenderer';
import { addDashboardWidget } from '../ui/widgets/panel/widgetPanelAddWidget';
import { attachDashboardControls } from '../ui/widgets/panel/widgetControls';

jest.mock('../ui/widgets/rendering/widgetRenderer', () => ({
  renderWidget: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../ui/widgets/panel/widgetControls', () => ({
  attachDashboardControls: jest.fn()
}));

const STATS_WIDGET = {
  id: 'stats',
  metadata: {
    label: 'Stats',
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
      },
      heightMode: 'dynamic',
      height: {
        minHeight: { mobile: 160, tablet: 180, desktop: 220 }
      }
    }
  }
};

describe('widgetPanelAddWidget', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    window.ADMIN_TOKEN = 'admin-token';
    window.meltdownEmit = jest.fn().mockResolvedValue({
      content: '{"height":40,"overflow":false,"title":"Hello"}'
    });
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete window.ADMIN_TOKEN;
    delete window.meltdownEmit;
    delete window.adminGrid;
    document.body.innerHTML = '';
    document.body.className = '';
    jest.restoreAllMocks();
  });

  it('adds a dashboard widget with an explicit slot, strips layout defaults, renders it, and emits the add event', async () => {
    const gridEl = document.createElement('section');
    gridEl.id = 'adminGrid';
    const grid = createMockGrid(gridEl);
    const events: CustomEvent[] = [];
    window.adminGrid = grid;
    document.body.appendChild(gridEl);
    document.addEventListener('ui:widget:add', event => {
      events.push(event as CustomEvent);
    });

    await addDashboardWidget(STATS_WIDGET, { slot: 'half', column: 5, order: 30 });

    const wrapper = gridEl.querySelector<HTMLElement>('.dashboard-widget');
    expect(grid.registerWidget).toHaveBeenCalledWith(wrapper);
    expect(wrapper?.dataset.widgetId).toBe('stats');
    expect(wrapper?.dataset.instanceId).toMatch(/^w[a-z0-9]+/);
    expect(wrapper?.dataset.dashboardSlot).toBe('half');
    expect(wrapper?.dataset.dashboardColumns).toBe('6');
    expect(wrapper?.dataset.dashboardColumn).toBe('5');
    expect(wrapper?.dataset.dashboardHeightMode).toBe('dynamic');
    expect(wrapper?.style.getPropertyValue('--dashboard-column-start')).toBe('5');
    expect(wrapper?.style.getPropertyValue('--dashboard-min-height')).toBe('180px');
    expect(wrapper?.style.order).toBe('30');
    expect(wrapper?.querySelector('.canvas-item-content')).not.toBeNull();
    expect(window.meltdownEmit).toHaveBeenCalledWith('getWidgetInstance', {
      jwt: 'admin-token',
      moduleName: 'plainspace',
      moduleType: 'core',
      instanceId: 'default.stats'
    });
    expect(renderWidget).toHaveBeenCalledWith(
      wrapper,
      STATS_WIDGET,
      null,
      { title: 'Hello' },
      'Widgets'
    );
    expect(attachDashboardControls).toHaveBeenCalledWith(wrapper, grid);
    expect(grid.select).toHaveBeenCalledWith(wrapper);
    expect(grid.emitChange).toHaveBeenCalledWith(wrapper);
    expect(events[0].detail).toEqual({ type: 'stats' });
  });

  it('renders the widget without default data when instance loading fails', async () => {
    const gridEl = document.createElement('section');
    gridEl.id = 'adminGrid';
    const grid = createMockGrid(gridEl);
    window.adminGrid = grid;
    delete window.meltdownEmit;

    await addDashboardWidget({ id: 'broken' });

    const wrapper = gridEl.querySelector<HTMLElement>('.dashboard-widget');
    expect(renderWidget).toHaveBeenCalledWith(
      wrapper,
      { id: 'broken' },
      null,
      null,
      'Widgets'
    );
    expect(attachDashboardControls).toHaveBeenCalledWith(wrapper, grid);
  });

  it('inserts a dropped widget before the requested dashboard instance', async () => {
    const gridEl = document.createElement('section');
    gridEl.id = 'adminGrid';
    const existing = document.createElement('article');
    existing.className = 'dashboard-widget';
    existing.dataset.instanceId = 'existing';
    gridEl.appendChild(existing);
    const grid = createMockGrid(gridEl);
    window.adminGrid = grid;
    document.body.appendChild(gridEl);

    await addDashboardWidget(STATS_WIDGET, { beforeInstanceId: 'existing', column: 3 });

    const widgets = Array.from(gridEl.querySelectorAll<HTMLElement>('.dashboard-widget'));
    expect(widgets).toHaveLength(2);
    expect(widgets[0].dataset.widgetId).toBe('stats');
    expect(widgets[1]).toBe(existing);
    expect(widgets[0].dataset.dashboardColumn).toBe('3');
  });

  it('skips work when no admin grid is available', async () => {
    await addDashboardWidget({ id: 'stats' });

    expect(renderWidget).not.toHaveBeenCalled();
    expect(attachDashboardControls).not.toHaveBeenCalled();
  });
});

function createMockGrid(gridEl: HTMLElement) {
  return {
    el: gridEl,
    widgets: [] as HTMLElement[],
    registerWidget: jest.fn(function registerWidget(el: HTMLElement) {
      this.widgets.push(el);
    }),
    removeWidget: jest.fn(),
    select: jest.fn(),
    emitChange: jest.fn()
  };
}
