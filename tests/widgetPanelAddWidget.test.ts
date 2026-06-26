/**
 * @jest-environment jsdom
 */

import { applyWidgetOptions } from '../ui/widgets/options/widgetOptions';
import { renderWidget } from '../ui/widgets/rendering/widgetRenderer';
import { addDashboardWidget } from '../ui/widgets/panel/widgetPanelAddWidget';
import { attachDashboardControls } from '../ui/widgets/panel/widgetControls';

jest.mock('../ui/widgets/options/widgetOptions', () => ({
  applyWidgetOptions: jest.fn()
}));

jest.mock('../ui/widgets/rendering/widgetRenderer', () => ({
  renderWidget: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../ui/widgets/panel/widgetControls', () => ({
  attachDashboardControls: jest.fn()
}));

describe('widgetPanelAddWidget', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
    window.ADMIN_TOKEN = 'admin-token';
    window.meltdownEmit = jest.fn().mockResolvedValue({
      content: '{"height":40,"overflow":false}'
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

  it('adds a dashboard widget, applies defaults, renders it, and emits the add event', async () => {
    const wrapper = document.createElement('div');
    const grid = createMockGrid(wrapper);
    const events: CustomEvent[] = [];
    window.adminGrid = grid;
    document.body.classList.add('dashboard-edit-mode');
    document.addEventListener('ui:widget:add', event => {
      events.push(event as CustomEvent);
    });

    await addDashboardWidget({ id: 'stats', metadata: { label: 'Stats' } }, { x: 2, y: 3 });

    expect(grid.addWidget).toHaveBeenCalledWith({ x: 2, y: 3, w: 8, h: 20 });
    expect(wrapper.dataset.widgetId).toBe('stats');
    expect(wrapper.dataset.instanceId).toMatch(/^w[a-z0-9]+/);
    expect(wrapper.querySelector('.canvas-item-content')).not.toBeNull();
    expect(window.meltdownEmit).toHaveBeenCalledWith('getWidgetInstance', {
      jwt: 'admin-token',
      moduleName: 'plainspace',
      moduleType: 'core',
      instanceId: 'default.stats'
    });
    expect(applyWidgetOptions).toHaveBeenCalledWith(wrapper, { height: 40, overflow: false }, grid);
    expect(renderWidget).toHaveBeenCalledWith(
      wrapper,
      { id: 'stats', metadata: { label: 'Stats' } },
      null,
      { height: 40, overflow: false },
      'Widgets'
    );
    expect(attachDashboardControls).toHaveBeenCalledWith(wrapper, grid);
    expect(grid.select).toHaveBeenCalledWith(wrapper);
    expect(events[0].detail).toEqual({ type: 'stats' });
  });

  it('renders the widget without default options when instance loading fails', async () => {
    const wrapper = document.createElement('div');
    const grid = createMockGrid(wrapper);
    window.adminGrid = grid;
    delete window.meltdownEmit;

    await addDashboardWidget({ id: 'broken' });

    expect(applyWidgetOptions).not.toHaveBeenCalled();
    expect(renderWidget).toHaveBeenCalledWith(
      wrapper,
      { id: 'broken' },
      null,
      null,
      'Widgets'
    );
    expect(attachDashboardControls).toHaveBeenCalledWith(wrapper, grid);
  });

  it('skips work when no admin grid is available', async () => {
    await addDashboardWidget({ id: 'stats' });

    expect(renderWidget).not.toHaveBeenCalled();
    expect(attachDashboardControls).not.toHaveBeenCalled();
  });
});

function createMockGrid(wrapper: HTMLElement) {
  return {
    addWidget: jest.fn(() => wrapper),
    removeWidget: jest.fn(),
    update: jest.fn(),
    select: jest.fn(),
    _updateGridHeight: jest.fn(),
    emitChange: jest.fn()
  };
}
