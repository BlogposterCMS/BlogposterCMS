import { currentPathSegments, normalizeNavigationItems, readArray, readString, renderWidgetMessage, sharedStyle, widgetSettings } from './publicWidgetHelpers.js';
function breadcrumbStyle() {
    const style = document.createElement('style');
    style.textContent = `
.bp-breadcrumb-widget ol {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  color: var(--studio-text-muted);
  font-size: 0.875rem;
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
function titleFromSegment(segment) {
    return segment
        .replace(/[-_]+/gu, ' ')
        .replace(/\b\w/gu, char => char.toUpperCase());
}
function fallbackItems(homeLabel) {
    const segments = currentPathSegments();
    const items = [{ label: homeLabel, href: '/', children: [] }];
    let path = '';
    segments.forEach(segment => {
        path += `/${segment}`;
        items.push({ label: titleFromSegment(segment), href: path, children: [] });
    });
    return items;
}
export function render(el, ctx = {}) {
    if (!el)
        return;
    const settings = widgetSettings(ctx, {
        homeLabel: 'Home',
        separator: '/'
    });
    const items = normalizeNavigationItems(readArray(settings, ['items', 'trail']));
    const trail = items.length ? items : fallbackItems(readString(settings, ['homeLabel'], 'Home'));
    if (!trail.length) {
        renderWidgetMessage(el, 'BP_WIDGET_BREADCRUMB_EMPTY', 'Breadcrumb empty', 'Add breadcrumb items or render on a public path.');
        return;
    }
    const nav = document.createElement('nav');
    nav.className = 'bp-public-widget bp-breadcrumb-widget';
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
        }
        else {
            const link = document.createElement('a');
            link.href = item.href;
            link.textContent = item.label;
            row.appendChild(link);
        }
        list.appendChild(row);
    });
    nav.appendChild(list);
    el.replaceChildren(sharedStyle(), breadcrumbStyle(), nav);
}
