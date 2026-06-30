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
const mockRenderTextWidget = jest.fn();

jest.mock('/ui/runtime/main/canvasGrid.js', () => ({
  init: initCanvasGrid,
}), { virtual: true });

jest.mock('/ui/runtime/main/widgetOptions.js', () => ({
  applyWidgetOptions,
}), { virtual: true });

jest.mock('/ui/runtime/main/script-utils.js', () => ({
  executeJs,
}), { virtual: true });

jest.mock('/ui/widgets/plainspace/public/basicwidgets/textBoxWidget.js', () => ({
  render: mockRenderTextWidget,
}), { virtual: true });

const { loadWidgets, registerLoaders } = require('../mother/modules/widgetManager/publicLoader.js');

describe('widgetManager public loader', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    jest.clearAllMocks();
    mockRenderTextWidget.mockImplementation((el: HTMLElement, ctx: Record<string, any> = {}) => {
      el.textContent = ctx.instanceMetadata?.settings?.html || '';
    });
  });

  test('registers the widgets loader', () => {
    const register = jest.fn();
    registerLoaders(register);
    expect(register).toHaveBeenCalledWith('widgets', loadWidgets);
  });

  test('renders public widgets into the active layout grid', async () => {
    const activeLayout = {
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
    const widgetRegistry = [
      {
        widgetId: 'hero',
        content: JSON.stringify({
          html: '<p onclick="window.bad = true">Hello</p><script>window.bad = true;</script>',
          css: '.widget{color:red}',
          js: 'window.loaded = true;',
        }),
        metadata: { height: 40 },
      },
    ];
    const meltdownEmit = jest.fn().mockResolvedValue({
      resource: 'widgets',
      action: 'list',
      data: widgetRegistry,
    });
    const readyListener = jest.fn();
    window.addEventListener('bp:public-widgets-ready', readyListener);

    await loadWidgets({}, { meltdownEmit, publicToken: 'public-token', activeLayout });

    const gridEl = document.getElementById('bp-grid') as HTMLElement;
    const item = gridEl.querySelector<HTMLElement>('.canvas-item');
    const widget = item?.querySelector<HTMLElement>('.widget');

    expect(initCanvasGrid).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: 12,
        cellHeight: 10,
        percentageMode: true,
        staticGrid: true,
        enableZoom: false,
      }),
      gridEl
    );
    expect(gridEl.classList.contains('bp-public-canvas')).toBe(true);
    expect(gridEl.style.width).toBe('100%');
    expect(gridEl.style.height).toBe('100vh');
    expect(document.getElementById('bp-public-canvas-runtime-style')?.textContent).toContain('@media (max-width: 760px)');
    expect(meltdownEmit).toHaveBeenCalledWith('cmsPublicRuntimeRequest', {
      jwt: 'public-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'widgets',
      action: 'list',
      params: {},
    });
    expect(item?.dataset.instanceId).toBe('instance-1');
    expect(item?.dataset.x).toBe('3');
    expect(item?.dataset.y).toBe('2');
    expect(item?.getAttribute('gs-w')).toBe('6');
    expect(item?.getAttribute('gs-h')).toBe('4');
    expect(item?.style.left).toBe('25%');
    expect(item?.style.top).toBe('10%');
    expect(item?.style.width).toBe('50%');
    expect(item?.style.height).toBe('20%');
    expect(makeWidget).toHaveBeenCalledWith(item);
    expect(widget?.innerHTML).toBe('<p>Hello</p>');
    expect(gridEl.querySelector('style')?.textContent).toBe('.widget{color:red}');
    expect(executeJs).toHaveBeenCalledWith('window.loaded = true;', item, item, 'Widget');
    expect(applyWidgetOptions).toHaveBeenCalledWith(item, { height: 40 });
    expect(document.documentElement.dataset.bpPublicWidgetsReady).toBe('true');
    expect(readyListener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({ renderedCount: 1 }),
    }));
  });

  test('uses page-scoped context layout for the current public page', async () => {
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

  test('passes design instance metadata into first-party widget modules', async () => {
    const activeLayout = {
      grid: { columns: 12, cellHeight: 10, rows: 20 },
      items: [
        {
          widgetId: 'textBox',
          instanceId: 'text-instance',
          xPercent: 0,
          yPercent: 0,
          wPercent: 100,
          hPercent: 20,
          metadata: {
            settings: {
              html: 'Design metadata text',
            },
          },
        },
      ],
    };
    const meltdownEmit = jest.fn().mockResolvedValue({
      resource: 'widgets',
      action: 'list',
      data: [
        {
          widgetId: 'textBox',
          content: '/ui/widgets/plainspace/public/basicwidgets/textBoxWidget.js',
          metadata: { defaults: { body: 'Fallback' } },
        },
      ],
    });

    await loadWidgets({}, { meltdownEmit, publicToken: 'public-token', activeLayout });

    expect(mockRenderTextWidget).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        id: 'text-instance',
        widgetId: 'textBox',
        instanceMetadata: {
          settings: {
            html: 'Design metadata text',
          },
        },
      })
    );
    expect(document.querySelector('.widget')?.textContent).toBe('Design metadata text');
  });
});
