/**
 * @jest-environment jsdom
 */

jest.mock('/ui/runtime/main/script-utils.js', () => ({
  executeJs: jest.fn(),
}), { virtual: true });

const { executeJs } = require('/ui/runtime/main/script-utils.js');
const { loadHtml, __setLoaderTestDeps } = require('../mother/modules/pagesManager/publicLoader.js');

describe('pagesManager public html loader security', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    document.head.innerHTML = '';
    delete (window as any).NONCE;
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
    __setLoaderTestDeps({ reset: true });
  });

  afterEach(() => {
    (console.error as jest.Mock).mockRestore();
  });

  test('blocks untrusted html rendering when sanitizer is unavailable', async () => {
    __setLoaderTestDeps({
      sanitizerImporter: async () => {
        throw new Error('missing sanitizer');
      },
    });

    await loadHtml({
      inline: {
        html: '<img src=x onerror=alert(1)><script>alert(1)</script>',
      },
    });

    const root = document.getElementById('app') as HTMLElement;
    expect(root.innerHTML).not.toContain('<script');
    expect(root.innerHTML).not.toContain('onerror=');
    const placeholder = root.querySelector('[data-blocked-reason="sanitizer-unavailable"]');
    expect(placeholder).not.toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[HTML Loader] SANITIZER_IMPORT_FAILED'),
      expect.objectContaining({ event: 'SANITIZER_IMPORT_FAILED' }),
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[HTML Loader] UNTRUSTED_HTML_BLOCKED'),
      expect.objectContaining({ event: 'UNTRUSTED_HTML_BLOCKED' }),
    );
  });

  test('gates inline js execution on nonce presence', async () => {
    __setLoaderTestDeps({
      sanitizeHtml: (value: string) => value,
    });

    await loadHtml({
      inline: { js: 'window.__ran = true;' },
    });

    expect(executeJs).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[HTML Loader] INLINE_JS_BLOCKED_MISSING_NONCE'),
      expect.objectContaining({ event: 'INLINE_JS_BLOCKED_MISSING_NONCE' }),
    );

    (window as any).NONCE = 'test-nonce';

    await loadHtml({
      inline: { js: 'window.__ran = true;' },
    });

    expect(executeJs).toHaveBeenCalledWith('window.__ran = true;', expect.any(HTMLElement), expect.any(HTMLElement), 'HTML Loader');
  });

  test('skips fallback html when a linked design layout rendered widgets', async () => {
    __setLoaderTestDeps({
      sanitizeHtml: (value: string) => value,
    });

    await loadHtml(
      {
        fallbackOnly: true,
        inline: {
          html: '<section>Fallback page</section>',
        },
      },
      {
        activeLayout: {
          items: [{ widgetId: 'hero', instanceId: 'hero-1' }],
        },
      }
    );

    expect(document.getElementById('app')?.innerHTML).toBe('');
  });
});
