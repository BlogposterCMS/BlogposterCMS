interface DevReloadChange {
  paths: string[];
  revision: string;
}

interface DevReloadHello {
  sessionId: string;
}

interface DevReloadWindow extends Window {
  __BLOGPOSTER_DEV_RELOAD_ACTIVE__?: boolean;
}

const DEV_RELOAD_ENDPOINT = '/__dev/reload/events';
const SESSION_STORAGE_KEY = 'blogposter.devReload.session';
const CACHE_BUST_KEY = '__dev_reload';
let reloadScheduled = false;

function parseEventData<T>(event: Event): T | null {
  try {
    return JSON.parse((event as MessageEvent<string>).data) as T;
  } catch (error) {
    console.warn('[DEV_RELOAD_MESSAGE_INVALID]', error);
    return null;
  }
}

function readSessionId(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    // Sandboxed app frames may intentionally have an opaque origin.
    return null;
  }
}

function writeSessionId(sessionId: string): void {
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  } catch {
    // The parent dashboard still detects server restarts for opaque app frames.
  }
}

export function refreshChangedStylesheets(
  paths: string[],
  revision: string,
  targetDocument: Document = document
): number {
  const changedPaths = new Set(paths);
  let refreshed = 0;

  targetDocument.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href]').forEach(link => {
    const stylesheetUrl = new URL(link.href, targetDocument.baseURI);
    if (!changedPaths.has(stylesheetUrl.pathname)) return;

    stylesheetUrl.searchParams.set(CACHE_BUST_KEY, revision);
    link.href = stylesheetUrl.toString();
    refreshed += 1;
  });

  return refreshed;
}

function scheduleFullReload(reason: string): void {
  if (reloadScheduled) return;
  reloadScheduled = true;
  console.info(`[DEV_RELOAD] Reloading page after ${reason}.`);
  window.setTimeout(() => window.location.reload(), 80);
}

export function handleDevReloadChange(change: DevReloadChange): void {
  const paths = Array.isArray(change.paths)
    ? change.paths.filter(pathValue => typeof pathValue === 'string')
    : [];
  if (paths.length === 0) return;

  const cssPaths = paths.filter(changedPath => changedPath.endsWith('.css'));
  const requiresFullReload = cssPaths.length !== paths.length;
  if (requiresFullReload) {
    scheduleFullReload(paths.join(', '));
    return;
  }

  const refreshedCount = refreshChangedStylesheets(cssPaths, String(change.revision || Date.now()));
  if (refreshedCount > 0) {
    console.info(`[DEV_RELOAD] Refreshed ${refreshedCount} stylesheet(s).`);
  }
}

export function initDevReloadClient(): EventSource | null {
  const targetWindow = window as DevReloadWindow;
  if (targetWindow.__BLOGPOSTER_DEV_RELOAD_ACTIVE__) return null;
  if (typeof EventSource !== 'function') {
    console.warn('[DEV_RELOAD_EVENT_SOURCE_UNAVAILABLE]');
    return null;
  }
  targetWindow.__BLOGPOSTER_DEV_RELOAD_ACTIVE__ = true;

  const eventSource = new EventSource(DEV_RELOAD_ENDPOINT);
  eventSource.addEventListener('hello', event => {
    const hello = parseEventData<DevReloadHello>(event);
    const sessionId = String(hello?.sessionId || '');
    if (!sessionId) return;

    const previousSessionId = readSessionId();
    writeSessionId(sessionId);
    if (previousSessionId && previousSessionId !== sessionId) {
      scheduleFullReload('server restart');
    }
  });
  eventSource.addEventListener('change', event => {
    const change = parseEventData<DevReloadChange>(event);
    if (change) handleDevReloadChange(change);
  });
  return eventSource;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initDevReloadClient();
}
