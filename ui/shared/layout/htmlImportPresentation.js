const observedRoots = new WeakMap();
/** Derived capture geometry stays on the existing layout surface; explicit Section resizing wins. */
export function applyHtmlImportPresentation(wrapper, info) {
    const page = info?.page;
    if (!page || typeof page.rootId !== 'string' || !/^html-import-[a-f0-9]+(?:-[a-z0-9-]+)?$/.test(page.rootId))
        return;
    const root = wrapper.closest(`[data-node-id="${page.rootId}"]`);
    if (!root || observedRoots.has(root) || !Array.isArray(page.frames))
        return;
    const frames = page.frames.filter((frame) => [frame?.minWidth, frame?.maxWidth, frame?.height].every(Number.isFinite)
        && frame.minWidth >= 320 && frame.maxWidth <= 3840 && frame.height > 0 && frame.height <= 200000);
    if (!frames.length)
        return;
    const containerRoot = page.containerRootId === 'page-root'
        ? root.closest('[data-node-id="page-root"]') || root : root;
    containerRoot.style.containerType = 'inline-size';
    containerRoot.style.containerName = /^bp-import-[a-f0-9]+$/.test(page.containerName || '')
        ? page.containerName : `bp-import-${page.rootId.slice('html-import-'.length)}`;
    const apply = () => {
        // A toolbar resize changes the canonical setting. Never overwrite that user-authored value.
        if (root.dataset.layoutMinHeight !== String(page.initialMinHeight))
            return;
        const width = root.clientWidth;
        const frame = frames.find(candidate => width >= candidate.minWidth && width <= candidate.maxWidth);
        if (frame)
            root.style.minHeight = `${frame.height}px`;
    };
    apply();
    if (typeof ResizeObserver === 'function') {
        const observer = new ResizeObserver(apply);
        observedRoots.set(root, observer);
        observer.observe(root);
    }
}
