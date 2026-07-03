export async function render(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  el.innerHTML = `
    <div class="home-update-widget home-getting-started-widget">
      <p class="home-widget-kicker">First steps</p>
      <h2>Build your first page</h2>
      <p class="home-widget-copy">Start with the existing content workflow: create a page, shape it in Design Studio, then add media when the layout needs real assets.</p>
      <div class="home-start-actions" aria-label="Recommended first actions">
        <a class="home-start-action home-start-action--primary" href="/admin/content" data-home-onboarding-action="create-page">
          <span>1</span>
          <strong>Create a page</strong>
        </a>
        <a class="home-start-action" href="/admin/content/designer-layouts" data-home-onboarding-action="open-design-studio">
          <span>2</span>
          <strong>Open Design Studio</strong>
        </a>
        <a class="home-start-action" href="/admin/content/media" data-home-onboarding-action="upload-media">
          <span>3</span>
          <strong>Add media</strong>
        </a>
      </div>
    </div>
  `;
}
