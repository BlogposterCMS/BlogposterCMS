export async function render(el) {
    if (!el)
        return;
    el.innerHTML = `
    <div class="home-drag-widget">
      <h2>HEY I AM DRAGBAR</h2>
      <p>CLICK ON THE ${window.featherIcon?.('move') ?? ''} TO MOVE ME</p>
    </div>
  `;
}
