import type { AnalyticsConnector } from '../types.js';

type TagWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; [key: `ga-disable-${string}`]: boolean };
const tagWindow = window as unknown as TagWindow;
let started = false;

// Basic consent mode: no Google script/request before an explicit analytics grant.
// Live GA ingestion is UNTESTED; local tests only verify this adapter's gating.
export const googleAnalytics: AnalyticsConnector = {
  id: 'google-analytics', label: 'Google Analytics (GA4)', verification: 'UNTESTED — no live Google Analytics verification',
  start(config, nonce) {
    if (started || !config.googleEnabled || !/^G-[A-Z0-9]{4,20}$/.test(config.measurementId)) return;
    started = true;
    tagWindow[`ga-disable-${config.measurementId}`] = false;
    tagWindow.dataLayer ||= [];
    tagWindow.gtag = function () { tagWindow.dataLayer!.push(arguments); };
    tagWindow.gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
    tagWindow.gtag('consent', 'update', { analytics_storage: 'granted' });
    tagWindow.gtag('js', new Date());
    // Never send account/browser IDs or query strings through this connector.
    tagWindow.gtag('config', config.measurementId, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
      cookie_domain: 'none', cookie_expires: config.cookieDays * 86400 });
    let referrer = '';
    try { referrer = new URL(document.referrer).origin; } catch { /* No reliable referral. */ }
    tagWindow.gtag('event', 'page_view', { page_location: location.origin + location.pathname, page_referrer: referrer, page_title: document.title });
    const script = document.createElement('script'); script.id = 'bp-google-analytics'; script.async = true; script.nonce = nonce;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${config.measurementId}`;
    script.onerror = () => { document.dispatchEvent(new CustomEvent('bp:analytics-error', { detail: { code: 'ANALYTICS_GOOGLE_LOAD_FAILED' } })); };
    document.head.append(script);
  },
  stop(config) {
    if (!/^G-[A-Z0-9]{4,20}$/.test(config.measurementId)) return;
    tagWindow[`ga-disable-${config.measurementId}`] = true;
    document.getElementById('bp-google-analytics')?.remove();
    // Removal cannot unload executed third-party code. The consent UI reloads
    // after withdrawal to leave a clean document with no optional providers.
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.trim().split('=')[0] || '';
      if (/^_ga(?:_|$)/.test(name)) document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    }
  }
};
