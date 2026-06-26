const SYSTEM_WIDGET_PREFIX = '/ui/widgets/plainspace/';
const LEGACY_SYSTEM_WIDGET_PREFIX = '/plainspace/widgets/';
const COMMUNITY_WIDGET_PATTERN = /^\/widgets\/[A-Za-z0-9_-]+\/widget\.js$/;

function currentDocumentBase(): string {
  if (typeof document !== 'undefined' && document.baseURI) {
    return document.baseURI;
  }
  if (typeof window !== 'undefined' && window.location?.href) {
    return window.location.href;
  }
  return 'http://localhost/';
}

function serializeSameOriginPath(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

function serializeSystemWidgetPath(pathname: string, url: URL): string {
  return `${pathname}${url.search}${url.hash}`;
}

function normalizeLegacySystemWidgetPath(pathname: string): string | null {
  if (!pathname.startsWith(LEGACY_SYSTEM_WIDGET_PREFIX)) return null;

  // Legacy browser shims are allowed only as aliases for the same canonical
  // trusted widget tree; the URL parser has already resolved dot segments.
  const relativePath = pathname.slice(LEGACY_SYSTEM_WIDGET_PREFIX.length);
  return `${SYSTEM_WIDGET_PREFIX}${relativePath}`;
}

export function resolveWidgetModuleUrl(input: unknown, base = currentDocumentBase()): string | null {
  if (typeof input !== 'string' || !input.trim()) return null;

  let baseUrl: URL;
  let url: URL;
  try {
    baseUrl = new URL(base);
    url = new URL(input, baseUrl);
  } catch {
    return null;
  }

  if (url.origin !== baseUrl.origin || !url.pathname.endsWith('.js')) {
    return null;
  }

  const systemWidgetPath = normalizeLegacySystemWidgetPath(url.pathname) || url.pathname;
  if (systemWidgetPath.startsWith(SYSTEM_WIDGET_PREFIX)) {
    return serializeSystemWidgetPath(systemWidgetPath, url);
  }

  if (COMMUNITY_WIDGET_PATTERN.test(url.pathname)) {
    return serializeSameOriginPath(url);
  }

  return null;
}

export function isAllowedWidgetModuleUrl(input: unknown, base?: string): boolean {
  return resolveWidgetModuleUrl(input, base) !== null;
}
