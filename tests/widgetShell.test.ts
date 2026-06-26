/**
 * @jest-environment jsdom
 */

import { createWidgetRenderShell } from '../ui/widgets/rendering/widgetShell';

describe('widgetShell', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('clears previous content and creates the admin widget container', () => {
    const content = document.createElement('div');
    const stale = document.createElement('p');
    stale.textContent = 'old';
    content.appendChild(stale);
    document.body.appendChild(content);

    const container = createWidgetRenderShell(content);

    expect(content.contains(stale)).toBe(false);
    expect(content.children).toHaveLength(1);
    expect(content.firstElementChild).toBe(container);
    expect(container.className).toBe('widget-container admin-widget');
    expect(container.style.width).toBe('100%');
    expect(container.style.height).toBe('100%');
  });

  it('stops drag events that start from form controls inside the widget content', () => {
    const content = document.createElement('div');
    document.body.appendChild(content);
    const container = createWidgetRenderShell(content);
    const input = document.createElement('input');
    const label = document.createElement('label');
    container.append(input, label);

    const stopPropagation = jest.spyOn(Event.prototype, 'stopPropagation');
    const stopImmediatePropagation = jest.spyOn(Event.prototype, 'stopImmediatePropagation');

    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    label.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(stopPropagation).toHaveBeenCalledTimes(2);
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(2);
  });

  it('does not stop drag events from ordinary widget content', () => {
    const content = document.createElement('div');
    document.body.appendChild(content);
    const container = createWidgetRenderShell(content);
    const ordinaryContent = document.createElement('div');
    container.appendChild(ordinaryContent);

    const stopPropagation = jest.spyOn(Event.prototype, 'stopPropagation');
    const stopImmediatePropagation = jest.spyOn(Event.prototype, 'stopImmediatePropagation');

    ordinaryContent.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(stopPropagation).not.toHaveBeenCalled();
    expect(stopImmediatePropagation).not.toHaveBeenCalled();
  });
});
