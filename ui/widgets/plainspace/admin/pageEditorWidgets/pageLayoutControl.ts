import enhanceSelects from '../../../../shared/controls/customSelect.js';
import { emitRuntimeAdmin } from '../../../../shared/api-client/runtimeFacade.js';
import { ownPagePresentation, pageLayoutMode, pageLayoutMeta, resolvePagePresentation, type PageLayoutMode, type PagePresentation } from '../../../../shared/layout/pagePresentation.js';
import type { DesignRecord, PageRecord } from './pageContentData.js';
import { loadSiteMainDesign } from '../../../../shared/layout/siteMainDesign.js';

export interface PageLayoutController {
  refresh: () => void;
  read: () => Record<string, unknown>;
  set: (mode: PageLayoutMode, designId?: string) => Promise<void>;
}

/** Edits the Page Editor's existing draft; this control never writes a page. */
export function mountPageLayoutControl(host: HTMLElement, options: {
  page: PageRecord;
  designs: () => DesignRecord[];
  changed: () => void | Promise<void>;
}): PageLayoutController {
  const { page } = options;
  let revision = 0;
  let source: PagePresentation | null = null;
  let loading = false;
  let error = '';
  let pendingMode: PageLayoutMode | null = null;
  let siteDesignId = '';
  const parentCache = new Map<string, PageRecord>();
  const adminBase = `/${(window.ADMIN_BASE || 'admin').replace(/^\/+|\/+$/g, '')}`;

  async function resolve(): Promise<void> {
    const request = ++revision;
    loading = true;
    try {
      const currentMainDesignId = await loadSiteMainDesign();
      const resolved = await resolvePagePresentation(page, async id => {
        if (parentCache.has(id)) return parentCache.get(id)!;
        const value = await emitRuntimeAdmin<PageRecord | null>(window.meltdownEmit!, window.ADMIN_TOKEN, 'pages', 'get', { pageId: id });
        if (value) parentCache.set(id, value);
        return value;
      }, { mainDesignId: currentMainDesignId });
      if (request !== revision || !host.isConnected) return;
      siteDesignId = currentMainDesignId;
      source = resolved;
      error = '';
    } catch (failure) {
      if (request !== revision || !host.isConnected) return;
      source = null;
      error = `PAGE_LAYOUT_LOOKUP_FAILED: ${failure instanceof Error ? failure.message : String(failure)}`;
    } finally {
      if (request === revision) { loading = false; renderSource(); }
    }
  }

  function renderSource(): void {
    const status = host.querySelector<HTMLElement>('[data-layout-source]');
    if (!status) return;
    status.replaceChildren();
    status.setAttribute('role', error ? 'alert' : 'status');
    if (error) {
      status.append(error, ' ');
      const retry = document.createElement('button');
      retry.type = 'button'; retry.className = 'button text sm'; retry.textContent = 'Retry';
      retry.addEventListener('click', () => { parentCache.clear(); void resolve(); });
      status.append(retry);
      return;
    }
    if (loading) { status.textContent = 'Resolving layout…'; return; }
    if (!source) {
      status.textContent = pageLayoutMode(page) === 'none' ? 'This page uses only its own content.'
        : 'No main design selected. Choose the website’s main design in Pages.';
      return;
    }
    const match = options.designs().find(design => String(design.id) === source?.designId);
    const title = match?.title || String(source.source !== 'site' && source.sourcePage.meta && typeof source.sourcePage.meta === 'object'
      ? (source.sourcePage.meta as Record<string, unknown>).designTitle || `Design ${source.designId}` : `Design ${source.designId}`);
    status.append(source.source === 'site' ? 'Website main design · ' : source.inherited ? `Inherited from ${source.sourcePage.title || source.sourcePage.slug || 'parent page'} · ` : 'Own design · ');
    if (source.designId) {
      const link = document.createElement('a');
      link.href = `${adminBase}/studio/design/${encodeURIComponent(source.designId)}`;
      link.textContent = title;
      link.title = 'Edit the shared layout in Design Studio';
      status.append(link);
    } else status.append(source.layoutTemplate || 'Legacy layout');
    if (source.contentDesignId) {
      const nested = options.designs().find(design => String(design.id) === source?.contentDesignId);
      const link = document.createElement('a');
      link.href = `${adminBase}/studio/design/${encodeURIComponent(source.contentDesignId)}`;
      link.textContent = nested?.title || `Design ${source.contentDesignId}`;
      status.append(' → ', link, ' → Page content');
    }
    if (pageLayoutMode(page) === 'composed' && !siteDesignId) status.append(' · No main design selected yet; currently using only the page design.');
    if (source.inherited && source.source !== 'site' && source.sourcePage.status === 'draft') status.append(' · Parent is a draft; public inheritance starts after publication.');
  }

  async function set(mode: PageLayoutMode, id?: string): Promise<void> {
    const design = options.designs().find(item => String(item.id) === id);
    if ((mode === 'design' || mode === 'composed') && !design) throw new Error('PAGE_LAYOUT_DESIGN_NOT_FOUND: Choose an available published design.');
    page.meta = pageLayoutMeta(page, mode, id, design?.title);
    pendingMode = null;
    await options.changed();
    refresh();
  }

  function refresh(): void {
    host.innerHTML = `<header class="content-title-bar"><div><h3>Page layout</h3><p>Choose how this page uses your website design.</p></div></header>
      <div class="page-layout-fields"><label><span>Layout</span><select aria-label="Page layout" data-layout-mode></select></label>
      <label data-design-field><span>Design</span><select aria-label="Layout design" data-layout-design></select></label></div>
      <p class="page-layout-source" data-layout-source role="status"></p>
      <details class="page-layout-help"><summary>How layouts work</summary><p class="page-layout-hint">Mark one container as “Page content area” in each design. The main design loads this page’s design or content there; an own design loads the content below in its own area.</p></details>`;
    const mode = host.querySelector<HTMLSelectElement>('[data-layout-mode]')!;
    const select = host.querySelector<HTMLSelectElement>('[data-layout-design]')!;
    const modes = [['main', 'Main design · Content page'], ['composed', 'Own design inside main design'], ['design', 'Own design only']];
    if (pageLayoutMode(page) === 'inherit') modes.push(['inherit', 'Inherit from parent (existing assignment)']);
    if (pageLayoutMode(page) === 'none') modes.push(['none', 'Content only (existing assignment)']);
    for (const [value, label] of modes) {
      mode.add(new Option(label, value));
    }
    mode.value = pendingMode || pageLayoutMode(page);
    select.add(new Option('Choose a published design…', ''));
    options.designs().forEach(design => select.add(new Option(design.title || `Design ${design.id}`, String(design.id))));
    const currentId = ownPagePresentation(page)?.designId || '';
    if (currentId && !options.designs().some(design => String(design.id) === currentId)) {
      select.add(new Option(`${page.meta?.designTitle || `Design ${currentId}`} (unavailable)`, currentId));
    }
    select.value = currentId;
    const designField = host.querySelector<HTMLElement>('[data-design-field]')!;
    const needsDesign = () => ['design', 'composed'].includes(mode.value);
    designField.hidden = !needsDesign();
    select.required = needsDesign();
    mode.addEventListener('change', () => {
      designField.hidden = !needsDesign();
      select.required = needsDesign();
      if (needsDesign() && !select.value) {
        // Keep the unfinished choice when the asynchronous design library arrives.
        pendingMode = mode.value as PageLayoutMode;
        void options.changed(); select.focus(); return;
      }
      void set(mode.value as PageLayoutMode, select.value).catch(showFailure);
    });
    select.addEventListener('change', () => { void set(mode.value as PageLayoutMode, select.value).catch(showFailure); });
    enhanceSelects(host);
    void resolve();
    renderSource();
  }

  function showFailure(failure: unknown): void {
    error = failure instanceof Error ? failure.message : String(failure);
    renderSource();
  }

  refresh();
  return { refresh, set, read: () => ({ mode: pageLayoutMode(page), loading, error: error || null,
    requestedMode: host.querySelector<HTMLSelectElement>('[data-layout-mode]')?.value,
    mainDesignId: siteDesignId || null, contentDesignId: source?.contentDesignId || null,
    designId: source?.designId || null, sourcePageId: source?.sourcePage.id || null,
    sourcePageTitle: source?.sourcePage.title || null, inherited: source?.inherited || false }) };
}
