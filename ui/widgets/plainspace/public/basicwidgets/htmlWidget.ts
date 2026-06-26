export function render(el: HTMLElement | null): void {
  if (!el) return;
  el.innerHTML = '<div class="html-widget">Edit HTML</div>';
}
