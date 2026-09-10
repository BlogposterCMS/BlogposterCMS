import { loadWidgetServices } from './widgetServices.js';
import { createWidgetHeartbeat } from './widgetHeartbeat.js';

import { createWidgetUi } from '../../shared/widget-ui/renderer.js';
import type { UiNode as ViewNode } from '../../shared/widget-ui/model.js';
const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,59}$/;
const mounted = new WeakMap<HTMLElement, () => void>();

/** Static AppLoader documents have no server nonce. Their isolated srcdoc still
 * needs a nonce for its own CSP; inherited parent CSP remains enforced by the browser.
 * Reuse a supplied nonce when present, without adding unsafe-inline or relaxing sandbox flags.
 */
export function widgetSandboxNonce(existing?: string | null): string {
  if (existing) {
    if (!/^[A-Za-z0-9+/_=-]+$/.test(existing)) throw new Error('WIDGET_SANDBOX_NONCE_INVALID');
    return existing;
  }
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Navigation follows a real UI gesture and stays on this site; a timer cannot redirect visitors. */
export function widgetNavigationPath(value: unknown, origin: string, gestureAt: number, preview = false): string {
  if (preview || !gestureAt || Date.now() - gestureAt > 5000) throw new Error('WIDGET_NAVIGATION_GESTURE_REQUIRED');
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//')) throw new Error('WIDGET_NAVIGATION_PATH_DENIED');
  const url = new URL(value, origin);
  if (url.origin !== origin) throw new Error('WIDGET_NAVIGATION_PATH_DENIED');
  return url.pathname + url.search + url.hash;
}

/** Compatibility helper; the live mount uses this same shared UI implementation. */
export function buildWidgetView(tree: ViewNode): HTMLElement {
  const host = document.createElement('div');
  const renderer = createWidgetUi(host, { shadow: false });
  renderer.render(tree);
  return host.lastElementChild!.firstElementChild as HTMLElement;
}

// Only this trusted bridge runs in the iframe. Extension code runs in its opaque-origin
// worker: no DOM/navigation, CMS origin storage or direct network capability.
export function sandboxDocument(nonce: string): string {
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' blob:; worker-src blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><script nonce="${nonce}">
  addEventListener('message', function init(event) {
    if (event.source !== parent || !event.ports[0]) return;
    removeEventListener('message', init);
    const port = event.ports[0];
    let worker;
    port.onmessage = event => {
      if (event.data.type === 'start' && !worker) {
        const blob = new Blob([event.data.source], {type:'text/javascript'});
        const url = URL.createObjectURL(blob);
        worker = new Worker(url);
        URL.revokeObjectURL(url);
        worker.onmessage = message => port.postMessage(message.data);
        worker.onerror = error => port.postMessage({type:'error',code:'WIDGET_WORKER_FAILED',detail:String(error.message || '').slice(0,250)});
        worker.postMessage({type:'init',context:event.data.context});
      } else if (worker) worker.postMessage(event.data);
    };
    port.start(); port.postMessage({type:'connected'});
  });
  <\/script>`;
}

/** One lifecycle for public runtime, library and Designer. The existing service policy remains the authority. */
export async function mountSandboxWidget(container: HTMLElement, id: string, codeUrl: string, context: Record<string, any>): Promise<void> {
  mounted.get(container)?.();
  const parsed = new URL(codeUrl, document.baseURI);
  if (parsed.origin !== new URL(document.baseURI).origin || parsed.pathname !== `/widgets/${id}/widget.js`) throw new Error('WIDGET_SANDBOX_PATH_DENIED');
  const nonce = widgetSandboxNonce(window.NONCE || document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce);
  const response = await fetch(parsed.pathname, { credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000) });
  if (!response.ok || response.headers.get('X-Blogposter-Widget-Contract') !== '2') throw new Error('WIDGET_SANDBOX_MIGRATION_REQUIRED');
  const source = await response.text();
  if (source.length > 262144) throw new Error('WIDGET_SANDBOX_SOURCE_LIMIT');
  const codeHash = response.headers.get('X-Blogposter-Widget-Code-Hash') || '';
  if (!/^[a-f0-9]{64}$/.test(codeHash)) throw new Error('WIDGET_SANDBOX_HASH_REQUIRED');
  const services = await loadWidgetServices(id, context.preview === true, codeHash);
  const frame = document.createElement('iframe');
  frame.hidden = true;
  frame.title = `Widget ${id} isolation`;
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.setAttribute('allow', "camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'; usb 'none'");
  const view = document.createElement('div');
  let gestureAt = 0;
  const renderer = createWidgetUi(view, { preview: context.preview === true,
    onUserGesture: () => { gestureAt = Date.now(); },
    dispatch: event => channel.port1.postMessage({ type: 'action', ...event }) });
  const streams = new Map<string, { close: () => void }>();
  const channel = new MessageChannel();
  let disposed = false, started = false, inflight = 0, messages = 0, epoch = Date.now();
  let resolveReady!: () => void, rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const fail = (code: string) => {
    dispose();
    const alert = document.createElement('p'); alert.setAttribute('role', 'alert'); alert.dataset.errorCode = code; alert.textContent = code;
    container.replaceChildren(alert); rejectReady(new Error(code));
  };
  // Public documents can finish asynchronous widget loading before the shell is attached.
  let wasConnected = container.isConnected;
  const observer = new MutationObserver(() => {
    if (container.isConnected) wasConnected = true;
    else if (wasConnected) dispose();
  });
  const heartbeat = createWidgetHeartbeat(
    () => channel.port1.postMessage({ type: 'ping' }),
    () => fail('WIDGET_SANDBOX_TIMEOUT'));
  function dispose() {
    if (disposed) return;
    disposed = true; renderer.dispose(); streams.forEach(stream => stream.close()); streams.clear(); services.dispose(); observer.disconnect(); heartbeat.dispose();
    channel.port1.close(); channel.port2.close(); frame.remove();
    window.removeEventListener('pagehide', dispose);
    rejectReady(new Error('WIDGET_SANDBOX_DISPOSED'));
  }
  mounted.set(container, dispose);
  channel.port1.onmessage = async event => {
    if (disposed) return;
    try {
      const message = event.data;
      if (Date.now() - epoch >= 1000) { epoch = Date.now(); messages = 0; }
      if (++messages > 100 || JSON.stringify(message).length > 131072) return fail('WIDGET_SANDBOX_MESSAGE_LIMIT');
      if (message.type === 'connected' && !started) {
        started = true;
        // Never serialize the full runtime context (tokens, page objects, DOM or emitters).
        channel.port1.postMessage({ type: 'start', source, context: { widgetId: id, preview: context.preview === true,
          locale: new URL(document.baseURI).searchParams.get('lang') || document.documentElement.lang || 'en',
          languageInUrl: (new URL(document.baseURI).searchParams.get('lang') || '').slice(0,40),
          colorScheme: window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
          origin: new URL(document.baseURI).origin, pathname: new URL(document.baseURI).pathname,
          mode: typeof context.instanceMetadata?.mode === 'string' ? context.instanceMetadata.mode.slice(0,80) : '',
          languages: navigator.languages.slice(0,8) } });
      } else if (message.type === 'view') {
        renderer.render(message.tree); resolveReady();
      } else if (message.type === 'navigate') {
        window.location.assign(widgetNavigationPath(message.path, window.location.origin, gestureAt, context.preview === true));
        gestureAt = 0;
      } else if (message.type === 'pong') heartbeat.reply();
      else if (message.type === 'error') { console.error('WIDGET_WORKER_FAILED', String(message.detail || '').slice(0, 250)); fail('WIDGET_WORKER_FAILED'); }
      else if (message.type === 'service') {
        if (!Number.isSafeInteger(message.id) || inflight >= 4) return fail('WIDGET_SERVICE_MESSAGE_INVALID');
        inflight++;
        try {
          await services.refresh();
          let result: unknown;
          if (message.method === 'request' && NAME.test(message.name)) result = await services.request(message.name, message.input);
          else if (message.method === 'subscribe' && NAME.test(message.name) && NAME.test(message.input?.event)) {
            const key = String(message.id);
            const stream = services.subscribe(message.name, message.input.event,
              data => channel.port1.postMessage({ type: 'stream', key, data }),
              () => { streams.delete(key); channel.port1.postMessage({ type: 'stream', key, error: 'WIDGET_STREAM_CLOSED' }); });
            streams.set(key, stream); result = key;
          } else if (message.method === 'unsubscribe') {
            streams.get(String(message.input))?.close(); streams.delete(String(message.input)); result = true;
          }
          else if (message.method === 'draft.get') result = services.draft.get();
          else if (message.method === 'draft.set') result = services.draft.set(message.input);
          else if (message.method === 'preferences.get' && NAME.test(message.name)) result = services.preferences.get(message.name);
          else if (message.method === 'preferences.set' && NAME.test(message.name)) result = services.preferences.set(message.name, message.input);
          else throw new Error('WIDGET_SERVICE_DENIED');
          if (!disposed) channel.port1.postMessage({ type: 'result', id: message.id, result });
        } catch (error) { if (!disposed) channel.port1.postMessage({ type: 'result', id: message.id,
          error: 'WIDGET_SERVICE_DENIED', status: [400,401,403,404,409,429,503].includes((error as any)?.status) ? (error as any).status : undefined }); }
        finally { inflight--; }
      } else throw new Error('WIDGET_SANDBOX_MESSAGE_INVALID');
    } catch { fail('WIDGET_SANDBOX_MESSAGE_INVALID'); }
  };
  frame.addEventListener('load', () => {
    if (!started) frame.contentWindow?.postMessage({ type: 'connect' }, '*', [channel.port2]);
  }, { once: true });
  frame.srcdoc = sandboxDocument(nonce);
  container.replaceChildren(view, frame);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('pagehide', dispose, { once: true });
  return ready;
}
