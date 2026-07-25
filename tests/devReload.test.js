/**
 * @jest-environment jsdom
 */

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const {
  createDevReloadHub,
  filterReloadPaths,
  mapChangedFileToReloadPath
} = require('../mother/server/development/devReload');
const {
  injectDevBanner,
  injectDevReload
} = require('../mother/server/utils/text');

describe('development reload workflow', () => {
  const originalAppEnv = process.env.APP_ENV;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.APP_ENV = originalAppEnv;
    process.env.NODE_ENV = originalNodeEnv;
    document.head.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('maps only browser-served outputs and ignores source-only changes', () => {
    expect(
      mapChangedFileToReloadPath(
        rootDir,
        path.join(rootDir, 'apps', 'designer', 'assets', 'css', 'designer.css')
      )
    ).toBe('/apps/designer/assets/css/designer.css');
    expect(
      mapChangedFileToReloadPath(
        rootDir,
        path.join(rootDir, 'public', 'build', 'designer.js')
      )
    ).toBe('/build/designer.js');
    expect(
      mapChangedFileToReloadPath(
        rootDir,
        path.join(rootDir, 'apps', 'designer', 'assets', 'scss', '_canvas.scss')
      )
    ).toBeNull();
    expect(filterReloadPaths([
      '/build/designer.js',
      '/build/designer.js',
      '/assets/scss/site.scss'
    ])).toEqual(['/build/designer.js']);
  });

  it('publishes a session hello and one deduplicated change payload', () => {
    const request = new EventEmitter();
    const response = new EventEmitter();
    response.headers = {};
    response.chunks = [];
    response.setHeader = (name, value) => {
      response.headers[name] = value;
    };
    response.flushHeaders = jest.fn();
    response.write = chunk => {
      response.chunks.push(chunk);
      return true;
    };
    response.end = jest.fn();

    const hub = createDevReloadHub({ sessionId: 'session-test' });
    hub.connect(request, response);
    expect(response.headers['Content-Type']).toContain('text/event-stream');
    expect(response.chunks.join('')).toContain('event: hello');
    expect(response.chunks.join('')).toContain('"sessionId":"session-test"');

    response.chunks = [];
    expect(hub.publish(['/assets/css/site.css', '/assets/css/site.css'])).toBe(true);
    const changeMessage = response.chunks.join('');
    expect(changeMessage).toContain('event: change');
    expect(changeMessage).toContain('"/assets/css/site.css"');
    expect(changeMessage.match(/site\.css/g)).toHaveLength(1);

    request.emit('close');
    hub.close();
  });

  it('injects the existing dev banner in shells and reload-only code in app frames', () => {
    process.env.APP_ENV = 'development';
    process.env.NODE_ENV = 'development';
    const html = '<!doctype html><html><body></body></html>';

    expect(injectDevBanner(html)).toContain('/build/devBanner.js');
    expect(injectDevReload(html)).toContain('/build/devReload.js');
    expect(injectDevReload(injectDevReload(html)).match(/devReload\.js/g)).toHaveLength(1);

    process.env.APP_ENV = 'production';
    expect(injectDevReload(html)).toBe(html);
  });

  it('cache-busts only the stylesheet that changed', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { refreshChangedStylesheets } = require('../ui/shared/dev/devReloadClient');
    document.head.innerHTML = [
      '<link rel="stylesheet" href="/assets/css/site.css">',
      '<link rel="stylesheet" href="/apps/designer/assets/css/designer.css">'
    ].join('');

    const refreshed = refreshChangedStylesheets(
      ['/apps/designer/assets/css/designer.css'],
      'revision-7',
      document
    );
    const links = Array.from(document.querySelectorAll('link'));

    expect(refreshed).toBe(1);
    expect(links[0].href).not.toContain('__dev_reload');
    expect(links[1].href).toContain('__dev_reload=revision-7');
  });

  it('keeps npm dev on the coordinated watchers instead of raw nodemon', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    const nodemon = JSON.parse(fs.readFileSync(path.join(rootDir, 'nodemon.json'), 'utf8'));
    const webpackConfig = fs.readFileSync(path.join(rootDir, 'webpack.config.js'), 'utf8');

    expect(packageJson.scripts.dev).toBe('node tools/dev.js');
    expect(packageJson.scripts['dev:styles']).toContain('sass --watch');
    expect(packageJson.scripts['dev:browser']).toBe('webpack --watch --mode production');
    expect(packageJson.scripts.build).toContain('build:styles');
    expect(nodemon.watch).not.toContain('public');
    expect(nodemon.watch).not.toContain('apps');
    expect(webpackConfig).toContain("devReload: resolveSource(__dirname, './ui/shared/entries/devReload')");
  });
});
