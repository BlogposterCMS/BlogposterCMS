import { normalizeContainerInteraction, type ContainerInteraction } from './containerInteractionModel.js';
import { createUiBindings } from '../widget-ui/bindings.js';
import { createWidgetUi } from '../widget-ui/renderer.js';
import { createPublicUiData } from '../widget-ui/publicData.js';
import { searchPopoverDocument } from '../widget-ui/presets.js';
import { bpPopover, type BpPopoverHandle } from '../overlays/popover.js';
import type { UiDocument, UiNode } from '../widget-ui/model.js';

const mounted = new WeakMap<HTMLElement, () => void>();
function owner(root: HTMLElement, id: string | undefined): HTMLElement | undefined {
  if (!id) return undefined;
  return [...root.querySelectorAll<HTMLElement>('[data-node-id],[data-instance-id]')]
    .find(element => element.dataset.nodeId === id || element.dataset.instanceId === id);
}
/** Follow the existing component ShadowRoots without assuming native controls live in light DOM. */
function queryControl(root?: HTMLElement): HTMLElement | undefined {
  if (!root) return undefined;
  const queue: Element[] = [root];
  for (let seen = 0; queue.length && seen < 500; seen++) {
    const element = queue.shift()!;
    if (element.matches('input,textarea,[contenteditable]')) return element as HTMLElement;
    queue.push(...element.children, ...(element.shadowRoot?.children || []));
  }
  return undefined;
}
function definition(settings: ContainerInteraction): UiDocument {
  const sample = searchPopoverDocument(document.documentElement.lang || 'en').sources!.articles!;
  const items = `data.articles.result.${settings.itemsField || 'items'}`;
  return { version: 1, state: { opened: settings.presentation === 'normal', query: '' },
    sources: settings.source ? {articles: {...sample, debounceMs: settings.triggerEvent === 'input' ? 200 : 0}} : {},
    actions: {
      activate: [{type:'set',target:'query',value:{ref:'event.value'}},{type:'set',target:'opened',value:true},...(settings.source ? [{type:'request' as const,target:'articles'}] : [])],
      toggle: [{type:'toggle',target:'opened'}], close: [{type:'set',target:'opened',value:false}]
    },
    view: {tag:'div',bindings:{open:{ref:'state.opened'}},when:settings.when,children:settings.source ? [
      {tag:'p',text:'Loading…',when:{ref:'data.articles.status',operator:'equals',value:'loading'}},
      {tag:'p',text:'Unable to load this content.',props:{role:'alert'},when:{ref:'data.articles.status',operator:'equals',value:'error'}},
      {tag:'div',when:{ref:'data.articles.status',operator:'equals',value:'ready'},children:[
        {tag:'p',text:settings.emptyText || 'No results.',when:{ref:items,operator:'empty'}},
        {tag:'ul',children:[{tag:'li',key:'item',repeat:{ref:items,key:'id'},children:[
          {tag:settings.linkField ? 'a':'span',bindings:{text:{ref:`item.${settings.labelField || 'title'}`},...(settings.linkField ? {href:{ref:`item.${settings.linkField}`}}:{})}}
        ]}]}
      ]}
    ] : []}
  };
}

