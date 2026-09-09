import { loadWidgetServices } from './widgetServices.js';

type ViewNode = { tag: string; text?: string; children?: ViewNode[]; action?: string; name?: string; value?: string; label?: string; type?: string };
const TAGS = new Set(['div', 'section', 'p', 'span', 'strong', 'h2', 'h3', 'ul', 'li', 'label', 'button', 'input', 'textarea', 'select', 'option']);
const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,59}$/;
const mounted = new WeakMap<HTMLElement, () => void>();

/** Build only inert UI elements. No HTML parser, URL attributes, arbitrary styles or script-bearing nodes. */
export function buildWidgetView(tree: ViewNode): HTMLElement {
  let count = 0;
  function build(node: ViewNode, depth: number): HTMLElement {
    if (!node || !TAGS.has(node.tag) || ++count > 500 || depth > 20) throw new Error('WIDGET_VIEW_INVALID');
    const element = document.createElement(node.tag);
    if (node.text !== undefined) {
      if (typeof node.text !== 'string' || node.text.length > 16384) throw new Error('WIDGET_VIEW_TEXT_LIMIT');
      element.textContent = node.text;
    }
    if (node.label !== undefined) element.setAttribute('aria-label', String(node.label).slice(0, 200));
    if (node.action) {
      if (!NAME.test(node.action)) throw new Error('WIDGET_VIEW_ACTION_INVALID');
      element.dataset.widgetAction = node.action;
    }
    if (node.name) {
      if (!NAME.test(node.name)) throw new Error('WIDGET_VIEW_NAME_INVALID');
      element.setAttribute('name', node.name);
    }
    if (node.tag === 'button') { element.setAttribute('type', 'button'); element.className = 'button secondary sm'; }
    if (node.tag === 'input') {
      if (node.type && !['text', 'number', 'email', 'checkbox', 'date', 'search'].includes(node.type)) throw new Error('WIDGET_VIEW_INPUT_INVALID');
      element.setAttribute('type', node.type || 'text');
      // Native fields inherit the existing host form rules; packages cannot inject classes.
    }
    if (node.children !== undefined && !Array.isArray(node.children)) throw new Error('WIDGET_VIEW_CHILDREN_INVALID');
    for (const child of node.children || []) element.append(build(child, depth + 1));
    // Select values can only be applied after their options exist.
    if (['input', 'textarea', 'select', 'option'].includes(node.tag) && node.value !== undefined) {
      (element as HTMLInputElement).value = String(node.value).slice(0, 16384);
    }
    return element;
  }
  return build(tree, 0);
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
  const channel = new MessageChannel();
  let disposed = false, started = false, inflight = 0, messages = 0, epoch = Date.now(), lastPong = Date.now();
  let resolveReady!: () => void, rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const fail = (code: string) => {
    dispose();
    const alert = document.createElement('p'); alert.setAttribute('role', 'alert'); alert.dataset.errorCode = code; alert.textContent = code;
    container.replaceChildren(alert); rejectReady(new Error(code));
  };
  const observer = new MutationObserver(() => { if (!container.isConnected) dispose(); });
  const timer = window.setInterval(() => {
    if (Date.now() - lastPong > 10000) return fail('WIDGET_SANDBOX_TIMEOUT');
    channel.port1.postMessage({ type: 'ping' });
  }, 2000);
  function dispose() {
    if (disposed) return;
    disposed = true; services.dispose(); observer.disconnect(); clearInterval(timer);
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
        channel.port1.postMessage({ type: 'start', source, context: { widgetId: id, preview: context.preview === true } });
      } else if (message.type === 'view') {
        view.replaceChildren(buildWidgetView(message.tree)); resolveReady();
      } else if (message.type === 'pong') lastPong = Date.now();
      else if (message.type === 'error') { console.error('WIDGET_WORKER_FAILED', String(message.detail || '').slice(0, 250)); fail('WIDGET_WORKER_FAILED'); }
      else if (message.type === 'service') {
        if (!Number.isSafeInteger(message.id) || inflight >= 4) return fail('WIDGET_SERVICE_MESSAGE_INVALID');
        inflight++;
        try {
          await services.refresh();
          let result: unknown;
          if (message.method === 'request' && NAME.test(message.name)) result = await services.request(message.name, message.input);
          else if (message.method === 'draft.get') result = services.draft.get();
          else if (message.method === 'draft.set') result = services.draft.set(message.input);
          else if (message.method === 'preferences.get' && NAME.test(message.name)) result = services.preferences.get(message.name);
          else if (message.method === 'preferences.set' && NAME.test(message.name)) result = services.preferences.set(message.name, message.input);
          else throw new Error('WIDGET_SERVICE_DENIED');
          if (!disposed) channel.port1.postMessage({ type: 'result', id: message.id, result });
        } catch { if (!disposed) channel.port1.postMessage({ type: 'result', id: message.id, error: 'WIDGET_SERVICE_DENIED' }); }
        finally { inflight--; }
      } else throw new Error('WIDGET_SANDBOX_MESSAGE_INVALID');
    } catch { fail('WIDGET_SANDBOX_MESSAGE_INVALID'); }
  };
  const dispatch = (event: Event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-widget-action]') : null;
    if (!target || !view.contains(target)) return;
    const input = target as HTMLInputElement;
    channel.port1.postMessage({ type: 'action', action: target.getAttribute('data-widget-action'), event: event.type,
      value: typeof input.value === 'string' ? input.value.slice(0, 16384) : '', checked: input.checked === true });
  };
  view.addEventListener('click', dispatch); view.addEventListener('input', dispatch); view.addEventListener('change', dispatch);
  frame.addEventListener('load', () => {
    if (!started) frame.contentWindow?.postMessage({ type: 'connect' }, '*', [channel.port2]);
  }, { once: true });
  const nonce = window.NONCE || document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce;
  if (!nonce || !/^[A-Za-z0-9+/_=-]+$/.test(nonce)) { dispose(); throw new Error('WIDGET_SANDBOX_NONCE_REQUIRED'); }
  frame.srcdoc = sandboxDocument(nonce);
  container.replaceChildren(view, frame);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('pagehide', dispose, { once: true });
  return ready;
}
