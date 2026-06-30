const SYSTEM_WIDGET_PREFIX = '/ui/widgets/plainspace/';
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

  if (url.pathname.startsWith(SYSTEM_WIDGET_PREFIX)) {
    return serializeSystemWidgetPath(url.pathname, url);
  }

  if (COMMUNITY_WIDGET_PATTERN.test(url.pathname)) {
    return serializeSameOriginPath(url);
  }

  return null;
}

export function isAllowedWidgetModuleUrl(input: unknown, base?: string): boolean {
  return resolveWidgetModuleUrl(input, base) !== null;
}
