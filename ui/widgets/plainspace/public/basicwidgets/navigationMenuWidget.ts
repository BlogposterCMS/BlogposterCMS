import {
  normalizeNavigationItems,
  readArray,
  readNumber,
  readString,
  renderWidgetMessage,
  sharedStyle,
  widgetSettings,
  type NavigationItem,
  type PublicWidgetContext
} from './publicWidgetHelpers.js';

function navigationStyle(): HTMLStyleElement {
  const style = document.createElement('style');
  style.textContent = `
.bp-navigation-widget ul {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.85rem;
  align-items: center;
  margin: 0;
  padding: 0;
  list-style: none;
}
.bp-navigation-widget li {
  position: relative;
}
.bp-navigation-widget a {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 32px;
  color: var(--studio-text);
  font-weight: 650;
  text-decoration: none;
}
.bp-navigation-widget__icon {
  display: inline-flex;
  width: 1em;
  height: 1em;
}
.bp-navigation-widget a:hover,
.bp-navigation-widget a:focus-visible {
  color: var(--color-primary);
}
.bp-navigation-widget ul ul {
  flex-basis: 100%;
  padding-left: 1rem;
}
.bp-navigation-widget__mega {
  display: none;
  min-width: min(520px, calc(100vw - 2rem));
  margin-top: 0.35rem;
  padding: 0.75rem;
  border: 1px solid var(--studio-border);
  border-radius: 8px;
  background: var(--studio-surface-solid);
  box-shadow: var(--studio-shadow-soft);
}
.bp-navigation-widget__item--has-mega:hover > .bp-navigation-widget__mega,
.bp-navigation-widget__item--has-mega:focus-within > .bp-navigation-widget__mega {
  display: block;
}
.bp-navigation-widget__mega-note {
  display: block;
  color: var(--studio-text-muted);
  font-size: 0.82rem;
  margin-bottom: 0.5rem;
}
.bp-navigation-widget--vertical ul {
  display: grid;
  align-items: stretch;
}
@media (max-width: 767px) {
  .bp-navigation-widget__item--mobile-hidden {
    display: none;
  }
}
@media (min-width: 768px) {
  .bp-navigation-widget__item--desktop-hidden {
    display: none;
  }
}
  `.trim();
  return style;
}

function iconMarkup(name: string): HTMLElement | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const span = document.createElement('span');
  span.className = 'bp-navigation-widget__icon';
  span.setAttribute('aria-hidden', 'true');
  if (typeof window.featherIcon === 'function') {
    span.innerHTML = window.featherIcon(trimmed);
  } else {
    const img = document.createElement('img');
    img.src = `/assets/icons/${encodeURIComponent(trimmed)}.svg`;
    img.alt = '';
    span.appendChild(img);
  }
  return span;
}

function itemMeta(item: NavigationItem): Record<string, any> {
  return item.meta && typeof item.meta === 'object' && !Array.isArray(item.meta)
    ? item.meta as Record<string, any>
    : {};
}

function renderList(items: NavigationItem[], maxDepth: number, depth = 1): HTMLUListElement {
  const list = document.createElement('ul');
  items.forEach(item => {
    const row = document.createElement('li');
    const meta = itemMeta(item);
    const visibility = meta.visibility && typeof meta.visibility === 'object' ? meta.visibility : {};
    const mega = meta.mega && typeof meta.mega === 'object' ? meta.mega : {};
    row.className = [
      'bp-navigation-widget__item',
      item.cssClass || '',
      visibility.desktop === false ? 'bp-navigation-widget__item--desktop-hidden' : '',
      visibility.mobile === false ? 'bp-navigation-widget__item--mobile-hidden' : '',
      mega.enabled ? 'bp-navigation-widget__item--has-mega' : ''
    ].filter(Boolean).join(' ');
    if (item.id != null) row.dataset.itemId = String(item.id);
    if (mega.enabled) {
      row.dataset.megaEnabled = 'true';
      if (mega.layoutId) row.dataset.megaLayoutId = String(mega.layoutId);
    }

    const link = document.createElement('a');
    link.href = item.href;
    if (item.target) link.target = item.target;
    if (item.rel) link.rel = item.rel;
    const icon = iconMarkup(typeof meta.icon === 'string' ? meta.icon : '');
    if (icon) link.appendChild(icon);
    link.append(document.createTextNode(item.label));
    row.appendChild(link);
    if (mega.enabled) {
      const megaPanel = document.createElement('div');
      megaPanel.className = 'bp-navigation-widget__mega';
      if (mega.layoutId) megaPanel.dataset.layoutId = String(mega.layoutId);
      const note = document.createElement('span');
      note.className = 'bp-navigation-widget__mega-note';
      note.textContent = mega.layoutId
        ? `Mega panel: ${mega.layoutTitle || mega.layoutId}`
        : 'Mega panel uses theme fallback links.';
      megaPanel.appendChild(note);
      if (item.children.length && depth < maxDepth) {
        megaPanel.appendChild(renderList(item.children, maxDepth, depth + 1));
      }
      row.appendChild(megaPanel);
    } else if (item.children.length && depth < maxDepth) {
      row.appendChild(renderList(item.children, maxDepth, depth + 1));
    }
    list.appendChild(row);
  });
  return list;
}

async function loadNavigationItems(locationKey: string): Promise<NavigationItem[]> {
  if (typeof fetch !== 'function') {
    throw new Error('BP_WIDGET_NAVIGATION_FETCH_UNAVAILABLE');
  }
  const response = await fetch(`/api/public/navigation/${encodeURIComponent(locationKey)}`, {
    headers: { Accept: 'application/json' }
  });
  if (!response.ok) {
    throw new Error(`BP_WIDGET_NAVIGATION_FETCH_FAILED:${response.status}`);
  }
  const payload = await response.json();
  const source = Array.isArray(payload?.tree)
    ? payload.tree
    : Array.isArray(payload?.items)
      ? payload.items
      : [];
  return normalizeNavigationItems(source);
}

export async function render(el: HTMLElement | null, ctx: PublicWidgetContext = {}): Promise<void> {
  if (!el) return;
  const settings = widgetSettings(ctx, {
    locationKey: 'primary',
    orientation: 'horizontal'
  });
  const fallbackItems = normalizeNavigationItems(readArray(settings, ['items', 'links']));
  let items = fallbackItems;

  if (!items.length) {
    try {
      items = await loadNavigationItems(readString(settings, ['locationKey', 'location'], 'primary'));
    } catch (err) {
      renderWidgetMessage(
        el,
        'BP_WIDGET_NAVIGATION_LOAD_FAILED',
        'Navigation unavailable',
        err instanceof Error ? err.message : 'Navigation request failed.'
      );
      return;
    }
  }

  if (!items.length) {
    renderWidgetMessage(el, 'BP_WIDGET_NAVIGATION_EMPTY', 'Navigation empty', 'Add active navigation items.');
    return;
  }

  const nav = document.createElement('nav');
  const orientation = readString(settings, ['orientation', 'direction'], 'horizontal');
  nav.className = `bp-public-widget bp-navigation-widget bp-navigation-widget--${orientation === 'vertical' ? 'vertical' : 'horizontal'}`;
  nav.setAttribute('aria-label', readString(settings, ['ariaLabel', 'label'], 'Navigation'));
  nav.appendChild(renderList(items, Math.max(1, Math.min(4, readNumber(settings, ['maxDepth'], 2)))));
  el.replaceChildren(sharedStyle(), navigationStyle(), nav);
}
