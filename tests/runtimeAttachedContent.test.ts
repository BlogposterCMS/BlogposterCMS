/**
 * @jest-environment jsdom
 */

import {
  fetchRuntimeChildPages,
  fetchRuntimeDesign,
  fetchRuntimePageById
} from '../ui/runtime/main/runtimePageData';
import { renderAttachedRuntimeContent } from '../ui/runtime/main/runtimeAttachedContent';

jest.mock('../ui/runtime/main/runtimePageData', () => ({
  fetchRuntimeChildPages: jest.fn(),
  fetchRuntimeDesign: jest.fn(),
  fetchRuntimePageById: jest.fn(),
  loadRuntimeLayoutTemplate: jest.fn()
}));
jest.mock('../ui/runtime/main/runtimeStaticGrid', () => ({ renderStaticRuntimeGrid: jest.fn() }));

describe('runtimeAttachedContent', () => {
  it('preserves the container tree for an attached page using a top-level design id', async () => {
    const container = document.createElement('main');
    (fetchRuntimeChildPages as jest.Mock).mockResolvedValue([{ id: 'child', is_content: true }]);
    (fetchRuntimePageById as jest.Mock).mockResolvedValue({ id: 'child', design_id: 'body-design' });
    (fetchRuntimeDesign as jest.Mock).mockResolvedValue({ design: { layout: {
      type: 'split', nodeId: 'body', orientation: 'vertical', children: [
        { type: 'leaf', nodeId: 'cards', settings: { mode: 'grid', columns: 3 } }
      ]
    } }, widgets: [] });
    await renderAttachedRuntimeContent({ page: { id: 'parent' }, lane: 'public', allWidgets: [], container, emit: jest.fn() });
    expect(container.querySelector('.attached-content .runtime-design-document [data-node-id="cards"]')?.getAttribute('data-layout-mode')).toBe('grid');
  });
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
