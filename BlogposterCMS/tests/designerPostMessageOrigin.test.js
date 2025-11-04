/**
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');

jest.mock('../apps/designer/fetchPartial.js', () => ({
  fetchPartial: jest.fn(() => Promise.resolve('<div></div>'))
}));

jest.mock('../apps/designer/builderRenderer.js', () => ({
  initBuilder: jest.fn(() => Promise.resolve())
}));

jest.mock('../apps/designer/editor/editor.js', () => ({
  enableAutoEdit: jest.fn()
}));

jest.mock('../public/plainspace/sanitizer.js', () => ({
  sanitizeHtml: jest.fn(value => value)
}));

jest.mock('../apps/designer/managers/panelManager.js', () => ({
  initBuilderPanel: jest.fn()
}));

jest.mock('../public/assets/js/userColor.js', () => ({
  applyUserColor: jest.fn(() => Promise.resolve())
}));

describe('designer iframe origin handling', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    document.body.innerHTML = '';
    Object.defineProperty(document, 'readyState', {
      configurable: true,
      value: 'complete'
    });
    window.CSRF_TOKEN = undefined;
    window.ADMIN_TOKEN = undefined;
    window.parent.postMessage = jest.fn();
    window.history.replaceState(
      null,
      '',
      '?allowedOrigins=https://admin1.example.com,https://admin2.example.com'
    );
  });

  test('designer-ready reply targets the origin that delivered init tokens', async () => {
    document.body.innerHTML = `
      <div id="builderRow">
        <div id="sidebar"></div>
        <div id="content"></div>
        <div id="builderMain"></div>
      </div>
    `;

    loadDesignerApp();

    const initEvent = new window.MessageEvent('message', {
      data: {
        type: 'init-tokens',
        csrfToken: 'csrf-token',
        adminToken: 'admin-token',
        allowedOrigins: ['https://admin1.example.com', 'https://admin2.example.com']
      },
      origin: 'https://admin2.example.com'
    });

    window.dispatchEvent(initEvent);

    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(window.parent.postMessage).toHaveBeenCalledWith(
      { type: 'designer-ready' },
      'https://admin2.example.com'
    );
  });

  test('ignores init messages sent from a null origin', async () => {
    document.body.innerHTML = `
      <div id="builderRow">
        <div id="sidebar"></div>
        <div id="content"></div>
        <div id="builderMain"></div>
      </div>
    `;

    loadDesignerApp();

    const nullOriginEvent = new window.MessageEvent('message', {
      data: {
        type: 'init-tokens',
        csrfToken: 'csrf-token',
        adminToken: 'admin-token'
      },
      origin: 'null'
    });

    window.dispatchEvent(nullOriginEvent);

    await Promise.resolve();
    await Promise.resolve();

    expect(window.parent.postMessage).not.toHaveBeenCalled();
    expect(window.CSRF_TOKEN).toBeUndefined();
    expect(window.ADMIN_TOKEN).toBeUndefined();
  });
});
const loadDesignerApp = () => {
  const filePath = path.join(__dirname, '..', 'apps', 'designer', 'index.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const { code } = babel.transformSync(source, {
    filename: filePath,
    plugins: ['@babel/plugin-transform-modules-commonjs']
  });
  const localRequire = (request) => {
    const map = {
      './fetchPartial.js': '../apps/designer/fetchPartial.js',
      './builderRenderer.js': '../apps/designer/builderRenderer.js',
      './editor/editor.js': '../apps/designer/editor/editor.js',
      '../../public/plainspace/sanitizer.js': '../public/plainspace/sanitizer.js',
      './managers/panelManager.js': '../apps/designer/managers/panelManager.js',
      '../../public/assets/js/userColor.js': '../public/assets/js/userColor.js'
    };
    const mapped = map[request] || request;
    return require(mapped);
  };
  const moduleScope = { exports: {} };
  const dirname = path.dirname(filePath);
  const wrapper = new Function('exports', 'require', 'module', '__filename', '__dirname', code);
  wrapper(moduleScope.exports, localRequire, moduleScope, filePath, dirname);
  return moduleScope.exports;
};
