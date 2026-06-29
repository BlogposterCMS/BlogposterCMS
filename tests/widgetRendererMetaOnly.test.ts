/**
 * @jest-environment jsdom
 */

import { renderWidget } from '../ui/widgets/rendering/widgetRenderer';
import { loadWidgetModule } from '../ui/widgets/rendering/widgetModuleLoader';

jest.mock('../ui/widgets/rendering/widgetModuleLoader', () => ({
  loadWidgetModule: jest.fn()
}));

describe('widgetRenderer metadata-only data', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    jest.clearAllMocks();
  });

  it('renders widget modules when instance data only contains metadata', async () => {
    const wrapper = document.createElement('div');
    wrapper.dataset.instanceId = 'gallery-1';
    const content = document.createElement('div');
    content.className = 'canvas-item-content';
    wrapper.appendChild(content);
    document.body.appendChild(wrapper);

    const render = jest.fn();
    (loadWidgetModule as jest.Mock).mockResolvedValue({ render });

    await renderWidget(wrapper, {
      id: 'gallery',
      metadata: { label: 'Gallery' },
      codeUrl: '/ui/widgets/plainspace/public/basicwidgets/galleryWidget.js'
    }, {
      'gallery-1': {
        meta: {
          mode: 'masonry',
          rows: 2
        }
      }
    });

    expect(render).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({
      id: 'gallery-1',
      widgetId: 'gallery',
      metadata: { label: 'Gallery' },
      instanceMetadata: {
        mode: 'masonry',
        rows: 2
      }
    }));
  });
});
