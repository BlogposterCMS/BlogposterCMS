export async function render(el) {
    if (!el)
        return;
    el.innerHTML = `
    <div class="home-drag-widget">
      <p class="home-widget-kicker">Dashboard layout</p>
      <h3>Arrange cards when you need more room</h3>
      <p class="home-widget-copy">Use the existing edit controls to move or resize cards after the first page is set up.</p>
    </div>
  `;
}
