export type BpPopoverPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

export interface BpPopoverOptions {
  /** Public widget portals stay inside their own styled root; admin callers keep the default. */
  portalRoot?: HTMLElement | ShadowRoot;
  content: string | Node | (() => Node);
  placement?: BpPopoverPlacement;
  role?: 'dialog' | 'menu' | 'tooltip';
  ariaLabel?: string;
  dismissible?: boolean;
  autoFocus?: boolean;
  offset?: number;
  onClose?: () => void;
}

export interface BpPopoverHandle {
  panel: HTMLElement;
  close: () => void;
  updatePosition: () => void;
}

export interface BpPopoverApi {
  open: (anchor: HTMLElement, options: BpPopoverOptions) => BpPopoverHandle;
  close: () => void;
}

declare global {
  interface Window {
    bpPopover?: BpPopoverApi;
  }
}

const VIEWPORT_GAP = 12;
let popoverId = 0;
let activePopover: BpPopoverHandle | null = null;

function nextFrame(callback: FrameRequestCallback): void {
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(callback);
  } else {
    window.setTimeout(() => callback(Date.now()), 0);
  }
}

function nextPopoverId(): string {
  popoverId += 1;
  return `bp-popover-${popoverId}`;
}

function contentNode(content: BpPopoverOptions['content']): Node {
  if (typeof content === 'function') return content();
  if (typeof content !== 'string') return content;
  const text = document.createElement('p');
  text.className = 'bp-popover__message';
  text.textContent = content;
  return text;
}

function firstFocusable(panel: HTMLElement): HTMLElement | null {
  return panel.querySelector<HTMLElement>([
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(','));
}

export function openPopover(anchor: HTMLElement, options: BpPopoverOptions): BpPopoverHandle {
  if (!(anchor instanceof HTMLElement) || !anchor.isConnected) {
    throw new Error('BP_POPOVER_ANCHOR_INVALID: A connected HTML anchor is required.');
  }
  if (typeof document === 'undefined' || !document.body) {
    throw new Error('BP_POPOVER_DOCUMENT_UNAVAILABLE: Popover cannot be mounted.');
  }

  activePopover?.close();

  const layer = document.createElement('div');
  layer.className = 'bp-popover-layer app-scope';
  // Positioning is component behavior and must also work without the admin stylesheet.
  layer.style.cssText = 'position:fixed;inset:0;z-index:var(--bp-layer-popover,1500);pointer-events:none';
  const panel = document.createElement('section');
  const panelId = nextPopoverId();
  panel.id = panelId;
  // Like the dialog panel, the portal's content owns its shared control styles,
  // including when Studio scopes its UI kit beneath the portal layer.
  panel.className = 'bp-popover app-scope';
  panel.style.cssText = 'position:fixed;pointer-events:auto;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto';
  panel.dataset.placement = options.placement ?? 'bottom-start';
  panel.setAttribute('role', options.role ?? 'dialog');
  panel.setAttribute('aria-label', options.ariaLabel ?? 'Popover');
  panel.appendChild(contentNode(options.content));
  layer.appendChild(panel);
  (options.portalRoot || document.body).appendChild(layer);
  if (options.portalRoot && typeof layer.showPopover === 'function') {
    // The top layer escapes clipping/transforms while retaining the authored CSS ancestry.
    layer.popover = 'manual';
    layer.style.cssText += ';margin:0;padding:0;border:0;background:transparent;width:100vw;height:100vh;overflow:visible';
    layer.showPopover();
  }

  const previousExpanded = anchor.getAttribute('aria-expanded');
  const previousControls = anchor.getAttribute('aria-controls');
  const previousDescription = anchor.getAttribute('aria-describedby');
  // ID references cannot cross a ShadowRoot. A hidden local description keeps
  // the tooltip accessible while its visual panel uses the shared body portal.
  const anchorRoot = anchor.getRootNode();
  const localDescription = options.role === 'tooltip' && anchorRoot instanceof ShadowRoot && options.portalRoot !== anchorRoot ? document.createElement('span') : null;
  if (localDescription) {
    localDescription.id = panelId; localDescription.hidden = true; localDescription.textContent = panel.textContent;
    anchorRoot.appendChild(localDescription);
  }
  if (options.role === 'tooltip') anchor.setAttribute('aria-describedby', [previousDescription, panelId].filter(Boolean).join(' '));
  else {
    anchor.setAttribute('aria-expanded', 'true');
    anchor.setAttribute('aria-controls', panelId);
  }

  let closed = false;
  const updatePosition = () => {
    if (closed || !anchor.isConnected) return;
    const anchorRect = anchor.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const requested = options.placement ?? 'bottom-start';
    const offset = Math.max(0, Number(options.offset ?? 8));
    const preferTop = requested.startsWith('top');
    const alignEnd = requested.endsWith('end');
    const spaceBelow = window.innerHeight - anchorRect.bottom - VIEWPORT_GAP;
    const spaceAbove = anchorRect.top - VIEWPORT_GAP;
    const useTop = preferTop
      ? spaceAbove >= panelRect.height + offset || spaceAbove > spaceBelow
      : spaceBelow < panelRect.height + offset && spaceAbove > spaceBelow;

    let top = useTop
      ? anchorRect.top - panelRect.height - offset
      : anchorRect.bottom + offset;
    let left = alignEnd
      ? anchorRect.right - panelRect.width
      : anchorRect.left;

    top = Math.max(VIEWPORT_GAP, Math.min(top, window.innerHeight - panelRect.height - VIEWPORT_GAP));
    left = Math.max(VIEWPORT_GAP, Math.min(left, window.innerWidth - panelRect.width - VIEWPORT_GAP));
    panel.style.top = `${Math.round(top)}px`;
    panel.style.left = `${Math.round(left)}px`;
    panel.dataset.resolvedPlacement = `${useTop ? 'top' : 'bottom'}-${alignEnd ? 'end' : 'start'}`;
  };

  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('resize', updatePosition);
    window.removeEventListener('scroll', updatePosition, true);
    if (previousExpanded === null) anchor.removeAttribute('aria-expanded');
    else anchor.setAttribute('aria-expanded', previousExpanded);
    if (previousControls === null) anchor.removeAttribute('aria-controls');
    else anchor.setAttribute('aria-controls', previousControls);
    if (options.role === 'tooltip') {
      localDescription?.remove();
      if (previousDescription === null) anchor.removeAttribute('aria-describedby');
      else anchor.setAttribute('aria-describedby', previousDescription);
    }
    if (layer.popover && typeof layer.hidePopover === 'function') layer.hidePopover();
    panel.classList.add('is-leaving');
    window.setTimeout(() => layer.remove(), 140);
    if (activePopover?.panel === panel) activePopover = null;
    options.onClose?.();
  };

  function onPointerDown(event: PointerEvent) {
    const path = event.composedPath();
    if (path.includes(panel) || path.includes(anchor)) return;
    if (options.dismissible !== false) close();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || options.dismissible === false) return;
    event.preventDefault();
    close();
    if (options.role !== 'tooltip') anchor.focus();
  }

  const handle: BpPopoverHandle = { panel, close, updatePosition };
  activePopover = handle;
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('resize', updatePosition);
  window.addEventListener('scroll', updatePosition, true);
  updatePosition();
  nextFrame(() => {
    panel.classList.add('is-visible');
    updatePosition();
    if (options.autoFocus) firstFocusable(panel)?.focus();
  });

  return handle;
}

export const bpPopover: BpPopoverApi = {
  open: openPopover,
  close: () => activePopover?.close()
};

if (typeof window !== 'undefined') {
  window.bpPopover = bpPopover;
}
