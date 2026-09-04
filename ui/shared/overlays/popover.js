const VIEWPORT_GAP = 12;
let popoverId = 0;
let activePopover = null;
function nextFrame(callback) {
    if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(callback);
    }
    else {
        window.setTimeout(() => callback(Date.now()), 0);
    }
}
function nextPopoverId() {
    popoverId += 1;
    return `bp-popover-${popoverId}`;
}
function contentNode(content) {
    if (typeof content === 'function')
        return content();
    if (typeof content !== 'string')
        return content;
    const text = document.createElement('p');
    text.className = 'bp-popover__message';
    text.textContent = content;
    return text;
}
function firstFocusable(panel) {
    return panel.querySelector([
        'button:not([disabled])',
        'a[href]',
        'input:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
    ].join(','));
}
export function openPopover(anchor, options) {
    if (!(anchor instanceof HTMLElement) || !anchor.isConnected) {
        throw new Error('BP_POPOVER_ANCHOR_INVALID: A connected HTML anchor is required.');
    }
    if (typeof document === 'undefined' || !document.body) {
        throw new Error('BP_POPOVER_DOCUMENT_UNAVAILABLE: Popover cannot be mounted.');
    }
    activePopover?.close();
    const layer = document.createElement('div');
    layer.className = 'bp-popover-layer app-scope';
    const panel = document.createElement('section');
    const panelId = nextPopoverId();
    panel.id = panelId;
    panel.className = 'bp-popover';
    panel.dataset.placement = options.placement ?? 'bottom-start';
    panel.setAttribute('role', options.role ?? 'dialog');
    panel.setAttribute('aria-label', options.ariaLabel ?? 'Popover');
    panel.appendChild(contentNode(options.content));
    layer.appendChild(panel);
    document.body.appendChild(layer);
    const previousExpanded = anchor.getAttribute('aria-expanded');
    const previousControls = anchor.getAttribute('aria-controls');
    anchor.setAttribute('aria-expanded', 'true');
    anchor.setAttribute('aria-controls', panelId);
    let closed = false;
    const updatePosition = () => {
        if (closed || !anchor.isConnected)
            return;
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
        if (closed)
            return;
        closed = true;
        document.removeEventListener('pointerdown', onPointerDown, true);
        document.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('resize', updatePosition);
        window.removeEventListener('scroll', updatePosition, true);
        if (previousExpanded === null)
            anchor.removeAttribute('aria-expanded');
        else
            anchor.setAttribute('aria-expanded', previousExpanded);
        if (previousControls === null)
            anchor.removeAttribute('aria-controls');
        else
            anchor.setAttribute('aria-controls', previousControls);
        panel.classList.add('is-leaving');
        window.setTimeout(() => layer.remove(), 140);
        if (activePopover?.panel === panel)
            activePopover = null;
        options.onClose?.();
    };
    function onPointerDown(event) {
        const path = event.composedPath();
        if (path.includes(panel) || path.includes(anchor))
            return;
        if (options.dismissible !== false)
            close();
    }
    function onKeyDown(event) {
        if (event.key !== 'Escape' || options.dismissible === false)
            return;
        event.preventDefault();
        close();
        anchor.focus();
    }
    const handle = { panel, close, updatePosition };
    activePopover = handle;
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    updatePosition();
    nextFrame(() => {
        panel.classList.add('is-visible');
        updatePosition();
        if (options.autoFocus)
            firstFocusable(panel)?.focus();
    });
    return handle;
}
export const bpPopover = {
    open: openPopover,
    close: () => activePopover?.close()
};
if (typeof window !== 'undefined') {
    window.bpPopover = bpPopover;
}
