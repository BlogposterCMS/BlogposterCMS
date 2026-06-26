export async function render(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  el.innerHTML = `
    <div class="home-drag-widget">
      <h2>HEY I AM DRAGBAR</h2>
      <p>CLICK ON THE ${window.featherIcon?.('move') ?? ''} TO MOVE ME</p>
    </div>
  `;
}
