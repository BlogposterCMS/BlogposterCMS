/**
 * @jest-environment jsdom
 */

import { executeJs } from '../ui/shared/scripts/executeJs';
import { renderWidgetInlineCode } from '../ui/widgets/rendering/widgetInlineCode';

jest.mock('../ui/shared/scripts/executeJs', () => ({
  executeJs: jest.fn()
}));

describe('widgetInlineCode', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('sanitizes html, appends css, and executes custom js with widget context', () => {
    const wrapper = document.createElement('div');
    const content = document.createElement('div');
    const container = document.createElement('div');
    content.appendChild(container);
    document.body.append(wrapper, content);

    renderWidgetInlineCode(wrapper, content, container, {
      html: '<img src=x onerror="alert(1)"><p>Hello</p>',
      css: '.widget { color: red; }',
      js: 'window.__loaded = true;'
    }, 'Widget');

    expect(container.innerHTML).toContain('<p>Hello</p>');
    expect(container.innerHTML).not.toContain('onerror');
    expect(content.querySelector('style')?.textContent).toBe('.widget { color: red; }');
    expect(executeJs).toHaveBeenCalledWith(
      'window.__loaded = true;',
      wrapper,
      content,
      'Widget'
    );
  });

  it('logs custom js failures without throwing', () => {
    const wrapper = document.createElement('div');
    const content = document.createElement('div');
    const container = document.createElement('div');
    const error = new Error('boom');
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (executeJs as jest.Mock).mockImplementation(() => {
      throw error;
    });

    expect(() => renderWidgetInlineCode(wrapper, content, container, {
      js: 'throw new Error("boom")'
    }, 'Widget')).not.toThrow();

    expect(consoleError).toHaveBeenCalledWith('[Widget] custom js error', error);
  });
});
