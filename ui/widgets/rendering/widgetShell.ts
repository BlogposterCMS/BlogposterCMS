function stopFormControlDrag(ev: Event): void {
  const target = ev.target instanceof Element
    ? ev.target.closest('input, textarea, select, label, button')
    : null;
  if (!target) return;
  ev.stopPropagation();
  ev.stopImmediatePropagation();
}

export function createWidgetRenderShell(content: HTMLElement): HTMLElement {
  content.replaceChildren();

  const container = document.createElement('div');
  container.className = 'widget-container admin-widget';
  container.style.width = '100%';
  container.style.height = '100%';

  container.addEventListener('pointerdown', stopFormControlDrag, true);
  container.addEventListener('mousedown', stopFormControlDrag, true);
  container.addEventListener('touchstart', stopFormControlDrag, { capture: true, passive: true });
  content.addEventListener('pointerdown', stopFormControlDrag, true);
  content.addEventListener('mousedown', stopFormControlDrag, true);
  content.addEventListener('touchstart', stopFormControlDrag, { capture: true, passive: true });
  content.appendChild(container);

  return container;
}
