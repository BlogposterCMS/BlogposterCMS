/**
 * @jest-environment jsdom
 */

import { applyDefaultWidgetInstanceOptions } from '../ui/runtime/main/runtimeWidgetInstances';
import { applyWidgetOptions } from '../ui/runtime/main/widgetRuntimeGateway';

jest.mock('../ui/runtime/main/widgetRuntimeGateway', () => ({
  applyWidgetOptions: jest.fn()
}));

describe('runtimeWidgetInstances', () => {
  beforeEach(() => {
    delete window.ADMIN_TOKEN;
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete window.ADMIN_TOKEN;
  });

  it('loads default widget instance options and applies parsed content', async () => {
    const wrapper = document.createElement('div');
    const grid = { options: {} };
    const emit = jest.fn().mockResolvedValue({
      content: '{"height":40,"overflow":false}'
    });

    await applyDefaultWidgetInstanceOptions(
      wrapper,
      { id: 'stats' },
      grid,
      emit,
      'public'
    );

    expect(emit).toHaveBeenCalledWith('getWidgetInstance', {
      moduleName: 'plainspace',
      moduleType: 'core',
      instanceId: 'default.stats'
    });
    expect(applyWidgetOptions).toHaveBeenCalledWith(
      wrapper,
      { height: 40, overflow: false },
      grid
    );
  });

  it('includes admin jwt when applying admin lane defaults', async () => {
    const wrapper = document.createElement('div');
    const grid = { options: {} };
    const emit = jest.fn().mockResolvedValue({
      content: { width: 50 }
    });
    window.ADMIN_TOKEN = 'admin-token';

    await applyDefaultWidgetInstanceOptions(
      wrapper,
      { id: 'users' },
      grid,
      emit,
      'admin'
    );

    expect(emit).toHaveBeenCalledWith('getWidgetInstance', {
      moduleName: 'plainspace',
      moduleType: 'core',
      instanceId: 'default.users',
      jwt: 'admin-token'
    });
    expect(applyWidgetOptions).toHaveBeenCalledWith(wrapper, { width: 50 }, grid);
  });

  it('swallows missing or malformed default options like the renderer path', async () => {
    const wrapper = document.createElement('div');
    const grid = { options: {} };
    const emit = jest.fn().mockResolvedValue({
      content: '{nope'
    });

    await expect(applyDefaultWidgetInstanceOptions(
      wrapper,
      { id: 'broken' },
      grid,
      emit,
      'public'
    )).resolves.toBeUndefined();

    expect(applyWidgetOptions).not.toHaveBeenCalled();
  });
});
