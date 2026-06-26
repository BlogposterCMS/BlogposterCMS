/**
 * @jest-environment jsdom
 */

import {
  clearContentKeepHeader,
  ensureGlobalStyle,
  ensureLayout,
  getGlobalCssUrl,
  resolveRuntimeShellConfig,
  sanitizeUrl
} from '../ui/runtime/main/runtimePageShell';

describe('runtimePageShell', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    delete window.ACTIVE_THEME;
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.ACTIVE_THEME;
  });

  it('resolves and installs lane-specific global styles once', () => {
    window.ACTIVE_THEME = 'midnight';

    expect(getGlobalCssUrl('public')).toBe('/themes/midnight/theme.css');
    expect(getGlobalCssUrl('admin')).toBe('/assets/css/site.css');

    ensureGlobalStyle('public');
    ensureGlobalStyle('public');

    const links = document.querySelectorAll('link[data-global-style="public"]');
    expect(links).toHaveLength(1);
    expect((links[0] as HTMLLinkElement).href).toContain('/themes/midnight/theme.css');
  });

  it('allows only same-origin absolute paths and http urls for media backgrounds', () => {
    expect(sanitizeUrl('/media/hero.jpg')).toBe('/media/hero.jpg');
    expect(sanitizeUrl('https://example.test/hero.jpg')).toBe('https://example.test/hero.jpg');
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeUrl('data:text/html,hi')).toBe('');
    expect(sanitizeUrl('/media/hero image.jpg')).toBe('');
  });

  it('preserves content header while clearing rendered page content', () => {
    const content = document.createElement('section');
    content.id = 'content';
    content.innerHTML = '<div id="content-header"></div><p>old</p>';

    clearContentKeepHeader(content);

    expect(content.children).toHaveLength(1);
    expect(content.firstElementChild?.id).toBe('content-header');
  });

  it('falls back to a sidebar-free shell for stale page editor seed metadata', () => {
    const config = resolveRuntimeShellConfig(
      { lane: 'admin', slug: 'pages/edit' },
      { widgets: ['pageEditorWidget'] },
      { lane: 'admin', slug: 'pages/edit' }
    );

    expect(config).toEqual({
      widgets: ['pageEditorWidget'],
      layout: { sidebar: 'empty-sidebar' }
    });
  });

  it('creates public and admin runtime layout shells', () => {
    ensureLayout({}, 'public');
    expect(document.querySelector('.app-scope')).not.toBeNull();
    expect(document.getElementById('content')).not.toBeNull();
    expect(document.getElementById('top-header')).toBeNull();

    document.body.innerHTML = '';
    ensureLayout({ sidebar: 'empty-sidebar' }, 'admin');

    expect(document.getElementById('top-header')).not.toBeNull();
    expect(document.getElementById('main-header')).not.toBeNull();
    expect(document.querySelector('.main-content')).not.toBeNull();
    expect(document.getElementById('content')).not.toBeNull();
    expect(document.getElementById('content-header')).not.toBeNull();
    expect(document.getElementById('sidebar')).toBeNull();
  });
});
