/**
 * @jest-environment jsdom
 */

jest.mock('../apps/designer/utils.js', () => ({
  executeJs: jest.fn(),
}));

jest.mock('../apps/designer/renderer/layoutRender.js', () => ({
  renderLayoutTree: jest.fn(),
}));

const { renderPage, canExecuteCustomJs } = require('../apps/designer/runtime/pageLoader.js');
const { executeJs } = require('../apps/designer/utils.js');
const { renderLayoutTree } = require('../apps/designer/renderer/layoutRender.js');
const { sanitizeHtml } = require('../public/plainspace/sanitizer.js');

describe('renderPage sanitization', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.ADMIN_TOKEN = 'test-admin-token';
    delete window.PUBLIC_TOKEN;
    window.NONCE = 'test-nonce';
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    renderLayoutTree.mockImplementation((tree, mountEl) => {
      mountEl.replaceChildren();
      const staticEl = document.createElement('div');
      staticEl.dataset.nodeId = '1';
      const hostEl = document.createElement('div');
      hostEl.dataset.nodeId = '2';
      mountEl.append(staticEl, hostEl);
      return new Map([
        ['1', staticEl],
        ['2', hostEl],
      ]);
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    console.warn.mockRestore();
    console.error.mockRestore();
  });

  test('sanitizes injected HTML and only runs trusted custom JS', async () => {
    const layoutTree = {
      type: 'split',
      children: [
        { type: 'leaf', nodeId: 1, designRef: 'static-1' },
        { type: 'leaf', nodeId: 2, isDynamicHost: true },
      ],
    };

    const staticDesign = {
      html: '<div id="static" onclick="alert(1)">Static<style>.bad{background:url("javascript:alert(1)");}</style></div>',
      js: 'window.__staticExecuted = true;',
      allowCustomJs: true,
    };

    const pageDesign = {
      html: '<div id="dynamic" style="background:url(javascript:alert(2))"><script>bad()</script>Dynamic</div>',
      js: 'window.__dynamicExecuted = true;',
    };

    window.meltdownEmit = jest.fn(async (event, payload) => {
      switch (event) {
        case 'getPageById':
          return { data: { layout_id: 'layout-1', design_id: 'page-design', auto_mount: true } };
        case 'getSiteMeta':
          return {};
        case 'getLayoutTemplate':
          return { layout: layoutTree };
        case 'designer.getDesign':
          if (payload.id === 'static-1') return { design: staticDesign };
          if (payload.id === 'page-design') return { design: pageDesign };
          return null;
        default:
          throw new Error(`Unexpected event ${event}`);
      }
    });

    const mountEl = document.createElement('div');
    document.body.appendChild(mountEl);

    await renderPage('page-1', mountEl);

    expect(renderLayoutTree).toHaveBeenCalled();
    expect(mountEl.innerHTML).toContain('data-node-id="1"');

    const staticContainer = mountEl.querySelector('[data-node-id="1"]');
    expect(staticContainer).not.toBeNull();
    expect(staticContainer.querySelector('script')).toBeNull();
    expect(staticContainer.getAttribute('onclick')).toBeNull();
    const staticStyle = staticContainer.querySelector('style');
    expect(staticStyle).not.toBeNull();
    expect(staticStyle.textContent).not.toMatch(/javascript/i);
    expect(staticContainer.innerHTML).toContain('Static');

    const hostContainer = mountEl.querySelector('[data-node-id="2"]');
    expect(hostContainer).not.toBeNull();
    expect(hostContainer.querySelector('script')).toBeNull();
    const hostContent = hostContainer.querySelector('#dynamic');
    expect(hostContent).not.toBeNull();
    expect(hostContent.getAttribute('style') || '').not.toMatch(/javascript/i);

    expect(executeJs).toHaveBeenCalledTimes(1);
    expect(executeJs).toHaveBeenCalledWith(staticDesign.js, staticContainer, staticContainer);
  });

  test('canExecuteCustomJs checks trust flags on design metadata', () => {
    expect(canExecuteCustomJs({ allowCustomJs: true })).toBe(true);
    expect(canExecuteCustomJs({ allow_custom_js: '1' })).toBe(true);
    expect(canExecuteCustomJs({ allow_custom_js: 'true' })).toBe(true);
    expect(canExecuteCustomJs({ trusted: 0 })).toBe(false);
    expect(canExecuteCustomJs({ trusted: 'false' })).toBe(false);
    expect(canExecuteCustomJs({ trusted_js: '0' })).toBe(false);
    expect(canExecuteCustomJs({ metadata: { trusted_author: true } })).toBe(true);
    expect(canExecuteCustomJs({ metadata: { trusted_author: 'no' } })).toBe(false);
    expect(canExecuteCustomJs(null)).toBe(false);
  });
});

describe('sanitizeHtml', () => {
  test('removes script tags, handlers and unsafe URLs', () => {
    const dirty = '<div onclick="evil()" style="background:url(javascript:alert(1))">X<script src="/bad.js"></script></div>' +
      '<style>@import "javascript:alert(1)"; .ok{color:red}</style>';
    const cleaned = sanitizeHtml(dirty);
    expect(cleaned).not.toContain('<script');
    expect(cleaned).not.toContain('onclick');
    expect(cleaned).not.toMatch(/javascript:/i);
    expect(cleaned).toContain('color:red');
  });
});
