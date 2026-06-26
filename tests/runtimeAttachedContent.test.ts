/**
 * @jest-environment jsdom
 */

import {
  fetchRuntimeChildPages,
  fetchRuntimePageById
} from '../ui/runtime/main/runtimePageData';
import { renderAttachedRuntimeContent } from '../ui/runtime/main/runtimeAttachedContent';

jest.mock('../ui/runtime/main/runtimePageData', () => ({
  fetchRuntimeChildPages: jest.fn(),
  fetchRuntimeDesign: jest.fn(),
  fetchRuntimePageById: jest.fn(),
  loadRuntimeLayoutTemplate: jest.fn()
}));

describe('runtimeAttachedContent', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
    (fetchRuntimeChildPages as jest.Mock).mockResolvedValue([]);
    (fetchRuntimePageById as jest.Mock).mockResolvedValue(null);
  });

  it('loads only attached content children and sanitizes their html', async () => {
    const container = document.createElement('main');
    const emit = jest.fn().mockResolvedValue(undefined);
    (fetchRuntimeChildPages as jest.Mock).mockResolvedValue([
      { id: 'visible', is_content: true },
      { id: 'skip', is_content: false }
    ]);
    (fetchRuntimePageById as jest.Mock).mockResolvedValue({
      id: 'visible',
      html: '<h2>Child</h2><script>bad()</script>',
      meta: {}
    });

    await renderAttachedRuntimeContent({
      page: { id: 'parent' },
      lane: 'public',
      allWidgets: [],
      container,
      emit,
      widgetEmit: emit
    });

    expect(fetchRuntimePageById).toHaveBeenCalledTimes(1);
    expect(fetchRuntimePageById).toHaveBeenCalledWith(emit, 'visible', 'public');
    expect(container.querySelectorAll('.attached-content')).toHaveLength(1);
    expect(container.innerHTML).toContain('<h2>Child</h2>');
    expect(container.innerHTML).not.toContain('<script>');
  });
});
