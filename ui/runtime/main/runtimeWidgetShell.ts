import { getGlobalCssUrl } from './runtimePageShell.js';

export type RuntimeWidgetShell = {
  root: ShadowRoot;
  container: HTMLElement;
};

function createWidgetContainer(root: ShadowRoot, lane: string): HTMLElement {
  const container = document.createElement('div');
  container.className = 'widget-container';
  if (lane === 'admin') {
    container.classList.add('admin-widget');
  }
  container.style.width = '100%';
  container.style.height = '100%';
  root.appendChild(container);
  return container;
}

function stopFormControlDrag(wrapper: HTMLElement, container: HTMLElement): void {
  const stop = (ev: Event) => {
    const target = ev.target as Element | null;
    const formControl = target?.closest('input, textarea, select, label, button');
    if (!formControl) return;
    ev.stopPropagation();
  };
  container.addEventListener('pointerdown', stop);
  container.addEventListener('mousedown', stop);
  container.addEventListener(
    'touchstart',
    stop,
    { passive: true }
  );
  wrapper.addEventListener('pointerdown', stop);
  wrapper.addEventListener('mousedown', stop);
  wrapper.addEventListener(
    'touchstart',
    stop,
    { passive: true }
  );
}

function attachResizeHandleSlot(root: ShadowRoot): void {
  const handleSlot = document.createElement('slot');
  handleSlot.name = 'resize-handle';
  root.appendChild(handleSlot);

  const handleSheet = new CSSStyleSheet();
  // Resize handles are dashboard chrome, so they follow Studio border tokens in both light and dark mode.
  handleSheet.replaceSync(`::slotted(.resize-handle){position:absolute;right:0;bottom:0;width:12px;height:12px;cursor:se-resize;background:var(--studio-border-strong, rgba(17, 24, 39, 0.24));border-radius:999px;}`);
  root.adoptedStyleSheets = [...root.adoptedStyleSheets, handleSheet];
}

export function createRuntimeWidgetShell(
  wrapper: HTMLElement,
  lane = 'public'
): RuntimeWidgetShell {
  const root = wrapper.attachShadow({ mode: 'open' });
  const globalCss = getGlobalCssUrl(lane);

  const style = document.createElement('style');
  style.textContent = `@import url('${globalCss}');`;
  root.appendChild(style);

  const container = createWidgetContainer(root, lane);
  stopFormControlDrag(wrapper, container);
  attachResizeHandleSlot(root);

  return { root, container };
}
