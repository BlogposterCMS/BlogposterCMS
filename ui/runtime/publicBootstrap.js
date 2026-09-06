export function readPublicBootstrap() {
    const value = window.BP_PUBLIC_BOOTSTRAP;
    if (!value)
        return null;
    // A document snapshot belongs to this route/language only. CSR remains the
    // fallback for shells that do not carry a compatible server handoff.
    if (value.version !== 1 || !value.envelope || !Array.isArray(value.envelope.attachments)
        || typeof value.slug !== 'string' || value.pathname !== location.pathname
        || value.language !== (window.LANG || 'en')) {
        console.warn('PUBLIC_BOOTSTRAP_INVALID: Falling back to client page discovery.');
        // Never leave the previous response's owned DOM beside a fresh CSR render.
        document.querySelectorAll('#bp-initial-html, #bp-grid[data-bp-initial-layout="true"], #bp-initial-page-css')
            .forEach(element => element.remove());
        delete document.documentElement.dataset.bpPublicLayoutReady;
        return null;
    }
    return value;
}
