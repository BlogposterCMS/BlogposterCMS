/**
 * @jest-environment jsdom
 */

const { loadDesign, registerLoaders } = require('../mother/modules/designerManager/publicLoader.js');

describe('designer public loader', () => {
  test('reuses the initial layout and stylesheet without a duplicate request', async () => {
    document.head.innerHTML = '<link rel="stylesheet" href="/assets/css/runtime.css">';
    const layout = { grid: { columns: 12, cellHeight: 8 }, items: [], layoutRef: 'layout:page@v1' };
    const ctx = { initialLayoutResolved: true, initialLayout: layout, meltdownEmit: jest.fn() };
    expect(await loadDesign({ css: ['/assets/css/runtime.css'], layoutRef: layout.layoutRef }, ctx)).toBe(layout);
    expect(ctx.meltdownEmit).not.toHaveBeenCalled();
    expect(document.querySelectorAll('link[href="/assets/css/runtime.css"]')).toHaveLength(1);
  });
  beforeEach(() => {
    document.head.innerHTML = '';
    jest.clearAllMocks();
  });

  test('registers the design loader', () => {
    const register = jest.fn();
    registerLoaders(register);
    expect(register).toHaveBeenCalledWith('design', loadDesign);
  });

  test('loads the page layout through the public lane and shares it with later loaders', async () => {
    const layout = {
      grid: { columns: 12, cellHeight: 10 },
      items: [{ widgetId: 'hero', instanceId: 'instance-1' }],
      layoutRef: 'layout:landing@v1',
    };
    const ctx: Record<string, unknown> = {
      publicToken: 'public-token',
      meltdownEmit: jest.fn().mockResolvedValue({
        resource: 'designer',
        action: 'getLayout',
        data: layout,
      }),
    };

    await loadDesign({ css: ['/assets/css/site.css'], layoutRef: 'layout:landing@v1' }, ctx);

    expect(ctx.meltdownEmit).toHaveBeenCalledWith('cmsPublicRuntimeRequest', {
      jwt: 'public-token',
      moduleName: 'runtimeManager',
      moduleType: 'core',
      resource: 'designer',
      action: 'getLayout',
      params: {
        layoutRef: 'layout:landing@v1',
      },
    });
    expect(ctx.activeLayout).toBe(layout);
    expect(ctx.activeLayoutRef).toBe('layout:landing@v1');
    expect(document.querySelector('link[href="/assets/css/site.css"]')).not.toBeNull();
  });

  test('installs CSS without requesting a nonexistent layout for HTML-only pages', async () => {
    const ctx = { meltdownEmit: jest.fn(), activeLayout: undefined };
    const layout = await loadDesign({ css: ['/assets/css/runtime.css'] }, ctx);
    expect(ctx.meltdownEmit).not.toHaveBeenCalled();
    expect(layout.items).toEqual([]);
    expect(ctx.activeLayout).toBe(layout);
    expect(document.querySelector('link[href="/assets/css/runtime.css"]')).not.toBeNull();
  });
});
