const SEARCH_OPEN_WIDTH_TOKEN = '--studio-header-search-open-width';
const SEARCH_OPEN_WIDTH_FALLBACK = '240px';
const SEARCH_OPEN_MAX_WIDTH = 'calc(100vw - 128px)';

function tokenValue(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function setStyleValue(style: CSSStyleDeclaration, name: string, value: string): void {
  if (value) {
    style.setProperty(name, value, 'important');
  } else {
    style.removeProperty(name);
  }
}

export function setSearchExpanded(
  searchContainer: HTMLElement,
  searchInput: HTMLInputElement,
  expanded: boolean
): void {
  searchContainer.classList.toggle('open', expanded);
  searchContainer.classList.toggle('is-expanded', expanded);
  setStyleValue(searchContainer.style, 'width', expanded ? tokenValue(SEARCH_OPEN_WIDTH_TOKEN, SEARCH_OPEN_WIDTH_FALLBACK) : '');
  setStyleValue(searchContainer.style, 'max-width', expanded ? SEARCH_OPEN_MAX_WIDTH : '');
  setStyleValue(searchInput.style, 'width', expanded ? '100%' : '');
  setStyleValue(searchInput.style, 'opacity', expanded ? '1' : '');
  setStyleValue(searchInput.style, 'padding-right', expanded ? '12px' : '');
  setStyleValue(searchInput.style, 'pointer-events', expanded ? 'auto' : '');
}
