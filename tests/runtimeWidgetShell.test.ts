/**
 * @jest-environment jsdom
 */

import { createRuntimeWidgetShell } from '../ui/runtime/main/runtimeWidgetShell';

class CSSStyleSheetMock {
  cssText = '';

  replaceSync(cssText: string): void {
    this.cssText = cssText;
  }
}

describe('runtimeWidgetShell', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    window.ACTIVE_THEME = 'minimal';
    (globalThis as typeof globalThis & { CSSStyleSheet?: unknown }).CSSStyleSheet = CSSStyleSheetMock;
    Object.defineProperty(ShadowRoot.prototype, 'adoptedStyleSheets', {
      configurable: true,
      writable: true,
      value: []
    });
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.ACTIVE_THEME;
  });

  it('creates the widget shadow shell with global css, container, and resize slot', () => {
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);

    const { root, container } = createRuntimeWidgetShell(wrapper, 'admin');
    const styles = Array.from(root.querySelectorAll('style')).map(style => style.textContent || '');
    const [handleSheet] = root.adoptedStyleSheets as CSSStyleSheetMock[];

    expect(wrapper.shadowRoot).toBe(root);
    expect(styles[0]).toContain("@import url('/assets/css/site.css')");
    expect(container.className).toBe('widget-container admin-widget');
    expect(container.style.width).toBe('100%');
    expect(container.style.height).toBe('100%');
    expect(root.querySelector('slot[name="resize-handle"]')).not.toBeNull();
    expect(handleSheet.cssText).toContain('::slotted(.resize-handle)');
    expect(handleSheet.cssText).toContain('var(--studio-border-strong');
    expect(handleSheet.cssText).not.toContain('var(--user-color');
  });

  it('stops drag events that start from form controls inside the widget shell', () => {
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    const { container } = createRuntimeWidgetShell(wrapper, 'public');
    const input = document.createElement('input');
    const label = document.createElement('label');
    container.append(input, label);

    const stopPropagation = jest.spyOn(Event.prototype, 'stopPropagation');
    const stopImmediatePropagation = jest.spyOn(Event.prototype, 'stopImmediatePropagation');
    const targetHandler = jest.fn();
    const wrapperHandler = jest.fn();
    input.addEventListener('mousedown', targetHandler);
    wrapper.addEventListener('mousedown', wrapperHandler);

    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    label.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(targetHandler).toHaveBeenCalledTimes(1);
    expect(wrapperHandler).not.toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalledTimes(2);
    expect(stopImmediatePropagation).not.toHaveBeenCalled();
  });

  it('does not stop shell drag events from ordinary content', () => {
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    const { container } = createRuntimeWidgetShell(wrapper, 'public');
    const content = document.createElement('div');
    container.appendChild(content);

    const stopPropagation = jest.spyOn(Event.prototype, 'stopPropagation');
    const stopImmediatePropagation = jest.spyOn(Event.prototype, 'stopImmediatePropagation');

    content.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(stopPropagation).not.toHaveBeenCalled();
    expect(stopImmediatePropagation).not.toHaveBeenCalled();
  });
});
