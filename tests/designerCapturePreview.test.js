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
});
