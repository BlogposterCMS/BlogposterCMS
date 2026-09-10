import { createWidgetUi } from '/ui/shared/widget-ui/renderer.js';
import { createUiBindings } from '/ui/shared/widget-ui/bindings.js';
import { normalizeUiDocument } from '/ui/shared/widget-ui/model.js';
import { createPublicUiData } from '/ui/shared/widget-ui/publicData.js';

const mounted = new WeakMap<HTMLElement, () => void>();
/** Uses existing saved instance metadata; previews have sample responses and no network. */
export function mountUiDocument(host: HTMLElement, document: unknown, preview = false) {
  mounted.get(host)?.();
  const normalized = normalizeUiDocument(document);
  const services = createPublicUiData(preview);
  const renderer = createWidgetUi(host, { preview, dispatch: event => { void binding?.dispatch(event); } });
  const binding = createUiBindings(normalized, services.request, renderer.render, preview);
  const dispose = () => { renderer.dispose(); binding.dispose(); services.dispose(); observer.disconnect(); window.removeEventListener('pagehide', dispose); };
  let wasConnected = host.isConnected;
  const observer = new MutationObserver(() => {
    if (host.isConnected) wasConnected = true;
    else if (wasConnected) dispose();
  });
  observer.observe(documentNode(host), { childList: true, subtree: true });
  window.addEventListener('pagehide', dispose, { once: true }); mounted.set(host, dispose);
  return { ...binding, dispose };
}
function documentNode(host: HTMLElement): Node { return host.ownerDocument.body; }
