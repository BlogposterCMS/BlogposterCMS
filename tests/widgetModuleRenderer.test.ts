/**
 * @jest-environment jsdom
 */

import { loadWidgetModule } from '../ui/widgets/rendering/widgetModuleLoader';
import { renderWidgetModule } from '../ui/widgets/rendering/widgetModuleRenderer';

jest.mock('../ui/widgets/rendering/widgetModuleLoader', () => ({
  loadWidgetModule: jest.fn()
}));

describe('widgetModuleRenderer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.ADMIN_TOKEN = 'admin-token';
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.ADMIN_TOKEN;
  });

  it('loads and renders widget modules with the widget context', async () => {
    const container = document.createElement('div');
    const render = jest.fn();
    (loadWidgetModule as jest.Mock).mockResolvedValue({ render });

    await renderWidgetModule(container, {
      id: 'hero',
      metadata: { tone: 'quiet' },
      codeUrl: '/ui/widgets/plainspace/admin/hero.js'
    }, 'instance-1');

    expect(loadWidgetModule).toHaveBeenCalledWith('/ui/widgets/plainspace/admin/hero.js');
    expect(render).toHaveBeenCalledWith(container, {
      id: 'instance-1',
      widgetId: 'hero',
      metadata: { tone: 'quiet' },
      instanceMetadata: {},
      jwt: 'admin-token'
    });
  });

  it('passes metadata-only widget settings to module renderers', async () => {
    const container = document.createElement('div');
    const render = jest.fn();
    (loadWidgetModule as jest.Mock).mockResolvedValue({ render });

    await renderWidgetModule(container, {
      id: 'gallery',
      metadata: { label: 'Gallery' },
      codeUrl: '/ui/widgets/plainspace/public/basicwidgets/galleryWidget.js'
    }, 'gallery-1', { mode: 'masonry', rows: 2 });

    expect(render).toHaveBeenCalledWith(container, {
      id: 'gallery-1',
      widgetId: 'gallery',
      metadata: { label: 'Gallery' },
      instanceMetadata: { mode: 'masonry', rows: 2 },
      jwt: 'admin-token'
    });
  });

  it('skips missing or blocked widget module URLs', async () => {
    const container = document.createElement('div');
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await renderWidgetModule(container, { id: 'empty' }, 'instance-1');
    expect(loadWidgetModule).not.toHaveBeenCalled();

    (loadWidgetModule as jest.Mock).mockResolvedValue(null);
    await renderWidgetModule(container, {
      id: 'blocked',
      codeUrl: '/plainspace/widgets/admin/blocked.js'
    }, 'instance-1');

    expect(warn).toHaveBeenCalledWith(
      '[Widgets] blocked widget import path',
      'blocked',
      '/plainspace/widgets/admin/blocked.js'
    );
  });

  it('logs widget module import failures without throwing', async () => {
    const container = document.createElement('div');
    const error = new Error('boom');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (loadWidgetModule as jest.Mock).mockRejectedValue(error);

    await expect(renderWidgetModule(container, {
      id: 'broken',
      codeUrl: '/ui/widgets/plainspace/admin/broken.js'
    }, 'instance-1')).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith('[Widgets] widget import error', error);
  });
});