/** Enhance real saved Designer containers after their widgets mount. Contents and listeners move intact. */
export function mountContainerInteractions(root: HTMLElement): () => void {
  mounted.get(root)?.();
  const disposers: Array<() => void> = [];
  for (const container of root.querySelectorAll<HTMLElement>('[data-layout-interaction]')) {
    const parsed = normalizeContainerInteraction(JSON.parse(container.dataset.layoutInteraction!));
    if (!parsed) continue;
    const settings: ContainerInteraction = parsed;
    const marker = document.createComment('container interaction'); container.before(marker);
    const listeners = new AbortController(); const services = createPublicUiData();
    const output = document.createElement('div'); output.dataset.containerData = 'true';
    if (settings.source) container.append(output);
    const renderer = createWidgetUi(output);
    let popover: BpPopoverHandle | undefined, dialog: HTMLDialogElement | undefined;
    let controller: ReturnType<typeof createUiBindings> | undefined, closed = false, restoring = false;
    const originalHidden = container.hidden;
    function restore(): void {
      if (marker.parentNode) marker.parentNode.insertBefore(container, marker.nextSibling);
    }
    function close(notify = false): void {
      if (restoring) return;
      restoring = true; popover?.close(); popover = undefined;
      if (dialog?.open) dialog.close();
      restore(); dialog?.remove(); dialog = undefined;
      container.hidden = true; restoring = false;
      if (notify && !closed) void controller?.dispatch({action:'close'});
    }
    function paint(tree: UiNode): void {
      if (settings.source) renderer.render(tree);
      const visible = tree.open === true && tree.hidden !== true;
      if (settings.presentation === 'normal') { container.hidden = !visible; return; }
      if (!visible) { if (popover || dialog) close(); else container.hidden = true; return; }
      container.hidden = false;
      const trigger = owner(root, settings.triggerId);
      if (settings.presentation === 'popover') {
        if (!trigger || popover) return;
        const palette = getComputedStyle(container);
        const publicStyles = Object.fromEntries(['background-color','color','font-family','font-size','border-color','border-radius', ...Array.from(palette).filter(key => key.startsWith('--'))].map(key => [key, palette.getPropertyValue(key)]));
        popover = bpPopover.open(trigger, {content:container,portalRoot:root,ariaLabel:'Details',onClose:() => close(true)});
        // Copy this public container's presentation onto its own panel, never shared admin selectors.
        for (const [key, value] of Object.entries(publicStyles)) popover.panel.style.setProperty(key, value);
      } else if (!dialog) {
        dialog = document.createElement('dialog'); dialog.setAttribute('aria-label','Details');
        dialog.style.cssText = 'border:0;border-radius:12px;padding:0;max-width:90vw;max-height:90vh;overflow:auto';
        if (settings.presentation === 'drawer') dialog.style.cssText += ';margin-right:0;height:100vh;max-height:100vh;width:min(90vw,420px)';
        const button = document.createElement('button'); button.type='button'; button.textContent='Close';
        button.style.cssText = 'font:inherit;color:inherit;background:transparent;border:1px solid currentColor;border-radius:6px;padding:6px 12px;margin:8px;cursor:pointer';
        button.addEventListener('click',() => close(true),{signal:listeners.signal});
        // Native modal presentation uses the top layer without losing this design's CSS ancestry.
        dialog.append(button,container); root.append(dialog);
        dialog.addEventListener('close',() => { if (dialog) close(true); },{signal:listeners.signal});
        dialog.showModal();
      }
    }
    controller = createUiBindings(definition(settings),services.request,paint,settings.source === 'sampleArticles');
    const activate = (event: Event) => {
      if ((event as InputEvent).isComposing) return;
      const target = owner(root, settings.triggerId);
      if (!target || !event.composedPath().includes(target)) return;
      const fieldOwner = owner(root, settings.queryId || settings.triggerId);
      const field = event.composedPath().find(item => item instanceof HTMLInputElement || item instanceof HTMLTextAreaElement || (item instanceof HTMLElement && item.isContentEditable)) as HTMLInputElement | undefined;
      const queryField = (field && (!settings.queryId || event.composedPath().includes(fieldOwner!)) ? field : queryControl(fieldOwner)) as HTMLInputElement | undefined;
      const value = queryField?.value ?? queryField?.textContent ?? '';
      void controller?.dispatch({action:settings.source || settings.triggerEvent !== 'click' ? 'activate':'toggle',value});
    };
    root.addEventListener(settings.triggerEvent || 'click',activate,{capture:true,signal:listeners.signal});
    disposers.push(() => { closed=true;listeners.abort();controller?.dispose();renderer.dispose();services.dispose();close();container.hidden=originalHidden;marker.remove();output.remove(); });
  }
  let wasConnected = root.isConnected;
  const observer = new MutationObserver(() => {
    if (root.isConnected) wasConnected = true;
    else if (wasConnected) dispose();
  });
  observer.observe(document.body,{childList:true,subtree:true});
  const dispose = () => { observer.disconnect();disposers.splice(0).forEach(fn=>fn());window.removeEventListener('pagehide',dispose); };
  window.addEventListener('pagehide',dispose,{once:true}); mounted.set(root,dispose); return dispose;
}
