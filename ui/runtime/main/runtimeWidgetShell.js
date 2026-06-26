import { getGlobalCssUrl } from './runtimePageShell.js';
function createWidgetContainer(root, lane) {
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
function stopFormControlDrag(wrapper, container) {
    const stop = (ev) => {
        const target = ev.target;
        const formControl = target?.closest('input, textarea, select, label, button');
        if (!formControl)
            return;
        ev.stopPropagation();
    };
    container.addEventListener('pointerdown', stop);
    container.addEventListener('mousedown', stop);
    container.addEventListener('touchstart', stop, { passive: true });
    wrapper.addEventListener('pointerdown', stop);
    wrapper.addEventListener('mousedown', stop);
    wrapper.addEventListener('touchstart', stop, { passive: true });
}
function attachResizeHandleSlot(root) {
    const handleSlot = document.createElement('slot');
    handleSlot.name = 'resize-handle';
    root.appendChild(handleSlot);
    const handleSheet = new CSSStyleSheet();
    // Resize handles are dashboard chrome, so they follow Studio border tokens in both light and dark mode.
    handleSheet.replaceSync(`::slotted(.resize-handle){position:absolute;right:0;bottom:0;width:12px;height:12px;cursor:se-resize;background:var(--studio-border-strong, rgba(17, 24, 39, 0.24));border-radius:999px;}`);
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, handleSheet];
}
export function createRuntimeWidgetShell(wrapper, lane = 'public') {
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
