export function bindGlobalListeners(rootEl, emit) {
    const rafEvents = new Set(['mousemove', 'touchmove', 'scroll', 'dragover', 'wheel']);
    const rootEvents = [
        'mousedown', 'mousemove', 'mouseup', 'mouseleave', 'click', 'dblclick', 'contextmenu',
        'touchstart', 'touchmove', 'touchend', 'dragstart', 'dragend', 'dragover', 'drop', 'blur', 'focus'
    ];
    const winEvents = ['keydown', 'keyup', 'resize', 'scroll', 'wheel'];
    const add = (target, evt) => {
        let frame = null;
        const handler = (event) => {
            if (rafEvents.has(evt)) {
                if (frame)
                    return;
                frame = requestAnimationFrame(() => {
                    frame = null;
                    emit(evt, event);
                });
            }
            else {
                emit(evt, event);
            }
        };
        target.addEventListener(evt, handler);
    };
    rootEvents.forEach(evt => add(rootEl, evt));
    winEvents.forEach(evt => add(window, evt));
}
const globalEmitter = new EventTarget();
let globalBound = false;
export function initGlobalEvents(rootEl = document) {
    if (globalBound)
        return;
    globalBound = true;
    bindGlobalListeners(rootEl, (evt, event) => {
        globalEmitter.dispatchEvent(new CustomEvent(evt, { detail: event }));
    });
}
export function onGlobalEvent(evt, cb) {
    const handler = (event) => cb(event.detail);
    globalEmitter.addEventListener(evt, handler);
    return () => globalEmitter.removeEventListener(evt, handler);
}
