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
import { applyNavigationStyle, isCurrentNavigationLink, navigationSettings } from './navigationSettings.js';
import { emitRuntimeAdmin } from '../../../../shared/api-client/runtimeFacade.js';

const renderRequests = new WeakMap<HTMLElement, object>();
let disclosureSequence = 0;

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
.bp-navigation-widget { min-height:0; }
.bp-navigation-widget > ul { justify-content:var(--bp-nav-align); gap:var(--bp-nav-gap); }
.bp-navigation-widget a { font-size:inherit; font-weight:500; padding:7px 10px; border-radius:var(--bp-nav-radius); }
.bp-navigation-widget a[aria-current='page'] { font-weight:650; }
.bp-navigation-widget[data-appearance='soft'] a:hover,
.bp-navigation-widget[data-appearance='soft'] a[aria-current='page'] { background:var(--studio-surface-muted,#f4f4f5); }
.bp-navigation-widget[data-appearance='underline'] a[aria-current='page'] { text-decoration:underline; text-underline-offset:7px; }
.bp-navigation-widget a:focus-visible,.bp-navigation-widget button:focus-visible { outline:2px solid var(--color-primary,currentColor); outline-offset:3px; }
.bp-navigation-widget__row { display:flex; align-items:center; justify-content:space-between; gap:4px; }
.bp-navigation-widget button { cursor:pointer; font:inherit; color:inherit; background:transparent; border:1px solid var(--studio-border,#ddd); border-radius:var(--bp-nav-radius); min-height:32px; padding:4px 9px; box-shadow:none; }
.bp-navigation-widget__toggle[aria-expanded='true'] { transform:rotate(180deg); }
.bp-navigation-widget ul ul { display:grid; padding:6px 0 6px 14px; gap:4px; }
.bp-navigation-widget [hidden] { display:none!important; }
.bp-navigation-widget--horizontal ul ul[data-disclosure] { position:absolute; z-index:20; left:0; top:100%; min-width:210px; max-width:min(340px,90vw); padding:8px; border:1px solid var(--studio-border,#ddd); border-radius:var(--bp-nav-radius); background:var(--studio-surface-solid,#fff); box-shadow:var(--studio-shadow-soft); }
.bp-navigation-widget--vertical > ul { gap:var(--bp-nav-gap); }
.bp-navigation-widget--vertical .bp-navigation-widget__row>a { flex:1; }
.bp-navigation-widget__mobile-toggle { display:none; }
@media(max-width:767px) {
  .bp-navigation-widget[data-mobile-collapse='true'] > .bp-navigation-widget__mobile-toggle { display:flex; align-items:center; justify-content:space-between; gap:16px; width:100%; }
  .bp-navigation-widget[data-mobile-collapse='true'][data-mobile-open='false'] > ul { display:none; }
  .bp-navigation-widget[data-mobile-collapse='true'] > ul { display:grid; margin-top:12px; }
  .bp-navigation-widget--horizontal ul ul[data-disclosure] { position:static; min-width:0; box-shadow:none; }
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

function renderList(items: NavigationItem[], maxDepth: number, expanded: boolean, depth = 1): HTMLUListElement {
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
    if (link.target === '_blank') link.rel = [...new Set(`${link.rel} noopener noreferrer`.split(/\s+/u).filter(Boolean))].join(' ');
    if (isCurrentNavigationLink(item.href)) link.setAttribute('aria-current', 'page');
    const rowContent = document.createElement('div');
    rowContent.className = 'bp-navigation-widget__row';
    rowContent.appendChild(link);
    row.appendChild(rowContent);
    if (item.children.length && depth < maxDepth) {
      const childList = renderList(item.children, maxDepth, expanded, depth + 1);
      if (mega.layoutId) childList.dataset.layoutId = String(mega.layoutId);
      if (!expanded) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'bp-navigation-widget__toggle';
        toggle.textContent = '⌄';
        toggle.setAttribute('aria-label', `${item.label}: submenu`);
        childList.id = `bp-navigation-submenu-${++disclosureSequence}`;
        childList.dataset.disclosure = 'true';
        const open = (value: boolean) => {
          childList.hidden = !value;
          toggle.setAttribute('aria-expanded', String(value));
        };
        toggle.setAttribute('aria-controls', childList.id);
        // Keep the current chapter visible in a vertical disclosure tree.
        open(Boolean(childList.querySelector('[aria-current="page"]')));
        toggle.addEventListener('click', () => open(childList.hidden));
        row.addEventListener('keydown', event => {
          if (event.key === 'Escape' && !childList.hidden) { open(false); toggle.focus(); event.stopPropagation(); }
        });
        row.addEventListener('focusout', event => {
          if (!expanded && event.relatedTarget instanceof Node && !row.contains(event.relatedTarget)) open(false);
        });
        rowContent.appendChild(toggle);
      }
      row.appendChild(childList);
    }
    list.appendChild(row);
  });
  return list;
}

async function loadNavigationItems(locationKey: string): Promise<NavigationItem[]> {
  if (document.body.classList.contains('builder-mode') && typeof window.meltdownEmit === 'function') {
    // The sandboxed Studio already owns an authenticated AppLoader bridge.
    // Preview active managed links through that bridge, not a blocked iframe fetch.
    const payload = await emitRuntimeAdmin<any>(window.meltdownEmit, window.ADMIN_TOKEN, 'navigation', 'tree', { locationKey, status: 'active' });
    return normalizeNavigationItems(Array.isArray(payload?.tree) ? payload.tree : []);
  }
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
  const request = {};
  renderRequests.set(el, request);
  const raw = widgetSettings(ctx);
  const settings = { ...raw, ...navigationSettings('navigationMenu', raw) };
  const fallbackItems = normalizeNavigationItems(readArray(settings, ['items', 'links']));
  let items = fallbackItems;

  if (!items.length) {
    try {
      items = await loadNavigationItems(readString(settings, ['locationKey', 'location'], 'primary'));
    } catch (err) {
      if (renderRequests.get(el) !== request) return;
      renderWidgetMessage(
        el,
        'BP_WIDGET_NAVIGATION_LOAD_FAILED',
        'Navigation unavailable',
        err instanceof Error ? err.message : 'Navigation request failed.'
      );
      return;
    }
  }

  if (renderRequests.get(el) !== request) return;

  if (!items.length) {
    renderWidgetMessage(el, 'BP_WIDGET_NAVIGATION_EMPTY', 'Navigation empty', 'Add active navigation items.');
    return;
  }

  const nav = document.createElement('nav');
  const orientation = readString(settings, ['orientation', 'direction'], 'horizontal');
  nav.className = `bp-public-widget bp-navigation-widget bp-navigation-widget--${orientation === 'vertical' ? 'vertical' : 'horizontal'}`;
  nav.setAttribute('aria-label', readString(settings, ['ariaLabel', 'label'], 'Navigation'));
  nav.dataset.appearance = String(settings.appearance);
  nav.dataset.mobileCollapse = String(settings.mobileCollapse);
  nav.dataset.mobileOpen = 'false';
  applyNavigationStyle(nav, settings);
  const mobileToggle = document.createElement('button');
  mobileToggle.type = 'button';
  mobileToggle.className = 'bp-navigation-widget__mobile-toggle';
  mobileToggle.textContent = String(settings.mobileLabel);
  mobileToggle.setAttribute('aria-expanded', 'false');
  const list = renderList(items, readNumber(settings, ['maxDepth'], 3), settings.submenu === 'expanded');
  list.id = `bp-navigation-list-${++disclosureSequence}`;
  mobileToggle.setAttribute('aria-controls', list.id);
  mobileToggle.addEventListener('click', () => {
    const open = nav.dataset.mobileOpen !== 'true';
    nav.dataset.mobileOpen = String(open);
    mobileToggle.setAttribute('aria-expanded', String(open));
  });
  nav.addEventListener('keydown', event => {
    if (event.key === 'Escape' && nav.dataset.mobileOpen === 'true') {
      nav.dataset.mobileOpen = 'false'; mobileToggle.setAttribute('aria-expanded', 'false'); mobileToggle.focus();
    }
  });
  nav.append(mobileToggle, list);
  el.replaceChildren(sharedStyle(), navigationStyle(), nav);
}
