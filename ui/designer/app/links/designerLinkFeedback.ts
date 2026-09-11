import { mountLinkFeedback, type EditorLink } from '../../../shared/links/linkFeedback.js';

let controller: ReturnType<typeof mountLinkFeedback> | undefined;
let detach: (() => void) | undefined;

/** Scan editable native widget content, including open ShadowRoots, without entering isolated widget sandboxes. */
function collectDesignerLinks(root: HTMLElement): EditorLink[] {
  const links: EditorLink[] = [];
  const seen = new Set<Element>();
  for (const widget of root.querySelectorAll<HTMLElement>('.canvas-item')) {
    const owner = widget.dataset.instanceId || widget.dataset.nodeId || widget.id || 'element';
    const visit = (scope: HTMLElement | ShadowRoot) => {
      if (scope instanceof HTMLElement && scope.shadowRoot) visit(scope.shadowRoot);
      for (const element of scope.querySelectorAll<HTMLElement>('*')) {
        if (seen.has(element)) continue;
        seen.add(element);
        if (element.matches('a[href]')) links.push({ id: `${owner}:link-${links.length}`, href: element.getAttribute('href') || '', anchor: element });
        if (element.shadowRoot) visit(element.shadowRoot);
      }
    };
    visit(widget);
  }
  const selected = root.querySelector<HTMLElement>('.canvas-item.selected, .canvas-item.is-selected, .canvas-item[aria-selected="true"]');
  for (const input of root.querySelectorAll<HTMLInputElement>('.scene-button-href, [data-gallery-item-field="href"], [data-navigation-field="homeHref"]')) {
    if (!input.disabled && input.getClientRects().length) links.unshift({ id: `${selected?.dataset.instanceId || 'selected'}:${input.id || input.className || 'link-field'}`, href: input.value, anchor: input });
  }
  return links;
}

export function startDesignerLinkFeedback(root: HTMLElement) {
  detach?.(); controller?.stop();
  controller = mountLinkFeedback(root, { collect: () => collectDesignerLinks(root) });
  const changed = () => controller?.schedule();
  const selected = () => { void controller?.refresh(); };
  // Native widgets can finish rendering after the Studio surface starts.
  // Observe their content, not pointer motion or per-frame geometry/style changes.
  const observer = new MutationObserver(records => {
    if (records.some(record => record.target instanceof Element && !record.target.closest('[data-bp-link-feedback]')
        && (record.type === 'attributes' || [...record.addedNodes].some(node => node instanceof Element && (node.matches('a[href], .canvas-item') || node.querySelector('a[href], .canvas-item')))))) changed();
  });
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  document.addEventListener('designerContentChanged', changed);
  document.addEventListener('designerSelectionChanged', selected);
  detach = () => {
    observer.disconnect();
    document.removeEventListener('designerContentChanged', changed);
    document.removeEventListener('designerSelectionChanged', selected);
  };
}

/** The agent reads the same transient results displayed by the authoring surface. */
export const designerLinkFeedbackState = () => controller?.read() || { pending: false, checked: 0, limit: 40, items: [] };
