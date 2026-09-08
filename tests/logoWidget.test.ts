/** @jest-environment jsdom */
import { render } from '../ui/widgets/plainspace/public/basicwidgets/logoWidget';
const { DEFAULT_WIDGETS } = require('../mother/modules/plainSpace/config/defaultWidgets');

describe('settings-backed logo widget', () => {
  let host: HTMLElement;
  let scheme: EventTarget & { matches: boolean };
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    scheme = Object.assign(new EventTarget(), { matches: false });
    window.matchMedia = jest.fn().mockReturnValue(scheme);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ settings: {
      SITE_LOGO_URL: '/light.svg', SITE_LOGO_DARK_URL: '/dark.svg', SITE_TITLE: 'Example'
    } }) });
  });
  afterEach(() => {
    document.body.replaceChildren();
    delete document.documentElement.dataset.theme;
    jest.restoreAllMocks();
  });

  it('registers a real Media widget with no copied logo defaults', () => {
    expect(DEFAULT_WIDGETS.find((widget: any) => widget.widgetId === 'siteLogo')).toMatchObject({
      category: 'media', content: '/ui/widgets/plainspace/public/basicwidgets/logoWidget.js', metadata: { defaults: {} }
    });
  });

  it('loads saved branding and follows explicit and system theme changes', async () => {
    await render(host);
    const img = host.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('/light.svg');
    expect(img.alt).toBe('Example');
    expect(img.style.objectFit).toBe('contain');
    document.documentElement.dataset.theme = 'dark';
    await Promise.resolve();
    expect(img.getAttribute('src')).toBe('/dark.svg');
    document.documentElement.dataset.theme = 'light';
    scheme.matches = true;
    scheme.dispatchEvent(new Event('change'));
    expect(img.getAttribute('src')).toBe('/light.svg');
    delete document.documentElement.dataset.theme;
    await Promise.resolve();
    expect(img.getAttribute('src')).toBe('/dark.svg');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/public/settings?keys=SITE_LOGO_URL'), expect.objectContaining({ cache: 'no-store' }));
  });

  it('falls back to the available variant and reloads settings on render', async () => {
    (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ settings: { SITE_LOGO_URL: '/new.svg' } }) });
    document.documentElement.dataset.theme = 'dark';
    await render(host);
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/new.svg');
    (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ settings: { SITE_LOGO_DARK_URL: '/only-dark.svg' } }) });
    await render(host);
    expect(host.querySelector('img')?.getAttribute('src')).toBe('/only-dark.svg');
  });

  it('disconnects theme listeners when a shadow-root widget is removed', async () => {
    const remove = jest.spyOn(scheme, 'removeEventListener');
    const shadow = host.attachShadow({ mode: 'open' });
    const container = document.createElement('div');
    shadow.appendChild(container);
    await render(container);
    host.remove();
    expect(remove).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it.each([{}, { SITE_LOGO_URL: 'javascript:alert(1)' }])('reports missing or unsafe logos', async settings => {
    (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => ({ settings }) });
    await render(host);
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('[data-error-code="BP_WIDGET_LOGO_EMPTY"]')).not.toBeNull();
  });

  it('reports request and image failures', async () => {
    await render(host);
    host.querySelector('img')!.dispatchEvent(new Event('error'));
    expect(host.querySelector('[data-error-code="BP_WIDGET_LOGO_IMAGE_FAILED"]')).not.toBeNull();
    (fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    await render(host);
    expect(host.querySelector('[data-error-code="BP_WIDGET_LOGO_SETTINGS_FAILED"]')).not.toBeNull();
  });
});
