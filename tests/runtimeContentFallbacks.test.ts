/**
 * @jest-environment jsdom
 */

import {
  appendRuntimeEmptyState,
  appendRuntimeHtmlContent
} from '../ui/runtime/main/runtimeContentFallbacks';

describe('runtimeContentFallbacks', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('sanitizes appended html content and creates empty states', () => {
    const target = document.createElement('main');

    appendRuntimeHtmlContent(target, '<p>Safe</p><script>bad()</script>');
    appendRuntimeEmptyState(target);

    expect(target.innerHTML).toContain('<p>Safe</p>');
    expect(target.innerHTML).not.toContain('<script>');
    expect(target.querySelector('.empty-state')?.textContent).toBe('No widgets configured.');
  });
});
