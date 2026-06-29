/**
 * @jest-environment jsdom
 */

import { createRuntimeWidgetContext } from '../ui/runtime/main/runtimeWidgetContext';

describe('runtimeWidgetContext', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete window.ADMIN_TOKEN;
  });

  afterEach(() => {
    delete window.ADMIN_TOKEN;
  });

  it('builds public scene context from the closest canvas item', () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-item';
    wrapper.dataset.instanceId = 'instance-1';
    wrapper.dataset.behavior = 'sticky';
    wrapper.dataset.sceneId = 'hero';
    wrapper.dataset.sceneTitle = 'Hero';
    wrapper.dataset.effects = '[{"id":"fadeIn"}]';

    const content = document.createElement('div');
    wrapper.appendChild(content);
    document.body.appendChild(wrapper);

    const ctx = createRuntimeWidgetContext(
      content,
      { id: 'heroWidget', metadata: { label: 'Hero' } },
      'public'
    );

    expect(ctx).toMatchObject({
      id: 'instance-1',
      widgetId: 'heroWidget',
      metadata: { label: 'Hero' },
      scene: {
        behavior: 'sticky',
        sceneId: 'hero',
        sceneTitle: 'Hero',
        effects: [{ id: 'fadeIn' }]
      }
    });
    expect(ctx.jwt).toBeUndefined();
  });

  it('adds the admin token only for admin widget contexts', () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-item';
    window.ADMIN_TOKEN = 'admin-token';

    expect(createRuntimeWidgetContext(wrapper, { id: 'hero' }, 'admin').jwt)
      .toBe('admin-token');
    expect(createRuntimeWidgetContext(wrapper, { id: 'hero' }, 'public').jwt)
      .toBeUndefined();
  });

  it('carries instance metadata separately from registry metadata', () => {
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-item';
    wrapper.dataset.instanceId = 'instance-2';

    expect(createRuntimeWidgetContext(
      wrapper,
      { id: 'mediaBlock', metadata: { label: 'Media' } },
      'public',
      { src: '/media/hero.jpg', alt: 'Hero' }
    )).toMatchObject({
      id: 'instance-2',
      widgetId: 'mediaBlock',
      metadata: { label: 'Media' },
      instanceMetadata: { src: '/media/hero.jpg', alt: 'Hero' }
    });
  });
});
