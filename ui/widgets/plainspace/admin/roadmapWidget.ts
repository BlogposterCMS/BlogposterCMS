export async function render(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  el.innerHTML = `
    <div class="home-roadmap-widget">
      <p class="home-widget-kicker">Launch checklist</p>
      <h3>Make the site feel ready</h3>
      <p class="home-widget-copy">These checks stay inside the existing Blogposter workflow and help new editors move from a blank install to a usable site.</p>
      <ul class="home-check-list">
        <li>Create or import the first public page.</li>
        <li>Connect a layout or Design Studio draft.</li>
        <li>Upload the first real image or document.</li>
        <li>Publish only after page status and navigation look correct.</li>
      </ul>
    </div>
  `;
}
