/**
 * @jest-environment jsdom
 */

const makeWidget = jest.fn();
const initCanvasGrid = jest.fn(() => ({
  makeWidget,
  el: null,
  options: { columns: 12, cellHeight: 8 },
  update: jest.fn()
}));
const applyWidgetOptions = jest.fn();
const executeJs = jest.fn();

jest.mock('/ui/runtime/main/canvasGrid.js', () => ({
  init: initCanvasGrid,
}), { virtual: true });

jest.mock('/ui/runtime/main/widgetOptions.js', () => ({
  applyWidgetOptions,
}), { virtual: true });

jest.mock('/ui/runtime/main/script-utils.js', () => ({
  executeJs,
}), { virtual: true });

const { loadWidgets, registerLoaders } = require('../mother/modules/widgetManager/publicLoader.js');

describe('widgetManager public loader', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    jest.clearAllMocks();
    delete (window as any).__BP_ACTIVE_LAYOUT__;
  });

  test('registers the widgets loader', () => {
    const register = jest.fn();
    registerLoaders(register);
    expect(register).toHaveBeenCalledWith('widgets', loadWidgets);
  });

  test('renders public widgets into the active layout grid', async () => {
    (window as any).__BP_ACTIVE_LAYOUT__ = {
      grid: { columns: 12, cellHeight: 10, rows: 20 },
      items: [
        {
          widgetId: 'hero',
          instanceId: 'instance-1',
          xPercent: 25,
          yPercent: 10,
          wPercent: 50,
          hPercent: 20,
        },
      ],
    };
    const meltdownEmit = jest.fn().mockResolvedValue([
      {
        widgetId: 'hero',
        content: JSON.stringify({
          html: '<p onclick="window.bad = true">Hello</p><script>window.bad = true;</script>',
          css: '.widget{color:red}',
          js: 'window.loaded = true;',
        }),
        metadata: { height: 40 },
      },
    ]);

    await loadWidgets({}, { meltdownEmit, publicToken: 'public-token' });

    const gridEl = document.getElementById('bp-grid') as HTMLElement;
    const item = gridEl.querySelector<HTMLElement>('.canvas-item');
    const widget = item?.querySelector<HTMLElement>('.widget');

    expect(initCanvasGrid).toHaveBeenCalledWith({ columns: 12, cellHeight: 10 }, gridEl);
    expect(meltdownEmit).toHaveBeenCalledWith('getWidgets', {
      jwt: 'public-token',
      moduleName: 'widgetManager',
      moduleType: 'core',
      widgetType: 'public',
    });
    expect(item?.dataset.instanceId).toBe('instance-1');
    expect(item?.dataset.x).toBe('3');
    expect(item?.dataset.y).toBe('2');
    expect(item?.getAttribute('gs-w')).toBe('6');
    expect(item?.getAttribute('gs-h')).toBe('4');
    expect(makeWidget).toHaveBeenCalledWith(item);
    expect(widget?.innerHTML).toBe('<p>Hello</p>');
    expect(gridEl.querySelector('style')?.textContent).toBe('.widget{color:red}');
    expect(executeJs).toHaveBeenCalledWith('window.loaded = true;', item, item, 'Widget');
    expect(applyWidgetOptions).toHaveBeenCalledWith(item, { height: 40 }, expect.any(Object));
  });

  test('prefers page-scoped context layout over stale global layout state', async () => {
    (window as any).__BP_ACTIVE_LAYOUT__ = {
      grid: { columns: 12, cellHeight: 8, rows: 12 },
      items: [
        {
          widgetId: 'stale',
          instanceId: 'first-page-widget',
          xPercent: 0,
          yPercent: 0,
          wPercent: 100,
          hPercent: 20,
        },
      ],
    };
    const meltdownEmit = jest.fn().mockResolvedValue([
      {
        widgetId: 'stale',
        content: JSON.stringify({ html: '<p>Wrong page</p>' }),
        metadata: {},
      },
      {
        widgetId: 'hero',
        content: JSON.stringify({ html: '<p>Current page</p>' }),
        metadata: { height: 25 },
      },
    ]);

    await loadWidgets(
      { layoutRef: 'layout:current@v1' },
      {
        meltdownEmit,
        publicToken: 'public-token',
        activeLayout: {
          grid: { columns: 12, cellHeight: 10, rows: 12 },
          layoutRef: 'layout:current@v1',
          items: [
            {
              widgetId: 'hero',
              instanceId: 'current-page-widget',
              xPercent: 0,
              yPercent: 0,
              wPercent: 100,
              hPercent: 25,
            },
          ],
        },
      }
    );

    const items = Array.from(document.querySelectorAll<HTMLElement>('.canvas-item'));
    expect(items).toHaveLength(1);
    expect(items[0].dataset.instanceId).toBe('current-page-widget');
    expect(items[0].querySelector('.widget')?.innerHTML).toBe('<p>Current page</p>');
    expect(items[0].querySelector('.widget')?.innerHTML).not.toContain('Wrong page');
  });

  test('prefers descriptor layout when an envelope carries the page layout inline', async () => {
    (window as any).__BP_ACTIVE_LAYOUT__ = {
      grid: { columns: 12, cellHeight: 8, rows: 12 },
      items: [{ widgetId: 'stale', instanceId: 'stale-widget' }],
    };
    const meltdownEmit = jest.fn().mockResolvedValue([
      {
        widgetId: 'hero',
        content: JSON.stringify({ html: '<p>Descriptor page</p>' }),
        metadata: {},
      },
      {
        widgetId: 'stale',
        content: JSON.stringify({ html: '<p>Stale page</p>' }),
        metadata: {},
      },
    ]);

    await loadWidgets(
      {
        layout: {
          grid: { columns: 12, cellHeight: 10, rows: 12 },
          items: [{ widgetId: 'hero', instanceId: 'descriptor-widget' }],
        },
      },
      { meltdownEmit, publicToken: 'public-token' }
    );

    const item = document.querySelector<HTMLElement>('.canvas-item');
    expect(item?.dataset.instanceId).toBe('descriptor-widget');
    expect(item?.querySelector('.widget')?.innerHTML).toBe('<p>Descriptor page</p>');
  });
});
