/**
 * @jest-environment jsdom
 */

import {
  fetchPartialSafe,
  hydrateRuntimeShellPartials
} from '../ui/runtime/main/runtimeShellPartials';

describe('runtimeShellPartials', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    delete window.fetchWithTimeout;
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete window.fetchWithTimeout;
  });

  it('loads partials through the shared loader and returns an empty fallback on failure', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchWithTimeout = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<header>ok</header>'
      })
      .mockRejectedValueOnce(new Error('network down'));
    window.fetchWithTimeout = fetchWithTimeout;

    await expect(fetchPartialSafe('../top-header', 'admin')).resolves.toBe('<header>ok</header>');
    expect(fetchWithTimeout).toHaveBeenCalledWith('/plainspace/partials/admin/top-header.html');

    await expect(fetchPartialSafe('missing', 'admin')).resolves.toBe('');
    expect(error).toHaveBeenCalledWith(
      '[Renderer] failed to load partial admin/missing',
      expect.objectContaining({ message: 'network down' })
    );
  });

  it('hydrates runtime shell partials, sanitizes markup, and dispatches load events', async () => {
    document.body.innerHTML = `
      <header id="top-header"></header>
      <header id="main-header"></header>
      <main id="content"><div id="content-header"></div></main>
      <aside id="sidebar"></aside>
    `;
    const fetchWithTimeout = jest.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => '<span>Top</span><script>bad()</script>' })
      .mockResolvedValueOnce({ ok: true, text: async () => '<span>Main</span>' })
      .mockResolvedValueOnce({ ok: true, text: async () => '<span>Content</span>' })
      .mockResolvedValueOnce({ ok: true, text: async () => '<span>Side</span>' });
    window.fetchWithTimeout = fetchWithTimeout;
    const events: string[] = [];
    [
      'top-header-loaded',
      'main-header-loaded',
      'content-header-loaded',
      'sidebar-loaded'
    ].forEach(eventName => {
      document.addEventListener(eventName, () => events.push(eventName));
    });

    await hydrateRuntimeShellPartials({
      layout: {
        header: 'custom-top',
        mainHeader: 'custom-main',
        contentHeader: 'custom-content',
        sidebar: 'custom-side'
      }
    });

    expect(fetchWithTimeout).toHaveBeenNthCalledWith(1, '/plainspace/partials/custom-top.html');
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(2, '/plainspace/partials/custom-main.html');
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(3, '/plainspace/partials/custom-content.html');
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(4, '/plainspace/partials/custom-side.html');
    expect(document.getElementById('top-header')?.innerHTML).toBe('<span>Top</span>');
    expect(document.getElementById('main-header')?.innerHTML).toBe('<span>Main</span>');
    expect(document.getElementById('content-header')?.innerHTML).toBe('<span>Content</span>');
    expect(document.getElementById('sidebar')?.innerHTML).toBe('<span>Side</span>');
    expect(document.body.innerHTML).not.toContain('<script>');
    expect(events).toEqual([
      'top-header-loaded',
      'main-header-loaded',
      'content-header-loaded',
      'sidebar-loaded'
    ]);
  });

  it('hydrates content header and syncs changed sidebars in content-only mode', async () => {
    document.body.innerHTML = `
      <header id="top-header">keep top</header>
      <header id="main-header">keep main</header>
      <main id="content"><div id="content-header">old content</div></main>
      <aside id="sidebar">keep side</aside>
    `;
    const fetchWithTimeout = jest.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => '<span>Content Only</span>' })
      .mockResolvedValueOnce({ ok: true, text: async () => '<nav>New side</nav>' });
    window.fetchWithTimeout = fetchWithTimeout;
    const events: string[] = [];
    [
      'top-header-loaded',
      'main-header-loaded',
      'content-header-loaded',
      'sidebar-loaded'
    ].forEach(eventName => {
      document.addEventListener(eventName, () => events.push(eventName));
    });

    await hydrateRuntimeShellPartials({
      layout: {
        header: 'custom-top',
        mainHeader: 'custom-main',
        contentHeader: 'custom-content',
        sidebar: 'custom-side'
      }
    }, { mode: 'content-only' });

    expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(1, '/plainspace/partials/custom-content.html');
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(2, '/plainspace/partials/custom-side.html');
    expect(document.getElementById('top-header')?.innerHTML).toBe('keep top');
    expect(document.getElementById('main-header')?.innerHTML).toBe('keep main');
    expect(document.getElementById('content-header')?.innerHTML).toBe('<span>Content Only</span>');
    expect(document.getElementById('sidebar')?.innerHTML).toBe('<nav>New side</nav>');
    expect(document.getElementById('sidebar')?.dataset.partialName).toBe('custom-side');
    expect(events).toEqual(['content-header-loaded', 'sidebar-loaded']);
  });

  it('hides an existing sidebar during content-only navigation to empty-sidebar pages', async () => {
    document.body.innerHTML = `
      <main id="content"><div id="content-header">old content</div></main>
      <aside id="sidebar" data-partial-name="default-sidebar">old side</aside>
    `;
    const fetchWithTimeout = jest.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => '<span>Editor</span>' });
    window.fetchWithTimeout = fetchWithTimeout;

    await hydrateRuntimeShellPartials({
      layout: {
        contentHeader: 'content-header',
        sidebar: 'empty-sidebar'
      }
    }, { mode: 'content-only' });

    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
    expect(fetchWithTimeout).toHaveBeenCalledWith('/plainspace/partials/content-header.html');
    expect(document.getElementById('content-header')?.innerHTML).toBe('<span>Editor</span>');
    expect(document.getElementById('sidebar')?.innerHTML).toBe('');
    expect(document.getElementById('sidebar')?.style.display).toBe('none');
    expect(document.getElementById('sidebar')?.dataset.partialName).toBe('empty-sidebar');
  });

  it('clears inherited main header and hides sidebar for isolated admin layouts', async () => {
    document.body.innerHTML = `
      <header id="main-header">old</header>
      <main id="content"><div id="content-header"></div></main>
      <aside id="sidebar">old</aside>
    `;
    window.fetchWithTimeout = jest.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => '<span>Content</span>' });

    await hydrateRuntimeShellPartials({
      layout: {
        inheritsLayout: false
      }
    });

    expect(document.getElementById('main-header')?.innerHTML).toBe('');
    expect(document.getElementById('content-header')?.innerHTML).toBe('<span>Content</span>');
    expect(document.getElementById('sidebar')?.innerHTML).toBe('');
    expect(document.getElementById('sidebar')?.style.display).toBe('none');
  });
});
