/**
 * @jest-environment jsdom
 */

import { executeJs } from '../ui/shared/scripts/executeJs';
import { renderInlineWidgetCode } from '../ui/runtime/main/runtimeWidgetInlineCode';

jest.mock('../ui/shared/scripts/executeJs', () => ({
  executeJs: jest.fn()
}));

describe('runtimeWidgetInlineCode', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('sanitizes inline html, appends css, and executes custom js in renderer context', () => {
    const wrapper = document.createElement('div');
    document.body.appendChild(wrapper);
    const root = wrapper.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    root.appendChild(container);

    renderInlineWidgetCode(wrapper, root, container, {
      html: '<img src=x onerror="alert(1)"><p>Safe</p>',
      css: '.widget-container { color: red; }',
      js: 'window.__ran = true;'
    });

    expect(container.innerHTML).toContain('<p>Safe</p>');
    expect(container.innerHTML).not.toContain('onerror');
    expect(root.querySelector('style')?.textContent).toContain('color: red');
    expect(executeJs).toHaveBeenCalledWith(
      'window.__ran = true;',
      wrapper,
      root,
      'Renderer'
    );
  });
});
