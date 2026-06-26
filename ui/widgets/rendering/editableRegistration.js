function callRegistrar(registrar, element) {
    const registerElement = registrar?.registerElement || registrar?.default?.registerElement;
    if (typeof registerElement !== 'function')
        return false;
    registerElement(element);
    return true;
}
export async function registerEditableElement(element, source = 'widget') {
    const detail = { element, source, handled: false };
    document.dispatchEvent(new CustomEvent('ui:widget-editable-mounted', { detail }));
    if (detail.handled)
        return true;
    const bridgeWindow = window;
    if (callRegistrar(bridgeWindow.BP_WIDGET_EDITOR, element) ||
        callRegistrar(bridgeWindow.BP_DESIGNER_EDITOR, element)) {
        return true;
    }
    if (!document.body.classList.contains('builder-mode'))
        return false;
    try {
        const mod = await import(
        /* webpackIgnore: true */ '/build/designerEditor.js');
        return callRegistrar(mod, element);
    }
    catch (err) {
        console.warn(`[${source}] editor bridge load failed`, err);
        return false;
    }
}
