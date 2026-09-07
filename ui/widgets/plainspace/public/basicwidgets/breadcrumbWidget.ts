import {
  normalizeNavigationItems,
  normalizeLinkUrl,
  readArray,
  readString,
  renderWidgetMessage,
  sharedStyle,
  widgetSettings,
  type NavigationItem,
  type PublicWidgetContext
} from './publicWidgetHelpers.js';
import { applyNavigationStyle, navigationSettings } from './navigationSettings.js';
import { loadBreadcrumbPages } from './breadcrumbData.js';

const renderRequests = new WeakMap<HTMLElement, object>();

function breadcrumbStyle(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
.bp-breadcrumb-widget ol {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bp-nav-gap, 8px);
  justify-content:var(--bp-nav-align, flex-start);
  margin: 0;
  padding: 0;
  color: var(--studio-text-muted);
  font-size: inherit;
  list-style: none;
}
.bp-breadcrumb-widget li {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.bp-breadcrumb-widget a {
  color: inherit;
  text-decoration: none;
}
.bp-breadcrumb-widget a:hover,
.bp-breadcrumb-widget a:focus-visible {
  color: var(--color-primary);
}
.bp-breadcrumb-widget [aria-current="page"] {
  color: var(--studio-text);
  font-weight: 650;
}
  `.trim();
  return style;
}

function titleFromSegment(segment: string): string {
  return segment
    .replace(/[-_]+/gu, ' ')
    .replace(/\b\w/gu, char => char.toUpperCase());
}

function fallbackItems(homeLabel: string, pathname: string): NavigationItem[] {
  const segments = pathname.split('/').filter(Boolean);
  const items: NavigationItem[] = [{ label: homeLabel, href: '/', children: [] }];
  let path = '';
  segments.forEach(segment => {
    path += `/${segment}`;
    let label = segment;
    try { label = decodeURIComponent(segment); } catch { /* Keep malformed URLs readable. */ }
    items.push({ label: titleFromSegment(label), href: path, children: [] });
  });
  return items;
}

export async function render(el: HTMLElement | null, ctx: PublicWidgetContext = {}): Promise<void> {
  if (!el) return;
  const request = {};
  renderRequests.set(el, request);
  delete el.dataset.warningCode;
  const raw = widgetSettings(ctx);
  const settings = { ...raw, ...navigationSettings('breadcrumb', raw) };
  const items = normalizeNavigationItems(readArray(settings, ['items', 'trail']));
  // Preview URLs are authoring hints only. Public pages always use their actual URL.
  const inStudio = document.body.classList.contains('builder-mode');
  const path = inStudio ? String(settings.previewPath || '/') : window.location.pathname;
  const homeLabel = String(settings.homeLabel);
  const homeHref = normalizeLinkUrl(settings.homeHref) || '/';
  const prepare = (source: NavigationItem[]) => {
    const rootIndex = source.findIndex(item => item.href === homeHref);
    const trail = rootIndex >= 0 ? source.slice(rootIndex + 1) : source.filter(item => item.href !== '/');
    return settings.showHome ? [{ label: homeLabel, href: homeHref, children: [] }, ...trail] : trail;
  };
  const paint = (source: NavigationItem[]) => {
    const trail = items.length ? source : prepare(source);

    if (!trail.length) {
      if (!settings.showHome) { el.replaceChildren(); return; }
      renderWidgetMessage(el, 'BP_WIDGET_BREADCRUMB_EMPTY', 'Breadcrumb empty', 'Add breadcrumb items or render on a public path.');
      return;
    }

    const nav = document.createElement('nav');
    nav.className = 'bp-public-widget bp-breadcrumb-widget';
    applyNavigationStyle(nav, settings);
    nav.setAttribute('aria-label', readString(settings, ['ariaLabel', 'label'], 'Breadcrumb'));
    const list = document.createElement('ol');
    const separator = readString(settings, ['separator'], '/');

    trail.forEach((item, index) => {
      const row = document.createElement('li');
      if (index > 0) {
        const sep = document.createElement('span');
        sep.setAttribute('aria-hidden', 'true');
        sep.textContent = separator;
        row.appendChild(sep);
      }
      if (index === trail.length - 1) {
        const current = document.createElement('span');
        current.setAttribute('aria-current', 'page');
        current.textContent = item.label;
        row.appendChild(current);
      } else {
        const link = document.createElement('a');
        link.href = item.href;
        link.textContent = item.label;
        row.appendChild(link);
      }
      list.appendChild(row);
    });

    nav.appendChild(list);
    el.replaceChildren(sharedStyle(), breadcrumbStyle(), nav);
  };
  paint(items.length ? items : fallbackItems(homeLabel, path));
  if (items.length || settings.source === 'path') return;
  try {
    const trail = await loadBreadcrumbPages(path, ctx);
    if (renderRequests.get(el) === request && trail?.length) paint(trail);
  } catch (error) {
    // The path remains usable if a page disappears or its public ancestry fails.
    if (renderRequests.get(el) !== request) return;
    el.dataset.warningCode = 'BP_WIDGET_BREADCRUMB_PAGES_UNAVAILABLE';
    console.warn('BP_WIDGET_BREADCRUMB_PAGES_UNAVAILABLE', error);
  }
}
