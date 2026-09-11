import { readBoolean, readNumber, readString, type LooseRecord } from './publicWidgetHelpers.js';

/** Shared instance settings for the public renderer, Studio inspector and agents. */
export function navigationSettings(widgetId: string, raw: LooseRecord = {}): LooseRecord {
  const choice = (key: string, values: string[], fallback: string) => {
    const value = readString(raw, [key], fallback);
    return values.includes(value) ? value : fallback;
  };
  const number = (key: string, min: number, max: number, fallback: number) =>
    Math.max(min, Math.min(max, Math.round(readNumber(raw, [key], fallback))));
  const common = {
    fontSize: number('fontSize', 11, 28, 14),
    gap: number('gap', 0, 48, widgetId === 'breadcrumb' ? 8 : 12),
    alignment: choice('alignment', ['start', 'center', 'end'], 'start')
  };
  if (widgetId === 'breadcrumb') return {
    ...common,
    source: choice('source', ['pages', 'path'], 'pages'),
    homeLabel: readString(raw, ['homeLabel'], 'Home').slice(0, 100),
    homeHref: readString(raw, ['homeHref'], '/').slice(0, 500),
    showHome: readBoolean(raw, ['showHome'], true),
    separator: readString(raw, ['separator'], '/').slice(0, 4),
    previewPath: readString(raw, ['previewPath']).slice(0, 500)
  };
  return {
    ...common,
    locationKey: readString(raw, ['locationKey', 'location'], 'primary').slice(0, 100),
    orientation: choice('orientation', ['horizontal', 'vertical'], 'horizontal'),
    appearance: choice('appearance', ['plain', 'soft', 'underline'], 'soft'),
    submenu: choice('submenu', ['disclosure', 'expanded'], 'disclosure'),
    maxDepth: number('maxDepth', 1, 4, 3),
    mobileCollapse: readBoolean(raw, ['mobileCollapse'], true),
    mobileLabel: readString(raw, ['mobileLabel'], 'Menu').slice(0, 100),
    radius: number('radius', 0, 24, 8)
  };
}

/** A deliberate source change must also replace localized inline link overrides. */
export function applyNavigationSource(meta: LooseRecord, patch: LooseRecord): LooseRecord {
  const source = 'locationKey' in patch ? 'locationKey' : 'source' in patch ? 'source' : null;
  if (!source) return meta;
  const overrides = source === 'locationKey'
    ? { locationKey: meta.locationKey, items: [], links: [] }
    : { source: meta.source, items: [], trail: [] };
  const translations = meta.translations;
  return {
    ...meta, ...overrides,
    ...(translations && typeof translations === 'object' && !Array.isArray(translations) ? {
      translations: Object.fromEntries(Object.entries(translations).map(([locale, value]) => [locale,
        value && typeof value === 'object' && !Array.isArray(value) ? { ...value, ...overrides } : value
      ]))
    } : {})
  };
}

export function applyNavigationStyle(el: HTMLElement, settings: LooseRecord): void {
  el.style.fontSize = `${settings.fontSize}px`;
  el.style.setProperty('--bp-nav-gap', `${settings.gap}px`);
  el.style.setProperty('--bp-nav-radius', `${settings.radius ?? 0}px`);
  el.style.setProperty('--bp-nav-align', settings.alignment === 'center' ? 'center' : settings.alignment === 'end' ? 'flex-end' : 'flex-start');
}

/** Hash-only links are sections, not the active page. Match complete same-origin paths. */
export function isCurrentNavigationLink(href: string, pathname = window.location.pathname): boolean {
  try {
    if (!href || href.startsWith('#')) return false;
    const target = new URL(href, window.location.origin);
    return target.origin === window.location.origin && !target.hash &&
      target.pathname.replace(/\/+$/u, '') === pathname.replace(/\/+$/u, '');
  } catch { return false; }
}
