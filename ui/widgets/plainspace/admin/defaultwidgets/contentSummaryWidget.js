import { fetchContentDesigns, fetchUploadedContentPages } from './contentSummaryData.js';
export async function render(el) {
    if (!el)
        return;
    const emit = window.meltdownEmit;
    const adminBase = `/${(window.ADMIN_BASE || 'admin').replace(/^\/+|\/+$/g, '')}`;
    const root = document.createElement('section');
    root.className = 'layout-gallery-card content-summary';
    root.innerHTML = `
    <div class="layout-gallery-title-bar"><h3 class="layout-gallery-title">Continue working</h3><a class="button ghost sm" data-all>Open Design Studio</a></div>
    <div class="widget-tabs" role="group" aria-label="Content type"><button type="button" class="widget-tab active" aria-pressed="true" data-view="designs">Designs</button><button type="button" class="widget-tab" aria-pressed="false" data-view="uploads">HTML pages</button></div>
    <div class="content-summary-status" aria-live="polite"></div><div class="layout-gallery"></div>`;
    el.replaceChildren(root);
    const list = root.querySelector('.layout-gallery');
    const status = root.querySelector('.content-summary-status');
    const all = root.querySelector('[data-all]');
    let view = 'designs';
    let request = 0;
    async function load() {
        // A later tab selection owns the result, so slow reads cannot replace it.
        const currentRequest = ++request;
        const selectedView = view;
        root.querySelectorAll('[data-view]').forEach(button => {
            const active = button.dataset.view === view;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        all.href = `${adminBase}/content/${view === 'designs' ? 'designer-layouts' : 'pages'}`;
        all.textContent = view === 'designs' ? 'Open Design Studio' : 'Open Pages';
        list.replaceChildren();
        status.textContent = 'Loading content…';
        status.setAttribute('role', 'status');
        try {
            if (typeof emit !== 'function')
                throw new Error('CMS connection unavailable.');
            const items = selectedView === 'designs'
                ? await fetchContentDesigns(emit, window.ADMIN_TOKEN)
                : await fetchUploadedContentPages(emit, window.ADMIN_TOKEN);
            if (currentRequest !== request)
                return;
            const available = items.filter(item => item.id != null && item.status !== 'deleted');
            available.sort((a, b) => new Date(String(b.updated_at || 0)).getTime() - new Date(String(a.updated_at || 0)).getTime());
            status.textContent = available.length ? 'Recently updated' : selectedView === 'designs'
                ? 'No designs yet. Open Design Studio to create one.' : 'No HTML pages yet. Attach HTML from the page editor.';
            for (const item of available.slice(0, 6)) {
                const link = document.createElement('a');
                link.className = 'layout-gallery-item';
                link.href = selectedView === 'designs'
                    ? `${adminBase}/studio/design/${encodeURIComponent(String(item.id))}`
                    : `${adminBase}/pages/edit/${encodeURIComponent(String(item.id))}`;
                const name = document.createElement('strong');
                name.className = 'layout-gallery-name';
                name.textContent = item.title || 'Untitled';
                if (selectedView === 'designs' && item.thumbnail) {
                    const image = document.createElement('img');
                    image.className = 'layout-gallery-preview';
                    image.alt = '';
                    image.src = String(item.thumbnail);
                    image.loading = 'lazy';
                    link.append(image);
                }
                link.append(name);
                list.append(link);
            }
        }
        catch (error) {
            if (currentRequest !== request)
                return;
            status.setAttribute('role', 'alert');
            status.textContent = `CONTENT_SUMMARY_LOAD_FAILED: ${error instanceof Error ? error.message : 'Could not load content.'} `;
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'button secondary sm';
            retry.textContent = 'Retry';
            retry.addEventListener('click', () => void load());
            status.append(retry);
        }
    }
    root.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
        view = button.dataset.view === 'uploads' ? 'uploads' : 'designs';
        void load();
    }));
    await load();
}
