import { openPopover } from './popover.js';
const scopes = new WeakSet();
/** Explicit text hints reuse the shared portal, positioning and theme. Accessible
 * names and authored content are never converted into tooltips implicitly. */
export function mountTooltips(root) {
    scopes.add(root);
    let anchor = null;
    let overlay;
    let timer;
    const cancelTimer = () => { if (timer)
        clearTimeout(timer); timer = undefined; };
    const hide = () => { cancelTimer(); overlay?.close(); overlay = undefined; anchor = null; };
    const target = (event) => {
        const element = event.target instanceof Element ? event.target.closest('[data-bp-tooltip]') : null;
        if (!element || !root.contains(element))
            return null;
        for (let owner = element; owner && owner !== root; owner = owner.parentElement) {
            if (scopes.has(owner))
                return null;
        }
        return element;
    };
    const hideSoon = () => { cancelTimer(); timer = setTimeout(hide, 120); };
    function show(next) {
        cancelTimer();
        if (!next.isConnected || next.closest('[inert]'))
            return;
        // A hover must not replace an open language picker or another editor menu.
        if (document.querySelector('.bp-popover:not(.is-leaving):is([role="dialog"],[role="menu"])'))
            return;
        const text = next.dataset.bpTooltip?.trim();
        if (!text)
            return;
        if (overlay && anchor === next)
            return;
        hide();
        anchor = next;
        const unavailable = next.matches(':disabled,[aria-disabled="true"]');
        overlay = openPopover(next, { role: 'tooltip', ariaLabel: text,
            content: unavailable ? `${text} — unavailable in the current context.` : text,
            autoFocus: false, offset: 8, onClose: () => { overlay = undefined; anchor = null; cancelTimer(); } });
        overlay.panel.classList.add('bp-tooltip');
        overlay.panel.addEventListener('pointerenter', cancelTimer);
        overlay.panel.addEventListener('pointerleave', hideSoon);
        overlay.updatePosition();
    }
    function pointerOver(event) {
        if (event.pointerType === 'touch')
            return;
        const next = target(event);
        if (!next || next.contains(event.relatedTarget))
            return;
        cancelTimer();
        timer = setTimeout(() => show(next), 220);
    }
    function pointerOut(event) {
        const next = target(event);
        if (!next || next.contains(event.relatedTarget))
            return;
        if (next.contains(document.activeElement))
            return;
        hideSoon();
    }
    function focusIn(event) { const next = target(event); if (next)
        show(next); }
    function focusOut(event) { if (target(event))
        hideSoon(); }
    root.addEventListener('pointerover', pointerOver);
    root.addEventListener('pointerout', pointerOut);
    root.addEventListener('focusin', focusIn);
    root.addEventListener('focusout', focusOut);
    root.addEventListener('pointerdown', hide, true);
    root.addEventListener('click', hide, true);
    return { hide, stop: () => {
            hide();
            scopes.delete(root);
            root.removeEventListener('pointerover', pointerOver);
            root.removeEventListener('pointerout', pointerOut);
            root.removeEventListener('focusin', focusIn);
            root.removeEventListener('focusout', focusOut);
            root.removeEventListener('pointerdown', hide, true);
            root.removeEventListener('click', hide, true);
        } };
}
