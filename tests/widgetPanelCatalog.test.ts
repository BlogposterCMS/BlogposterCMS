/**
 * @jest-environment jsdom
 */

import { addDashboardWidget } from '../ui/widgets/panel/widgetPanelAddWidget';
import {
  bindWidgetPanelCatalog,
  getAvailableWidgetDefinitions,
  groupWidgetsByCategory
} from '../ui/widgets/panel/widgetPanelCatalog';

jest.mock('../ui/widgets/panel/widgetPanelAddWidget', () => ({
  addDashboardWidget: jest.fn()
}));

describe('widgetPanelCatalog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.availableWidgets = [];
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete window.availableWidgets;
    delete window.__dashboardDraggingWidgetId;
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('filters available widget definitions and groups them by category', () => {
    const widgets = getAvailableWidgetDefinitions([
      { id: 'hero', metadata: { category: 'Content' } },
      { id: 12 },
      null,
      { id: 'stats' },
      { id: 'htmlBlock', metadata: { hiddenFromCatalog: true } }
    ]);

    expect(widgets).toEqual([
      { id: 'hero', metadata: { category: 'Content' } },
      { id: 'stats' }
    ]);
    expect(groupWidgetsByCategory(widgets)).toEqual({
      Content: [{ id: 'hero', metadata: { category: 'Content' } }],
      Other: [{ id: 'stats' }]
    });
  });

  it('renders searchable widget cards and opens the selected widget', () => {
    const panel = createPanel();
    window.availableWidgets = [
      { id: 'stats', metadata: { category: 'Metrics', label: 'Stats', icon: '/icon.svg' } },
      { id: 'hero', metadata: { category: 'Content', label: 'Hero' } }
    ];

    bindWidgetPanelCatalog(panel);

    expect(categoryTitles(panel)).toEqual(['Content', 'Metrics']);
    expect(cardLabels(panel)).toEqual(['Hero', 'Stats']);
    expect(panel.querySelector<HTMLImageElement>('.widget-card .icon')?.src).toContain('/icon.svg');

    const search = panel.querySelector<HTMLInputElement>('.widgets-search')!;
    search.value = 'stat';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    expect(categoryTitles(panel)).toEqual(['Metrics']);
    expect(cardLabels(panel)).toEqual(['Stats']);

    panel.querySelector<HTMLElement>('.widget-card')?.click();
    expect(addDashboardWidget).toHaveBeenCalledWith({
      id: 'stats',
      metadata: { category: 'Metrics', label: 'Stats', icon: '/icon.svg' }
    });
  });

  it('sets widget ids for drag-and-drop cards', () => {
    const panel = createPanel();
    window.availableWidgets = [{ id: 'stats', metadata: { label: 'Stats' } }];
    bindWidgetPanelCatalog(panel);
    const card = panel.querySelector<HTMLElement>('.widget-card')!;
    const dataTransfer = {
      effectAllowed: '',
      setData: jest.fn()
    };
    const event = new Event('dragstart', { bubbles: true }) as DragEvent;
    Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });

    card.dispatchEvent(event);

    expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'stats');
    expect(dataTransfer.effectAllowed).toBe('copy');
    expect(window.__dashboardDraggingWidgetId).toBe('stats');

    card.dispatchEvent(new Event('dragend', { bubbles: true }));
    expect(window.__dashboardDraggingWidgetId).toBeUndefined();
  });
});

function createPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.innerHTML = `
    <input type="text" class="widgets-search" />
    <div class="widgets-categories"></div>
  `;
  document.body.appendChild(panel);
  return panel;
}

function categoryTitles(panel: HTMLElement): string[] {
  return Array.from(panel.querySelectorAll<HTMLElement>('.category-title'))
    .map(title => title.textContent || '');
}

function cardLabels(panel: HTMLElement): string[] {
  return Array.from(panel.querySelectorAll<HTMLElement>('.widget-card span'))
    .map(label => label.textContent || '');
}
