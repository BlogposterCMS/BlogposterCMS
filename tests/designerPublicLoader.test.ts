/**
 * @jest-environment jsdom
 */

const { loadDesign, registerLoaders } = require('../modules/designer/publicLoader.js');

describe('designer public loader', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    jest.clearAllMocks();
    delete (window as any).__BP_ACTIVE_LAYOUT__;
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
      meltdownEmit: jest.fn().mockResolvedValue(layout),
    };

    await loadDesign({ css: ['/assets/css/site.css'], layoutRef: 'layout:landing@v1' }, ctx);

    expect(ctx.meltdownEmit).toHaveBeenCalledWith('designer.getLayout', {
      jwt: 'public-token',
      moduleName: 'designer',
      moduleType: 'core',
      lane: 'public',
      layoutRef: 'layout:landing@v1',
    });
    expect(ctx.activeLayout).toBe(layout);
    expect(ctx.activeLayoutRef).toBe('layout:landing@v1');
    expect((window as any).__BP_ACTIVE_LAYOUT__).toBe(layout);
    expect(document.querySelector('link[href="/assets/css/site.css"]')).not.toBeNull();
  });
});
