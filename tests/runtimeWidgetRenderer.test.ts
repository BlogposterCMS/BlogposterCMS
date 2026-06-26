/**
 * @jest-environment jsdom
 */

import { renderWidget } from '../ui/runtime/main/runtimeWidgetRenderer';

class CSSStyleSheetMock {
  cssText = '';

  replaceSync(cssText: string): void {
    this.cssText = cssText;
  }
}

describe('runtimeWidgetRenderer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    delete window.ADMIN_TOKEN;
    delete window.PUBLIC_TOKEN;
    delete window.ACTIVE_THEME;
    delete window.meltdownEmit;
    delete window.meltdownEmitBatch;
    (globalThis as typeof globalThis & { CSSStyleSheet?: unknown }).CSSStyleSheet = CSSStyleSheetMock;
    Object.defineProperty(ShadowRoot.prototype, 'adoptedStyleSheets', {
      configurable: true,
      writable: true,
      value: []
    });
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete window.ADMIN_TOKEN;
    delete window.PUBLIC_TOKEN;
    delete window.ACTIVE_THEME;
    delete window.meltdownEmit;
    delete window.meltdownEmitBatch;
  });

  function makeWrapper(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-item';
    wrapper.dataset.instanceId = 'instance-1';
    wrapper.dataset.behavior = 'sticky';
    wrapper.dataset.sceneId = 'hero';
    wrapper.dataset.effects = '[{"id":"fadeIn"}]';
    document.body.appendChild(wrapper);
    return wrapper;
  }

  it('renders inline widget code in an isolated shadow root and registers widget events', async () => {
    const wrapper = makeWrapper();
    window.ACTIVE_THEME = 'minimal';
    window.PUBLIC_TOKEN = 'public-token';
    window.meltdownEmit = jest.fn().mockResolvedValue(undefined);

    await renderWidget(
      wrapper,
      {
        id: 'heroWidget',
        metadata: {
          label: 'Hero',
          apiEvents: ['content.viewed', 'bad event']
        }
      },
      {
        html: '<img src=x onerror="alert(1)"><p>Hello</p>',
        css: '.widget-container { color: red; }'
      },
      'public'
    );

    const root = wrapper.shadowRoot as ShadowRoot;
    const styles = Array.from(root.querySelectorAll('style')).map(style => style.textContent || '');
    const container = root.querySelector('.widget-container') as HTMLElement;

    expect(styles[0]).toContain("@import url('/themes/minimal/theme.css')");
    expect(styles.join('\n')).toContain('color: red');
    expect(container.innerHTML).toContain('<p>Hello</p>');
    expect(container.innerHTML).not.toContain('onerror');
    expect(root.querySelector('slot[name="resize-handle"]')).not.toBeNull();
    expect(window.meltdownEmit).toHaveBeenCalledWith('registerWidgetUsage', {
      jwt: 'public-token',
      events: ['content.viewed']
    });
  });

  it('blocks disallowed dynamic widget module paths through the runtime gateway', async () => {
    const wrapper = makeWrapper();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await renderWidget(
      wrapper,
      { id: 'badWidget', codeUrl: 'https://evil.example/widget.js' },
      null,
      'admin'
    );

    expect(warn).toHaveBeenCalledWith(
      '[Widget badWidget] WIDGET_RUNTIME_BLOCKED_CODE_URL blocked widget import path:',
      'https://evil.example/widget.js'
    );
    expect(wrapper.shadowRoot?.querySelector('.widget-runtime-message')?.textContent)
      .toContain('WIDGET_RUNTIME_BLOCKED_CODE_URL');
  });

  it('adds admin context to dynamically loaded widgets', async () => {
    const wrapper = makeWrapper();
    const render = jest.fn();
    window.ADMIN_TOKEN = 'admin-token';
    const moduleUrl = '/widgets/community_test/widget.js';

    jest.doMock(moduleUrl, () => ({ render }), { virtual: true });

    await renderWidget(
      wrapper,
      { id: 'testWidget', metadata: { label: 'Test' }, codeUrl: moduleUrl },
      null,
      'admin'
    );

    expect(render).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        id: 'instance-1',
        widgetId: 'testWidget',
        jwt: 'admin-token',
        scene: expect.objectContaining({
          behavior: 'sticky',
          sceneId: 'hero',
          effects: [{ id: 'fadeIn' }]
        })
      })
    );
  });

});
