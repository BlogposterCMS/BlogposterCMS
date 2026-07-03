/**
 * @jest-environment jsdom
 */

describe('designer preview capture', () => {
  afterEach(() => {
    jest.resetModules();
    jest.restoreAllMocks();
  });

  test('skips capture when sandboxed stylesheets cannot expose cssRules', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    Object.defineProperty(document, 'styleSheets', {
      configurable: true,
      value: [
        {
          get cssRules() {
            throw Object.assign(new Error('Cannot access rules'), { name: 'SecurityError' });
          }
        }
      ]
    });
    const gridEl = document.createElement('div');
    const { capturePreview } = await import('../ui/designer/app/renderer/capturePreview.js');

    await expect(capturePreview(gridEl)).resolves.toBe('');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test('captures the visible viewport region for thumbnail previews', async () => {
    const toPng = jest.fn(() => Promise.resolve('data:image/png;base64,thumb'));
    jest.doMock('html-to-image', () => ({ toPng }));
    Object.defineProperty(document, 'styleSheets', {
      configurable: true,
      value: []
    });
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 800
    });
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 600
    });

    const gridEl = document.createElement('div');
    gridEl.getBoundingClientRect = () => ({
      left: -100,
      top: 50,
      right: 1900,
      bottom: 1450,
      width: 2000,
      height: 1400
    });
    const { capturePreview } = await import('../ui/designer/app/renderer/capturePreview.js');

    await expect(capturePreview(gridEl, { viewport: true, maxWidth: 400, maxHeight: 300 }))
      .resolves.toBe('data:image/png;base64,thumb');

    expect(toPng).toHaveBeenCalledWith(gridEl, expect.objectContaining({
      cacheBust: true,
      width: 800,
      height: 550,
      canvasWidth: 400,
      canvasHeight: 275,
      style: {
        transformOrigin: 'top left',
        transform: 'translate(-100px, 0px)'
      }
    }));
  });
});
