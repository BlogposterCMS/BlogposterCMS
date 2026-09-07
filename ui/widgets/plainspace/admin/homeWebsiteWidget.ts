import { fetchContentDesigns } from './defaultwidgets/contentSummaryData.js';
import { fetchPagesByLane } from './defaultwidgets/pageStatsData.js';
import { adminHomeBase, mountHome } from './homeWidgetStyles.js';

export async function render(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  const base = adminHomeBase();
  const root = mountHome(el, `<header class="top"><div><span class="eyebrow">Your workspace</span><h2>Bring your next idea to life.</h2><p class="muted">Your most recently updated design.</p></div></header>
    <a class="preview" aria-label="Open latest design"><div class="empty"><img src="/assets/icons/layout-dashboard.svg" alt=""><h3>Loading your workspace…</h3></div></a>
    <div class="project"><div><h3 data-title>Your website</h3><span class="status" data-status></span></div><nav class="actions"><a class="button primary" data-continue>Continue designing</a><a class="button" data-new>New page</a></nav></div>
    <p class="muted" role="status" data-message></p><footer class="footer"><a data-pages>Pages</a><a data-drafts>Drafts</a><a data-media>Open media</a></footer>`);
  const preview = root.querySelector<HTMLAnchorElement>('.preview')!;
  const continueLink = root.querySelector<HTMLAnchorElement>('[data-continue]')!;
  // Studio has its own server entry, outside the admin page router.
  for (const link of [preview, continueLink]) { link.target = '_blank'; link.rel = 'noopener'; }
  continueLink.href = `${base}/content/designer-layouts`;
  preview.href = continueLink.href;
  root.querySelector<HTMLAnchorElement>('[data-new]')!.href = `${base}/content/pages`;
  root.querySelector<HTMLAnchorElement>('[data-pages]')!.href = `${base}/content/pages`;
  root.querySelector<HTMLAnchorElement>('[data-drafts]')!.href = `${base}/content/pages`;
  root.querySelector<HTMLAnchorElement>('[data-media]')!.href = `${base}/content/media`;
  // Independent reads keep page counts available if design access is unavailable.
  const [designs, pages] = await Promise.allSettled([
    fetchContentDesigns(window.meltdownEmit, window.ADMIN_TOKEN),
    fetchPagesByLane(window.meltdownEmit, window.ADMIN_TOKEN, 'public')
  ]);
  if (pages.status === 'fulfilled') {
    root.querySelector('[data-pages]')!.textContent = `${pages.value.filter(p => p.status === 'published').length} published`;
    root.querySelector('[data-drafts]')!.textContent = `${pages.value.filter(p => p.status === 'draft').length} drafts`;
  }
  const latest = designs.status === 'fulfilled' ? designs.value
    .filter(d => d.id != null && d.status !== 'deleted')
    .sort((a, b) => (Date.parse(String(b.updated_at)) || 0) - (Date.parse(String(a.updated_at)) || 0))[0] : null;
  preview.replaceChildren();
  if (latest) {
    continueLink.href = `${base}/studio/design/${encodeURIComponent(String(latest.id))}`;
    preview.href = continueLink.href;
    root.querySelector('[data-title]')!.textContent = latest.title || 'Untitled design';
    root.querySelector('[data-status]')!.textContent = 'Saved design';
  }
  const emptyPreview = () => {
    preview.innerHTML = `<div class="empty"><img src="/assets/icons/layout-dashboard.svg" alt=""><h3>${latest ? 'Your design is ready to continue.' : 'Start with your first design.'}</h3><p class="muted">${latest ? 'No saved preview available. Open Design Studio to continue.' : 'Build your page in Design Studio.'}</p></div>`;
  };
  // Reuse the stored thumbnail; never embed arbitrary editable HTML in Home.
  if (latest?.thumbnail && /^(https?:\/\/|\/[^/]|data:image\/(png|jpeg|webp);base64,)/i.test(latest.thumbnail)) {
    const image = document.createElement('img');
    image.src = latest.thumbnail;
    image.alt = `Saved preview of ${latest.title || 'your design'}`;
    image.addEventListener('error', emptyPreview, { once: true });
    preview.append(image);
  } else emptyPreview();
  if (designs.status === 'rejected' || pages.status === 'rejected') {
    root.querySelector('[data-message]')!.textContent = 'HOME_WEBSITE_LOAD_FAILED: Some workspace data could not be loaded. Reload to retry.';
  }
}
