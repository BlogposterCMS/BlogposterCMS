/**
 * @jest-environment jsdom
 */

import { registerEditableElement } from '../ui/widgets/rendering/editableRegistration';

describe('registerEditableElement', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete (window as typeof window & { BP_WIDGET_EDITOR?: unknown }).BP_WIDGET_EDITOR;
    delete (window as typeof window & { BP_DESIGNER_EDITOR?: unknown }).BP_DESIGNER_EDITOR;
  });

  it('uses the neutral widget editor bridge first', async () => {
    const element = document.createElement('div');
    const registerElement = jest.fn();
    (window as typeof window & { BP_WIDGET_EDITOR?: unknown }).BP_WIDGET_EDITOR = { registerElement };

    await expect(registerEditableElement(element, 'testWidget')).resolves.toBe(true);
    expect(registerElement).toHaveBeenCalledWith(element);
  });

  it('lets listeners handle editable registration without importing editor bundles', async () => {
    const element = document.createElement('div');
    const listener = jest.fn((event: Event) => {
      (event as CustomEvent<{ handled?: boolean }>).detail.handled = true;
    });
    document.addEventListener('ui:widget-editable-mounted', listener);

    await expect(registerEditableElement(element, 'testWidget')).resolves.toBe(true);
    expect(listener).toHaveBeenCalled();

    document.removeEventListener('ui:widget-editable-mounted', listener);
  });

  it('does nothing outside builder mode when no editor bridge exists', async () => {
    const element = document.createElement('div');

    await expect(registerEditableElement(element, 'testWidget')).resolves.toBe(false);
  });
});
