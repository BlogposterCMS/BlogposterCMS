import { normalizeMediaUrl, readString, renderWidgetMessage } from './publicWidgetHelpers.js';

const pendingRenders = new WeakMap<HTMLElement, object>();

/** Lifecycle hooks also clean up when a widget is removed from a Shadow DOM. */
class SiteLogoElement extends HTMLElement {
  lightUrl = '';
  darkUrl = '';
  private observer?: MutationObserver;
  private scheme?: MediaQueryList;

  private updateLogo = (): void => {
    const theme = this.ownerDocument.documentElement.dataset.theme;
    const dark = theme === 'dark' || (theme !== 'light' && Boolean(this.scheme?.matches));
    const img = this.querySelector('img');
    if (img) img.setAttribute('src', (dark ? this.darkUrl : this.lightUrl) || this.lightUrl || this.darkUrl);
    this.dataset.logoVariant = dark && this.darkUrl ? 'dark' : this.lightUrl ? 'light' : 'dark';
  };

  connectedCallback(): void {
    this.scheme = this.ownerDocument.defaultView?.matchMedia?.('(prefers-color-scheme: dark)');
    this.scheme?.addEventListener('change', this.updateLogo);
    this.observer = new MutationObserver(this.updateLogo);
    this.observer.observe(this.ownerDocument.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    this.updateLogo();
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
    this.scheme?.removeEventListener('change', this.updateLogo);
  }
}

if (!customElements.get('bp-site-logo')) customElements.define('bp-site-logo', SiteLogoElement);

/** Settings remain authoritative: saved widget metadata never captures a logo URL. */
export async function render(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  const request = {};
  pendingRenders.set(el, request);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('/api/public/settings?keys=SITE_LOGO_URL,SITE_LOGO_DARK_URL,SITE_TITLE', {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal
    });
    if (!response.ok) throw new Error('BP_WIDGET_LOGO_SETTINGS_FAILED');
    const body = await response.json();
    if (!body?.settings || typeof body.settings !== 'object' || Array.isArray(body.settings)) {
      throw new Error('BP_WIDGET_LOGO_SETTINGS_INVALID');
    }
    if (pendingRenders.get(el) !== request) return;
    const lightUrl = normalizeMediaUrl(body.settings.SITE_LOGO_URL);
    const darkUrl = normalizeMediaUrl(body.settings.SITE_LOGO_DARK_URL);
    if (!lightUrl && !darkUrl) {
      renderWidgetMessage(el, 'BP_WIDGET_LOGO_EMPTY', 'Logo missing', 'Choose a website logo in Settings → Design → Branding.');
      return;
    }

    const logo = document.createElement('bp-site-logo') as SiteLogoElement;
    logo.lightUrl = lightUrl;
    logo.darkUrl = darkUrl;
    logo.style.cssText = 'display:block;width:100%;height:100%;min-width:0;min-height:0;';
    const img = document.createElement('img');
    img.src = lightUrl || darkUrl;
    img.alt = readString(body.settings, ['SITE_TITLE'], 'Website logo');
    img.decoding = 'async';
    // A logo must retain its proportions and transparency at any canvas size.
    img.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain;';
    img.addEventListener('error', () => {
      logo.dataset.errorCode = 'BP_WIDGET_LOGO_IMAGE_FAILED';
    });
    img.addEventListener('load', () => { delete logo.dataset.errorCode; });
    logo.appendChild(img);
    el.replaceChildren(logo);
  } catch (err) {
    if (pendingRenders.get(el) !== request) return;
    const code = err instanceof Error && err.message === 'BP_WIDGET_LOGO_SETTINGS_INVALID'
      ? err.message : 'BP_WIDGET_LOGO_SETTINGS_FAILED';
    renderWidgetMessage(el, code, 'Logo unavailable', 'The website logo settings could not be loaded.');
  } finally {
    window.clearTimeout(timeout);
  }
}
