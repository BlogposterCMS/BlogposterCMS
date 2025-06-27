export function bindGlobalListeners(rootEl, emit) {
  const rafEvents = new Set(['mousemove','touchmove','scroll','dragover','wheel']);
  const rootEvents = [
    'mousedown','mousemove','mouseup','mouseleave','click','dblclick','contextmenu',
    'touchstart','touchmove','touchend','dragstart','dragend','dragover','drop','blur','focus'
  ];
  const winEvents = ['keydown','keyup','resize','scroll','wheel'];
  const add = (target, evt) => {
    let frame;
    const handler = e => {
      if (rafEvents.has(evt)) {
        if (frame) return;
        frame = requestAnimationFrame(() => { frame = null; emit(evt, e); });
      } else {
        emit(evt, e);
      }
    };
    target.addEventListener(evt, handler);
  };
  rootEvents.forEach(evt => add(rootEl, evt));
  winEvents.forEach(evt => add(window, evt));
}
