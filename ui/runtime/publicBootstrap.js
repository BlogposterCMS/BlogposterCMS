export function readPublicBootstrap() {
    const value = window.BP_PUBLIC_BOOTSTRAP;
    if (!value)
        return null;
    // A document snapshot belongs to this route/language only. CSR remains the
    // fallback for shells that do not carry a compatible server handoff.
    if ((value.version !== 1 && value.version !== 2) || !value.envelope || !Array.isArray(value.envelope.attachments)
        || typeof value.slug !== 'string' || value.pathname !== location.pathname
        || value.language !== (window.LANG || 'en')
        || (value.version === 2 && (!value.htmlRendered || !document.getElementById('bp-initial-html')))) {
        console.warn('PUBLIC_BOOTSTRAP_INVALID: Falling back to client page discovery.');
        // Never leave the previous response's owned DOM beside a fresh CSR render.
        document.querySelectorAll('#bp-initial-html, #bp-grid[data-bp-initial-layout="true"], #bp-grid[data-bp-initial-structure], #bp-initial-page-css')
            .forEach(element => element.remove());
        delete document.documentElement.dataset.bpPublicLayoutReady;
        return null;
    }
    if (value.version === 2) {
        // Restore the loader's existing descriptor in memory from the sanitized DOM,
        // avoiding a second HTML copy on the wire while retaining normal CSR fallback.
        const initialHtml = document.getElementById('bp-initial-html');
        const attachments = value.envelope.attachments.map(attachment => {
            const descriptor = attachment.descriptor;
            if (attachment.type !== 'html' || descriptor?.htmlFromInitialResponse !== true)
                return attachment;
            return {
                ...attachment,
                descriptor: { ...descriptor, inline: { ...descriptor.inline, html: initialHtml.innerHTML } }
            };
        });
        return { ...value, envelope: { ...value.envelope, attachments } };
    }
    return value;
}
