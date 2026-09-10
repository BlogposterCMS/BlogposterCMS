import { bpPopover, type BpPopoverHandle } from '../overlays/popover.js';
import { renderKitComponent } from '../design-system/componentRenderer.js';
import { validateView, type UiNode } from '/ui/shared/widget-ui/model.js';
import { applyUiStyles, widgetUiCss } from '/ui/shared/widget-ui/styles.js';
import { elementTag, updateControl, localUiMedia } from '/ui/shared/widget-ui/controls.js';
import type { UiEvent } from '/ui/shared/widget-ui/bindings.js';

type RecordNode = { element: HTMLElement; node: UiNode; composing: boolean; inputRevision: number; events: AbortController; overlay?: BpPopoverHandle; slot?: HTMLElement; signature?: string; closing?: boolean; focusRequest?: number; measurement?: ResizeObserver };
type Options = { preview?: boolean; shadow?: boolean; dispatch?: (event: UiEvent) => void; onUserGesture?: () => void };
let instanceNumber = 0;

/** Shared host renderer. Untrusted code supplies data and never receives DOM handles. */
export function createWidgetUi(host: HTMLElement, options: Options = {}) {
  const root = options.shadow === false ? host : host.shadowRoot || host.attachShadow({ mode: 'open' });
  const style = document.createElement('style'); style.textContent = widgetUiCss;
  const view = document.createElement('div'); root.replaceChildren(style, view);
  const records = new Map<string, RecordNode>();
  const prefix = `bp-widget-ui-${++instanceNumber}-`;
  let currentKeys = new Set<string>(), disposed = false;
  function send(record: RecordNode, event: string, original?: Event, control?: HTMLElement): void {
    const action = record.node.events?.[event] || (['click','input','change'].includes(event) ? record.node.action : undefined);
    if (!action) return;
    if (original?.isTrusted) options.onUserGesture?.();
    if (event === 'input') record.inputRevision++;
    const input = (control || record.element) as HTMLInputElement;
    const value = record.node.tag === 'composer' ? (input.innerText ?? input.textContent ?? '').replace(/\r\n?/g, '\n').replace(/\n$/, '')
      : typeof input.value === 'string' ? input.value : record.node.value || '';
    options.dispatch?.({ action, event, value: value.slice(0, 16384), checked: input.checked === true,
      key: (original as KeyboardEvent)?.key, isComposing: record.composing || (original as InputEvent)?.isComposing, inputRevision: record.inputRevision });
  }
  function bind(record: RecordNode): void {
    const element = record.element;
    const on = (name: string, handler: EventListener) => element.addEventListener(name, handler, { signal: record.events.signal });
    on('compositionstart', () => { record.composing = true; });
    on('compositionend', event => { record.composing = false; send(record, 'input', event); });
    for (const name of ['click','input','change','focus','blur']) on(name, event => {
      if (record.composing) return;
      if (event.target !== element && name !== 'click' && !['composer','kit'].includes(record.node.tag)) return;
      const action = record.node.events?.[name] || record.node.action;
      if (!action) return;
      event.stopPropagation();
      const control = record.node.tag === 'kit' ? event.composedPath().find(item => item instanceof HTMLInputElement || item instanceof HTMLTextAreaElement || item instanceof HTMLSelectElement) as HTMLElement | undefined : undefined;
      send(record, name, event, control);
    });
    on('keydown', event => {
      const key = event as KeyboardEvent;
      if (record.composing || key.isComposing || key.keyCode === 229) return;
      if (key.key === 'Enter' && !key.shiftKey && record.node.events?.submit) {
        key.preventDefault(); send(record, 'submit', key);
      } else if (record.node.events?.keydown && ['ArrowDown','ArrowUp','Escape'].includes(key.key)) {
        key.preventDefault(); send(record, 'keydown', key);
      }
    });
    on('close', () => send(record, 'close'));
  }
  function patch(node: UiNode, parent: HTMLElement, path: string): HTMLElement {
    const identity = node.key || path; currentKeys.add(identity);
    let record = records.get(identity);
    if (record && record.node.tag !== node.tag) {
      record.closing = true; record.events.abort(); record.measurement?.disconnect(); record.overlay?.close(); record.slot?.remove(); record.element.remove(); records.delete(identity); record = undefined;
    }
    if (!record) {
      record = { element: document.createElement(elementTag(node)), node, composing: false, inputRevision: 0, events: new AbortController() };
      records.set(identity, record); record.element.dataset.uiKey = identity; bind(record);
    }
    record.node = node;
    const element = record.element;
    element.id = prefix + identity;
    applyUiStyles(element, node.styles, options.preview);
    if (!['richtext','composer','kit'].includes(node.tag)) {
      if (node.text !== undefined && !node.children?.length && element.textContent !== node.text) element.textContent = node.text;
      const desired = (node.children || []).map((child, index) => patch(child, element, `${identity}-${index}`));
      if (desired.length) {
        desired.forEach((child, index) => { if (element.children[index] !== child) element.insertBefore(child, element.children[index] || null); });
        for (const child of [...element.children]) if (!desired.includes(child as HTMLElement)) child.remove();
      } else if (node.text === undefined && element.childNodes.length) element.replaceChildren();
    }
    // Options must exist before setting a select's value.
    // A worker can acknowledge an older edit after the next character is already visible.
    // Keep the newer local value until the worker returns its matching input revision.
    const staleInput = typeof node.props?.inputRevision === 'number' && node.props.inputRevision < record.inputRevision;
    updateControl(element, staleInput ? { ...node, value: undefined } : node, record.composing, options.preview === true);
    if (node.tag === 'kit') {
      const component = JSON.parse(JSON.stringify(node.props?.component || {}));
      if (component.type === 'image') component.props = { ...component.props, src: localUiMedia(component.props?.src) || '' };
      const signature = JSON.stringify(component);
      if (record.signature !== signature) { renderKitComponent(element, component, { preview: options.preview }); record.signature = signature; }
    }
    if (['popover','tooltip'].includes(node.tag)) {
      record.slot ||= document.createElement('span'); record.slot.hidden = true;
      if (!record.overlay && element.parentNode !== record.slot) record.slot.append(element);
      if (record.slot.parentNode !== parent) parent.append(record.slot);
      return record.slot;
    }
    if (element.parentNode !== parent) parent.append(element);
    return element;
  }
  function overlay(record: RecordNode): void {
    const { node, element } = record;
    for (const [property, attribute] of [['controlsKey','aria-controls'],['activeDescendantKey','aria-activedescendant']] as const) {
      const target = typeof node.props?.[property] === 'string' ? records.get(node.props[property] as string)?.element : undefined;
      if (target) element.setAttribute(attribute, target.id); else element.removeAttribute(attribute);
    }
    const variable = node.props?.heightVariable;
    if (typeof variable === 'string' && /^--[a-z][a-z0-9-]{0,79}$/.test(variable) && !record.measurement && typeof ResizeObserver !== 'undefined') {
      // A fixed dock can reserve its measured space inside this widget only.
      record.measurement = new ResizeObserver(() => view.style.setProperty(variable, `${Math.min(4096, element.getBoundingClientRect().height)}px`));
      record.measurement.observe(element);
    }
    const focusRequest = node.props?.focusRequest;
    if (Number.isSafeInteger(focusRequest) && Number(focusRequest) > 0 && focusRequest !== record.focusRequest && !node.hidden && !options.preview) {
      if (!element.matches('button,input,select,textarea,a[href],[contenteditable]')) element.tabIndex = -1;
      element.focus(); record.focusRequest = Number(focusRequest);
    }
    if (['popover','tooltip'].includes(node.tag)) {
      const opened = node.open === true && !node.hidden;
      if (!opened) { record.closing = true; record.overlay?.close(); record.closing = false; record.overlay = undefined; element.hidden = true; return; }
      const anchor = node.anchor ? records.get(node.anchor)?.element : undefined;
      if (!anchor?.isConnected) { element.hidden = true; return; }
      element.hidden = false;
      if (!record.overlay) {
        record.overlay = bpPopover.open(anchor, { content: element, portalRoot: root, role: node.tag === 'tooltip' ? 'tooltip' : 'dialog',
          ariaLabel: node.label || 'Details', placement: node.props?.placement === 'top-start' ? 'top-start' : 'bottom-start',
          autoFocus: node.props?.autoFocus === true, onClose: () => { record.overlay = undefined; element.hidden = true; if (!record.closing && !disposed) send(record, 'close'); } });
        // The authored node owns presentation; the portal panel only positions it.
        element.dataset.uiOverlay = 'true';
        record.overlay.panel.style.width = node.props?.matchAnchorWidth === true ? `${anchor.getBoundingClientRect().width}px` : 'max-content';
        record.overlay.panel.style.maxWidth = node.props?.matchAnchorWidth === true ? 'calc(100vw - 24px)' : 'min(90vw,720px)';
      } else record.overlay.updatePosition();
    }
    if (['dialog','drawer'].includes(node.tag)) {
      const dialog = element as HTMLDialogElement;
      if (node.open && !node.hidden && !dialog.open) {
        if (options.preview || typeof dialog.showModal !== 'function') dialog.setAttribute('open', ''); else dialog.showModal();
      } else if ((!node.open || node.hidden) && dialog.open) {
        if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
      }
    }
  }
  function render(tree: UiNode): void {
    if (disposed) return;
    validateView(tree); currentKeys = new Set();
    const element = patch(tree, view, 'root');
    if (view.firstElementChild !== element) view.prepend(element);
    for (const [key, record] of records) if (!currentKeys.has(key)) { record.closing = true; record.events.abort(); record.measurement?.disconnect(); record.overlay?.close(); record.element.remove(); record.slot?.remove(); records.delete(key); }
    records.forEach(overlay);
  }
  return { render, root, dispose() { disposed = true; records.forEach(record => { record.events.abort(); record.measurement?.disconnect(); record.overlay?.close(); }); records.clear(); } };
}
