/**
 * @jest-environment jsdom
 */

import { createRuntimeWidgetContext } from '../ui/runtime/main/runtimeWidgetContext';
import { renderRuntimeWidgetModule } from '../ui/runtime/main/runtimeWidgetModuleRenderer';
import { loadWidgetModule } from '../ui/runtime/main/widgetRuntimeGateway';

jest.mock('../ui/runtime/main/runtimeWidgetContext', () => ({
  createRuntimeWidgetContext: jest.fn()
}));

jest.mock('../ui/runtime/main/widgetRuntimeGateway', () => ({
  loadWidgetModule: jest.fn()
}));

describe('runtimeWidgetModuleRenderer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  function createShell() {
    const wrapper = document.createElement('div');
    const container = document.createElement('div');
    document.body.append(wrapper, container);
    return { wrapper, container };
  }

  function expectRuntimeError(container: HTMLElement, code: string) {
    const message = container.querySelector('.widget-runtime-message') as HTMLElement | null;
    expect(message).not.toBeNull();
    expect(message?.dataset.errorCode).toBe(code);
    expect(message?.textContent).toContain(code);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders a visible diagnostic when a widget has no codeUrl', async () => {
    const { wrapper, container } = createShell();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await renderRuntimeWidgetModule(wrapper, container, { id: 'empty' }, 'public');

    expect(loadWidgetModule).not.toHaveBeenCalled();
    expect(createRuntimeWidgetContext).not.toHaveBeenCalled();
    expectRuntimeError(container, 'WIDGET_RUNTIME_MISSING_CODE_URL');
    expect(warn).toHaveBeenCalledWith('[Widget empty] WIDGET_RUNTIME_MISSING_CODE_URL: missing codeUrl');
  });

  it('renders a visible diagnostic when the runtime gateway blocks a module URL', async () => {
    const { wrapper, container } = createShell();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (loadWidgetModule as jest.Mock).mockResolvedValue(null);

    await renderRuntimeWidgetModule(
      wrapper,
      container,
      { id: 'badWidget', codeUrl: 'https://evil.example/widget.js' },
      'admin'
    );

    expect(loadWidgetModule).toHaveBeenCalledWith('https://evil.example/widget.js');
    expect(warn).toHaveBeenCalledWith(
      '[Widget badWidget] WIDGET_RUNTIME_BLOCKED_CODE_URL blocked widget import path:',
      'https://evil.example/widget.js'
    );
    expect(createRuntimeWidgetContext).not.toHaveBeenCalled();
    expectRuntimeError(container, 'WIDGET_RUNTIME_BLOCKED_CODE_URL');
  });

  it('renders allowed modules with a runtime widget context and awaits async renderers', async () => {
    const { wrapper, container } = createShell();
    let asyncRenderCompleted = false;
    const render = jest.fn(async (target: HTMLElement) => {
      await Promise.resolve();
      target.textContent = 'Loaded widget';
      asyncRenderCompleted = true;
    });
    const context = { id: 'instance-1', jwt: 'admin-token' };
    const def = { id: 'testWidget', metadata: { label: 'Test' }, codeUrl: '/widgets/community_test/widget.js' };
    (loadWidgetModule as jest.Mock).mockResolvedValue({ render });
    (createRuntimeWidgetContext as jest.Mock).mockReturnValue(context);

    await renderRuntimeWidgetModule(wrapper, container, def, 'admin');

    expect(loadWidgetModule).toHaveBeenCalledWith('/widgets/community_test/widget.js');
    expect(createRuntimeWidgetContext).toHaveBeenCalledWith(wrapper, def, 'admin');
    expect(render).toHaveBeenCalledWith(container, context);
    expect(asyncRenderCompleted).toBe(true);
    expect(container.textContent).toBe('Loaded widget');
  });

  it('renders a visible diagnostic when a module lacks a render export', async () => {
    const { wrapper, container } = createShell();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (loadWidgetModule as jest.Mock).mockResolvedValue({});

    await renderRuntimeWidgetModule(
      wrapper,
      container,
      { id: 'missingRender', codeUrl: '/widgets/community_test/widget.js' },
      'public'
    );

    expect(consoleError).toHaveBeenCalledWith(
      '[Widget missingRender] WIDGET_RUNTIME_MISSING_RENDER render export missing:',
      '/widgets/community_test/widget.js'
    );
    expect(createRuntimeWidgetContext).not.toHaveBeenCalled();
    expectRuntimeError(container, 'WIDGET_RUNTIME_MISSING_RENDER');
  });

  it('logs module import failures with widget context and renders a visible diagnostic', async () => {
    const { wrapper, container } = createShell();
    const error = new Error('boom');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (loadWidgetModule as jest.Mock).mockRejectedValue(error);

    await renderRuntimeWidgetModule(
      wrapper,
      container,
      { id: 'brokenWidget', codeUrl: '/widgets/community_test/widget.js' },
      'public'
    );

    expect(consoleError).toHaveBeenCalledWith(
      '[Widget brokenWidget] WIDGET_RUNTIME_IMPORT_FAILED import error:',
      error
    );
    expectRuntimeError(container, 'WIDGET_RUNTIME_IMPORT_FAILED');
  });

  it('logs async render failures with widget context and renders a visible diagnostic', async () => {
    const { wrapper, container } = createShell();
    const error = new Error('render boom');
    const render = jest.fn(async () => {
      throw error;
    });
    const context = { id: 'instance-1', jwt: 'admin-token' };
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const def = { id: 'renderBroken', codeUrl: '/widgets/community_test/widget.js' };
    (loadWidgetModule as jest.Mock).mockResolvedValue({ render });
    (createRuntimeWidgetContext as jest.Mock).mockReturnValue(context);

    await renderRuntimeWidgetModule(wrapper, container, def, 'admin');

    expect(render).toHaveBeenCalledWith(container, context);
    expect(consoleError).toHaveBeenCalledWith(
      '[Widget renderBroken] WIDGET_RUNTIME_RENDER_FAILED render error:',
      error
    );
    expectRuntimeError(container, 'WIDGET_RUNTIME_RENDER_FAILED');
  });
});
