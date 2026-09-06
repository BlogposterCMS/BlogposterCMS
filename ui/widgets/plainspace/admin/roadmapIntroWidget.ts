export async function render(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  el.innerHTML = `
    <div class="home-update-widget home-getting-started-widget">
      <p class="home-widget-kicker">Your workspace</p>
      <h2>Manage your site</h2>
      <p class="home-widget-copy">Organize pages, continue a design or manage your media.</p>
      <div class="home-start-actions" aria-label="Recommended first actions">
        <a class="home-start-action home-start-action--primary" href="/admin/content" data-home-onboarding-action="create-page">
          <span>1</span>
          <strong>Manage pages</strong>
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
