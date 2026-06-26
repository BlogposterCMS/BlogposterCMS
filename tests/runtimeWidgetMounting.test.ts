/**
 * @jest-environment jsdom
 */

import { renderRuntimeCanvasWidget } from '../ui/runtime/main/runtimeWidgetMounting';
import { renderWidget } from '../ui/runtime/main/runtimeWidgetRenderer';
import { applyDefaultWidgetInstanceOptions } from '../ui/runtime/main/runtimeWidgetInstances';

jest.mock('../ui/runtime/main/runtimeWidgetRenderer', () => ({
  renderWidget: jest.fn()
}));

jest.mock('../ui/runtime/main/runtimeWidgetInstances', () => ({
  applyDefaultWidgetInstanceOptions: jest.fn()
}));

describe('runtimeWidgetMounting', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    (renderWidget as jest.Mock).mockResolvedValue(undefined);
    (applyDefaultWidgetInstanceOptions as jest.Mock).mockResolvedValue(undefined);
  });

  function createPendingWidget() {
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-item loading';
    const placeholder = document.createElement('div');
    placeholder.className = 'widget-placeholder';
    wrapper.appendChild(placeholder);
    document.body.appendChild(wrapper);
    return { wrapper, placeholder };
  }

  it('mounts content, applies default options, renders widget code, and clears loading state', async () => {
    const { wrapper, placeholder } = createPendingWidget();
    const grid = { options: {} };
    const emit = jest.fn().mockResolvedValue(undefined);
    const def = { id: 'hero' };

    const content = await renderRuntimeCanvasWidget({
      wrapper,
      placeholder,
      item: {
        id: 'hero-1',
        sceneId: 'scene-hero',
        code: { html: '<p>Hello</p>' }
      },
      def,
      grid,
      emit,
      lane: 'public'
    });

    expect(content.className).toBe('canvas-item-content');
    expect(wrapper.contains(placeholder)).toBe(false);
    expect(applyDefaultWidgetInstanceOptions).toHaveBeenCalledWith(
      wrapper,
      def,
      grid,
      emit,
      'public'
    );
    expect(renderWidget).toHaveBeenCalledWith(
      content,
      def,
      {
        html: '<p>Hello</p>',
        meta: {
          sceneId: 'scene-hero'
        }
      },
      'public'
    );
    expect(wrapper.classList.contains('loading')).toBe(false);
    expect(wrapper.classList.contains('loaded')).toBe(true);
    expect(wrapper.dataset.widgetHydrationState).toBe('ready');
    expect(wrapper.getAttribute('aria-busy')).toBe('false');
  });

  it('runs an optional post-render hook before clearing loading state', async () => {
    const { wrapper, placeholder } = createPendingWidget();
    const grid = { options: {} };
    const afterRender = jest.fn(() => {
      expect(wrapper.classList.contains('loading')).toBe(true);
    });

    await renderRuntimeCanvasWidget({
      wrapper,
      placeholder,
      item: {},
      def: { id: 'admin-widget' },
      grid,
      emit: jest.fn().mockResolvedValue(undefined),
      lane: 'admin',
      afterRender
    });

    expect(afterRender).toHaveBeenCalledWith(wrapper, grid);
    expect(wrapper.classList.contains('loading')).toBe(false);
  });

  it('marks widgets as failed when hydration throws', async () => {
    const { wrapper, placeholder } = createPendingWidget();
    const error = new Error('module exploded');
    (renderWidget as jest.Mock).mockRejectedValueOnce(error);

    await expect(renderRuntimeCanvasWidget({
      wrapper,
      placeholder,
      item: {},
      def: { id: 'broken-widget' },
      grid: { options: {} },
      emit: jest.fn().mockResolvedValue(undefined),
      lane: 'public'
    })).rejects.toThrow('module exploded');

    expect(wrapper.classList.contains('failed')).toBe(true);
    expect(wrapper.dataset.widgetHydrationState).toBe('failed');
    expect(wrapper.dataset.widgetHydrationDetail).toBe('module exploded');
    expect(wrapper.getAttribute('aria-busy')).toBe('false');
  });
});
