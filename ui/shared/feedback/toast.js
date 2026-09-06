const REGION_ID = 'bp-toast-region';
const DEFAULT_DURATION = 3000;
const MAX_VISIBLE_TOASTS = 3;
const REMOVE_EVENT = 'bp-toast:remove';
const ICON_BY_TONE = {
    neutral: 'bell',
    info: 'info',
    success: 'circle-check',
    warning: 'triangle-alert',
    error: 'circle-x'
};
function messageText(value) {
    if (value instanceof Error)
        return value.message;
    if (value === null || value === undefined)
        return '';
    return String(value);
}
function ensureRegion() {
    if (typeof document === 'undefined' || !document.body)
        return null;
    const existing = document.getElementById(REGION_ID);
    if (existing)
        return existing;
    const region = document.createElement('section');
    region.id = REGION_ID;
    region.className = 'bp-toast-region app-scope';
    region.setAttribute('aria-label', 'Status messages');
    document.body.appendChild(region);
    return region;
}
function nextFrame(callback) {
    if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(callback);
    }
    else {
        window.setTimeout(() => callback(Date.now()), 0);
    }
}
export function showToast(options) {
    const region = ensureRegion();
    if (!region) {
        console.warn('BP_TOAST_DOCUMENT_UNAVAILABLE: Toast could not be mounted.');
        return { element: null, dismiss: () => { } };
    }
    const tone = options.tone ?? 'neutral';
    const toast = document.createElement('article');
    toast.className = `bp-toast bp-toast--${tone}`;
    toast.dataset.toastTone = tone;
    toast.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    const icon = document.createElement('img');
    icon.className = 'bp-toast__icon';
    icon.src = `/assets/icons/${ICON_BY_TONE[tone]}.svg`;
    icon.alt = '';
    icon.setAttribute('aria-hidden', 'true');
    const symbol = document.createElement('span');
    symbol.className = 'bp-toast__symbol';
    symbol.appendChild(icon);
    const content = document.createElement('div');
    content.className = 'bp-toast__content';
    if (options.title) {
        const title = document.createElement('strong');
        title.className = 'bp-toast__title';
        title.textContent = options.title;
        content.appendChild(title);
    }
    const message = document.createElement('p');
    message.className = 'bp-toast__message';
    message.textContent = messageText(options.message);
    message.title = message.textContent;
    content.appendChild(message);
    let settled = false;
    let timer = null;
    let exitTimer = null;
    let hovered = false;
    let focused = false;
    let startedAt = 0;
    const requestedDuration = Number(options.duration ?? DEFAULT_DURATION);
    const duration = Number.isFinite(requestedDuration) ? Math.max(0, requestedDuration) : DEFAULT_DURATION;
    let remaining = duration;
    const remove = () => {
        settled = true;
        if (timer !== null)
            window.clearTimeout(timer);
        if (exitTimer !== null)
            window.clearTimeout(exitTimer);
        toast.remove();
        if (!region.childElementCount)
            region.remove();
    };
    // Different browser bundles share the existing DOM region. Disposing through
    // its card also cancels that card's timers without introducing another store.
    toast.addEventListener(REMOVE_EVENT, remove, { once: true });
    const dismiss = () => {
        if (settled)
            return;
        settled = true;
        if (timer !== null)
            window.clearTimeout(timer);
        toast.classList.add('is-leaving');
        exitTimer = window.setTimeout(remove, 160);
    };
    const actions = document.createElement('div');
    actions.className = 'bp-toast__actions';
    if (options.action) {
        const action = document.createElement('button');
        action.type = 'button';
        action.className = 'button text sm bp-toast__action';
        action.textContent = options.action.label;
        action.addEventListener('click', () => {
            if (settled)
                return;
            action.disabled = true;
            Promise.resolve().then(() => options.action?.onClick()).catch(error => {
                console.error('BP_TOAST_ACTION_FAILED: Toast action failed.', error);
            });
            dismiss();
        });
        actions.appendChild(action);
    }
    if (options.dismissible !== false) {
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'bp-toast__close';
        close.setAttribute('aria-label', 'Dismiss notification');
        const closeIcon = document.createElement('img');
        closeIcon.src = '/assets/icons/x.svg';
        closeIcon.alt = '';
        closeIcon.setAttribute('aria-hidden', 'true');
        close.appendChild(closeIcon);
        close.addEventListener('click', dismiss);
        actions.appendChild(close);
    }
    toast.append(symbol, content, actions);
    region.prepend(toast);
    // Drop the oldest immediately, including any exit animation, so a burst
    // never paints a fourth card. Persistent notifications retain their own hub.
    while (region.childElementCount > MAX_VISIBLE_TOASTS) {
        const oldest = region.lastElementChild;
        oldest.dispatchEvent(new Event(REMOVE_EVENT));
        // A card left by an older bundle may not have the disposal listener yet.
        oldest.remove();
    }
    nextFrame(() => { if (!settled)
        toast.classList.add('is-visible'); });
    // Pausing while the toast is being read keeps short-lived feedback usable
    // for keyboard and pointer users without making all messages permanent.
    const scheduleDismiss = () => {
        if (!duration || settled || hovered || focused || timer !== null)
            return;
        startedAt = Date.now();
        timer = window.setTimeout(dismiss, remaining);
    };
    const pauseDismiss = () => {
        if (timer !== null) {
            remaining = Math.max(0, remaining - (Date.now() - startedAt));
            window.clearTimeout(timer);
        }
        timer = null;
    };
    toast.addEventListener('mouseenter', () => { hovered = true; pauseDismiss(); });
    toast.addEventListener('mouseleave', () => { hovered = false; scheduleDismiss(); });
    toast.addEventListener('focusin', () => { focused = true; pauseDismiss(); });
    toast.addEventListener('focusout', event => {
        if (event.relatedTarget instanceof Node && toast.contains(event.relatedTarget))
            return;
        focused = false;
        scheduleDismiss();
    });
    scheduleDismiss();
    return { element: toast, dismiss };
}
function clearToasts() {
    document.getElementById(REGION_ID)?.querySelectorAll('.bp-toast')
        .forEach(toast => toast.dispatchEvent(new Event(REMOVE_EVENT)));
}
export const bpToast = {
    show: showToast,
    info: (message, options = {}) => showToast({ ...options, message, tone: 'info' }),
    success: (message, options = {}) => showToast({ ...options, message, tone: 'success' }),
    warning: (message, options = {}) => showToast({ ...options, message, tone: 'warning' }),
    error: (message, options = {}) => showToast({ ...options, message, tone: 'error' }),
    clear: clearToasts
};
if (typeof window !== 'undefined') {
    window.bpToast = bpToast;
}
