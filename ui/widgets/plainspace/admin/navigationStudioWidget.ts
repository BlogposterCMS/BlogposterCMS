import { bpDialog } from '/ui/shared/dialogs/bpDialog.js';
import { decodeAdminId } from './defaultwidgets/contentSummaryData.js';
import {
  NAVIGATION_STUDIO_MAX_DEPTH,
  type DesignRecord,
  type NavigationDiagnostic,
  type NavigationItemMeta,
  type NavigationLocation,
  type NavigationMenu,
  type NavigationMenuItem,
  type PageRecord,
  addNavigationItem,
  buildNavigationDiagnostics,
  createMegaMenuDesign,
  deleteNavigationItem,
  designUrl,
  ensureNavigationStudioDefaults,
  fetchNavigationDesigns,
  fetchNavigationLocations,
  fetchNavigationMenus,
  fetchNavigationTree,
  fetchPublicPages,
  flattenNavigationItems,
  itemId,
  itemMeta,
  menuKey,
  menuLocationKey,
  persistNavigationOrder,
  replaceMenuItemsWithGeneratedPages,
  updateNavigationItem,
  upsertNavigationMenu
} from './navigationStudioData.js';

type StudioMode = 'simple' | 'advanced' | 'developer';
type PreviewMode = 'desktop' | 'tablet' | 'mobile' | 'mega' | 'footer';
type DropMode = 'child' | 'root';

interface NavigationStudioState {
  locations: NavigationLocation[];
  menus: NavigationMenu[];
  pages: PageRecord[];
  designs: DesignRecord[];
  items: NavigationMenuItem[];
  selectedMenu: NavigationMenu | null;
  selectedItemId: string | number | null;
  mode: StudioMode;
  preview: PreviewMode;
  feedback: string;
  diagnostics: NavigationDiagnostic[];
}

const state: NavigationStudioState = {
  locations: [],
  menus: [],
  pages: [],
  designs: [],
  items: [],
  selectedMenu: null,
  selectedItemId: null,
  mode: 'simple',
  preview: 'desktop',
  feedback: '',
  diagnostics: []
};

let hostElement: HTMLElement | null = null;
let dragItemId: string | number | null = null;

function escapeHtml(value: unknown): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(value ?? '').replace(/[&<>"']/g, char => map[char] || char);
}

function icon(name: string, extraClass = ''): string {
  return typeof window.featherIcon === 'function'
    ? window.featherIcon(name, extraClass)
    : `<img src="/assets/icons/${name}.svg" class="${escapeHtml(extraClass || 'icon')}" alt="" />`;
}

function getRuntime() {
  const meltdownEmit = window.meltdownEmit;
  if (typeof meltdownEmit !== 'function') {
    throw new Error('PLAINSPACE_NAVIGATION_STUDIO_RUNTIME_UNAVAILABLE: meltdownEmit unavailable');
  }
  return { meltdownEmit, jwt: window.ADMIN_TOKEN };
}

function selectedItem(): NavigationMenuItem | null {
  if (state.selectedItemId == null) return null;
  return findItem(state.items, state.selectedItemId)?.item || null;
}

function idEquals(a: unknown, b: unknown): boolean {
  return String(a ?? '') === String(b ?? '') && a != null && b != null;
}

function findItem(
  items: NavigationMenuItem[],
  id: string | number,
  parent: NavigationMenuItem[] | null = null
): { item: NavigationMenuItem; parent: NavigationMenuItem[]; index: number; depth: number } | null {
  for (const [index, item] of items.entries()) {
    if (idEquals(itemId(item), id)) return { item, parent: parent || items, index, depth: 1 };
    const childResult = findItem(item.children || [], id, item.children || []);
    if (childResult) {
      return { ...childResult, depth: childResult.depth + 1 };
    }
  }
  return null;
}

function isDescendant(parent: NavigationMenuItem, candidateId: string | number): boolean {
  return (parent.children || []).some(child => (
    idEquals(itemId(child), candidateId) || isDescendant(child, candidateId)
  ));
}

function branchDepth(item: NavigationMenuItem): number {
  const children = item.children || [];
  if (!children.length) return 1;
  return 1 + Math.max(...children.map(branchDepth));
}

function maxDepthForMode(): number {
  if (state.mode === 'developer') return 20;
  if (state.mode === 'advanced') return 4;
  return NAVIGATION_STUDIO_MAX_DEPTH;
}

function setFeedback(message: string): void {
  state.feedback = message;
  const target = hostElement?.querySelector<HTMLElement>('[data-nav-feedback]');
  if (target) target.textContent = message;
}

function menuLabel(menu: NavigationMenu | null): string {
  return menu?.label || menuKey(menu) || menuLocationKey(menu) || 'Menu';
}

function itemLabel(item: NavigationMenuItem): string {
  return item.title || item.url || 'Untitled';
}

function itemUrl(item: NavigationMenuItem): string {
  return item.url || '#';
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function selectedParentId(): string | number | null {
  const item = selectedItem();
  if (!item) return null;
  return itemId(item);
}

function childItemsForParent(parentId: string | number | null): NavigationMenuItem[] {
  if (parentId == null) return state.items;
  const parent = findItem(state.items, parentId)?.item;
  if (!parent) return state.items;
  parent.children ||= [];
  return parent.children;
}

function updateDiagnostics(): void {
  state.diagnostics = buildNavigationDiagnostics(state.items, state.pages, state.selectedMenu);
}

async function reloadTree(): Promise<void> {
  if (!state.selectedMenu) return;
  const { meltdownEmit, jwt } = getRuntime();
  state.items = await fetchNavigationTree(meltdownEmit, jwt, state.selectedMenu);
  if (!selectedItem() && state.items[0]) {
    state.selectedItemId = itemId(state.items[0]);
  }
  updateDiagnostics();
}

async function reloadSnapshot(): Promise<void> {
  const { meltdownEmit, jwt } = getRuntime();
  let locations = await fetchNavigationLocations(meltdownEmit, jwt);
  let menus = await fetchNavigationMenus(meltdownEmit, jwt);
  await ensureNavigationStudioDefaults(meltdownEmit, jwt, locations, menus);
  [locations, menus, state.pages, state.designs] = await Promise.all([
    fetchNavigationLocations(meltdownEmit, jwt),
    fetchNavigationMenus(meltdownEmit, jwt),
    fetchPublicPages(meltdownEmit, jwt),
    fetchNavigationDesigns(meltdownEmit, jwt)
  ]);
  state.locations = locations;
  state.menus = menus;
  state.selectedMenu = state.selectedMenu
    ? menus.find(menu => idEquals(menu.id || menu.menuId || menu.key, state.selectedMenu?.id || state.selectedMenu?.menuId || state.selectedMenu?.key)) || menus[0] || null
    : menus[0] || null;
  await reloadTree();
}

function renderModeTabs(): string {
  return (['simple', 'advanced', 'developer'] as StudioMode[]).map(mode => `
    <button class="navigation-studio__mode ${state.mode === mode ? 'is-active' : ''}" type="button" data-mode="${mode}">
      ${escapeHtml(titleCase(mode))}
    </button>
  `).join('');
}

function renderPreviewTabs(): string {
  const tabs: PreviewMode[] = ['desktop', 'tablet', 'mobile', 'mega', 'footer'];
  return tabs.map(tab => `
    <button class="navigation-studio__preview-tab ${state.preview === tab ? 'is-active' : ''}" type="button" data-preview="${tab}">
      ${escapeHtml(titleCase(tab))}
    </button>
  `).join('');
}

function renderMenus(): string {
  return state.menus.map(menu => {
    const active = state.selectedMenu && (
      idEquals(menu.id || menu.menuId, state.selectedMenu.id || state.selectedMenu.menuId) ||
      (menuKey(menu) && menuKey(menu) === menuKey(state.selectedMenu))
    );
    return `
      <button class="navigation-studio__menu ${active ? 'is-active' : ''}" type="button" data-menu-key="${escapeHtml(menuKey(menu))}">
        <span>${escapeHtml(menuLabel(menu))}</span>
        <small>${escapeHtml(menuLocationKey(menu) || 'unassigned')}</small>
      </button>
    `;
  }).join('');
}

function renderAddSearch(): string {
  const query = hostElement?.querySelector<HTMLInputElement>('[data-nav-search]')?.value.trim() || '';
  const filteredPages = query
    ? state.pages
      .filter(page => `${page.title || ''} ${page.slug || ''}`.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 7)
    : state.pages.slice(0, 5);

  const pageRows = filteredPages.map(page => `
    <button class="navigation-studio__search-result" type="button" data-add-page="${escapeHtml(page.id)}">
      ${icon('file-text')}
      <span>${escapeHtml(page.title || page.slug || page.id)}</span>
      <small>${escapeHtml(page.slug ? `/${page.slug}` : '/')}</small>
    </button>
  `).join('');

  const customRow = query ? `
    <button class="navigation-studio__search-result" type="button" data-add-custom>
      ${icon('link')}
      <span>Custom URL</span>
      <small>${escapeHtml(query)}</small>
    </button>
  ` : '';

  return `
    <div class="navigation-studio__add">
      <div class="navigation-studio__search">
        ${icon('search')}
        <input data-nav-search type="search" placeholder="Search pages or type a URL" value="${escapeHtml(query)}" />
      </div>
      <div class="navigation-studio__search-results">
        ${pageRows}
        ${customRow}
      </div>
    </div>
  `;
}

function renderTree(items: NavigationMenuItem[], depth = 1): string {
  if (!items.length && depth === 1) {
    return '<div class="navigation-studio__empty">No items yet.</div>';
  }
  return `
    <ul class="navigation-studio__tree-list" data-depth="${depth}">
      ${items.map(item => {
        const id = itemId(item);
        const meta = itemMeta(item);
        const isSelected = id != null && idEquals(id, state.selectedItemId);
        const isMega = Boolean(meta.mega?.enabled);
        return `
          <li class="navigation-studio__tree-row" data-item-id="${escapeHtml(id)}" draggable="true">
            <div class="navigation-studio__item ${isSelected ? 'is-selected' : ''}" data-select-item="${escapeHtml(id)}">
              <span class="navigation-studio__item-grip" aria-hidden="true">${icon('grip-vertical')}</span>
              <span class="navigation-studio__item-icon">${icon(meta.icon || (isMega ? 'panel-top' : 'link'))}</span>
              <span class="navigation-studio__item-main">
                <strong>${escapeHtml(itemLabel(item))}</strong>
                <small>${escapeHtml(itemUrl(item))}</small>
              </span>
              <span class="navigation-studio__item-badges">
                ${isMega ? '<span class="navigation-studio__badge">Mega</span>' : ''}
                <span class="navigation-studio__badge">${escapeHtml(item.status || 'active')}</span>
              </span>
              <span class="navigation-studio__item-actions">
                <button type="button" data-move-up="${escapeHtml(id)}" aria-label="Move up">${icon('chevron-up')}</button>
                <button type="button" data-move-down="${escapeHtml(id)}" aria-label="Move down">${icon('chevron-down')}</button>
                <button type="button" data-outdent="${escapeHtml(id)}" aria-label="Move out">${icon('corner-up-left')}</button>
              </span>
            </div>
            <div class="navigation-studio__drop-child" data-drop-child="${escapeHtml(id)}">Drop here to nest</div>
            ${renderTree(item.children || [], depth + 1)}
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

function previewItemsForMode(items: NavigationMenuItem[]): NavigationMenuItem[] {
  const device = state.preview === 'mobile' ? 'mobile' : 'desktop';
  return items
    .filter(item => {
      const visibility = itemMeta(item).visibility || {};
      if (device === 'mobile') return visibility.mobile !== false;
      return visibility.desktop !== false;
    })
    .map(item => ({
      ...item,
      children: previewItemsForMode(item.children || [])
    }));
}

function renderPreviewList(items: NavigationMenuItem[], depth = 1): string {
  const maxDepth = state.preview === 'mega' ? 3 : state.preview === 'footer' ? 2 : NAVIGATION_STUDIO_MAX_DEPTH;
  return `
    <ul>
      ${items.map(item => {
        const meta = itemMeta(item);
        const mega = meta.mega?.enabled;
        return `
          <li class="${mega ? 'has-mega' : ''}">
            <a href="${escapeHtml(itemUrl(item))}">
              ${meta.icon ? `<span>${icon(meta.icon)}</span>` : ''}
              ${escapeHtml(itemLabel(item))}
            </a>
            ${mega ? `<div class="navigation-studio__mega-preview">
              <strong>${escapeHtml(meta.mega?.layoutTitle || 'Theme mega panel')}</strong>
              <small>${escapeHtml(meta.mega?.layoutId ? `Design ${meta.mega.layoutId}` : 'Theme fallback from child links')}</small>
            </div>` : ''}
            ${item.children?.length && depth < maxDepth ? renderPreviewList(item.children, depth + 1) : ''}
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

function renderPreview(): string {
  const modeClass = `navigation-studio__preview navigation-studio__preview--${state.preview}`;
  const items = previewItemsForMode(state.items);
  return `
    <section class="navigation-studio__panel navigation-studio__preview-panel">
      <div class="navigation-studio__panel-title">
        <span>Preview</span>
        <div class="navigation-studio__preview-tabs">${renderPreviewTabs()}</div>
      </div>
      <div class="${modeClass}">
        <nav aria-label="${escapeHtml(menuLabel(state.selectedMenu))}">
          ${items.length ? renderPreviewList(items) : '<div class="navigation-studio__empty">Preview is empty.</div>'}
        </nav>
      </div>
    </section>
  `;
}

function renderDiagnostics(): string {
  if (!state.diagnostics.length) {
    return '<div class="navigation-studio__diagnostic is-ok">No navigation warnings.</div>';
  }
  return state.diagnostics.map(diagnostic => `
    <button class="navigation-studio__diagnostic is-${diagnostic.severity}" type="button" data-focus-diagnostic="${escapeHtml(diagnostic.itemId || '')}">
      <strong>${escapeHtml(diagnostic.code)}</strong>
      <span>${escapeHtml(diagnostic.message)}</span>
    </button>
  `).join('');
}

function renderInspector(): string {
  const item = selectedItem();
  if (!item) {
    return `
      <section class="navigation-studio__panel navigation-studio__inspector">
        <div class="navigation-studio__panel-title"><span>Inspector</span></div>
        <div class="navigation-studio__empty">Select a menu item.</div>
      </section>
    `;
  }

  const meta = itemMeta(item);
  const visibility = meta.visibility || {};
  const mega = meta.mega || {};
  const selectedSourceId = item.sourceId ?? item.source_id ?? '';
  const pageOptions = state.pages.map(page => `
    <option value="${escapeHtml(page.id)}" ${idEquals(page.id, selectedSourceId) ? 'selected' : ''}>
      ${escapeHtml(page.title || page.slug || page.id)}
    </option>
  `).join('');
  const designOptions = state.designs.map(design => `
    <option value="${escapeHtml(design.id)}" ${idEquals(design.id, mega.layoutId) ? 'selected' : ''}>
      ${escapeHtml(design.title || design.id)}
    </option>
  `).join('');
  const developerMeta = JSON.stringify(meta, null, 2);

  return `
    <section class="navigation-studio__panel navigation-studio__inspector">
      <div class="navigation-studio__panel-title">
        <span>Inspector</span>
        <button type="button" data-delete-item aria-label="Delete item">${icon('trash-2')}</button>
      </div>
      <div class="navigation-studio__form" data-inspector-form>
        <label>
          <span>Label</span>
          <input name="title" value="${escapeHtml(item.title || '')}" />
        </label>
        <label>
          <span>Link type</span>
          <select name="type">
            ${['page', 'custom', 'post', 'archive', 'entry'].map(type => `
              <option value="${type}" ${item.type === type ? 'selected' : ''}>${type}</option>
            `).join('')}
          </select>
        </label>
        <label>
          <span>Page target</span>
          <select name="sourceId">
            <option value="">No page selected</option>
            ${pageOptions}
          </select>
        </label>
        <label>
          <span>URL</span>
          <input name="url" value="${escapeHtml(item.url || '')}" />
        </label>
        <label>
          <span>Icon</span>
          <input name="icon" value="${escapeHtml(meta.icon || '')}" placeholder="menu, search, file-text" />
        </label>
        <div class="navigation-studio__check-row">
          <label><input name="desktop" type="checkbox" ${visibility.desktop === false ? '' : 'checked'} /> Desktop</label>
          <label><input name="mobile" type="checkbox" ${visibility.mobile === false ? '' : 'checked'} /> Mobile</label>
        </div>
        <label>
          <span>Status</span>
          <select name="status">
            ${['active', 'draft', 'hidden'].map(status => `
              <option value="${status}" ${(item.status || 'active') === status ? 'selected' : ''}>${status}</option>
            `).join('')}
          </select>
        </label>
        <label>
          <span>External target</span>
          <select name="target">
            <option value="" ${!item.target ? 'selected' : ''}>Same tab</option>
            <option value="_blank" ${item.target === '_blank' ? 'selected' : ''}>New tab</option>
          </select>
        </label>
        ${state.mode !== 'simple' ? `
          <label>
            <span>Rel</span>
            <input name="rel" value="${escapeHtml(item.rel || '')}" placeholder="noopener noreferrer" />
          </label>
        ` : ''}
        <label>
          <span>Dropdown</span>
          <select name="megaEnabled">
            <option value="false" ${mega.enabled ? '' : 'selected'}>Default theme dropdown</option>
            <option value="true" ${mega.enabled ? 'selected' : ''}>Mega Menu panel</option>
          </select>
        </label>
        <label>
          <span>Design Studio panel</span>
          <select name="megaLayoutId">
            <option value="">Theme fallback</option>
            ${designOptions}
          </select>
        </label>
        <div class="navigation-studio__inspector-actions">
          <button class="button small" type="button" data-open-mega-design>${icon('external-link')}<span>Open</span></button>
          <button class="button small" type="button" data-create-mega-design>${icon('plus')}<span>Create</span></button>
          <button class="button small" type="button" data-save-item>${icon('save')}<span>Save</span></button>
        </div>
        ${state.mode === 'developer' ? `
          <label class="navigation-studio__developer-json">
            <span>Meta JSON</span>
            <textarea name="metaJson" spellcheck="false">${escapeHtml(developerMeta)}</textarea>
          </label>
          <button class="button small" type="button" data-apply-meta-json>${icon('braces')}<span>Apply JSON</span></button>
        ` : ''}
      </div>
    </section>
  `;
}

function renderShell(): void {
  if (!hostElement) return;
  updateDiagnostics();
  hostElement.innerHTML = `
    <div class="navigation-studio">
      <header class="navigation-studio__header">
        <div>
          <h2>Navigation Studio</h2>
          <p>${escapeHtml(menuLabel(state.selectedMenu))} uses theme-owned menu design. Mega panels can reference Design Studio layouts.</p>
        </div>
        <div class="navigation-studio__modes">${renderModeTabs()}</div>
      </header>
      <div class="navigation-studio__feedback" data-nav-feedback>${escapeHtml(state.feedback)}</div>
      <div class="navigation-studio__layout">
        <aside class="navigation-studio__panel navigation-studio__menus">
          <div class="navigation-studio__panel-title">
            <span>Menus</span>
            <button type="button" data-create-menu aria-label="Create menu">${icon('plus')}</button>
          </div>
          <div class="navigation-studio__menu-list">${renderMenus()}</div>
        </aside>
        <main class="navigation-studio__panel navigation-studio__structure">
          <div class="navigation-studio__panel-title">
            <span>Structure</span>
            <button type="button" data-generate-pages>${icon('sparkles')}<span>Generate from pages</span></button>
          </div>
          ${renderAddSearch()}
          <div class="navigation-studio__tree" data-root-drop>
            ${renderTree(state.items)}
          </div>
        </main>
        <aside class="navigation-studio__side">
          ${renderPreview()}
          ${renderInspector()}
          <section class="navigation-studio__panel navigation-studio__diagnostics">
            <div class="navigation-studio__panel-title"><span>Warnings</span></div>
            ${renderDiagnostics()}
          </section>
        </aside>
      </div>
    </div>
  `;
  bindShellEvents();
}

function menuByKey(key: string): NavigationMenu | null {
  return state.menus.find(menu => menuKey(menu) === key) || null;
}

async function selectMenu(key: string): Promise<void> {
  const menu = menuByKey(key);
  if (!menu) return;
  state.selectedMenu = menu;
  state.selectedItemId = null;
  setFeedback('Loading menu...');
  await reloadTree();
  setFeedback('Menu loaded.');
  renderShell();
}

async function createMenu(): Promise<void> {
  const name = await bpDialog.prompt('Menu name:');
  if (!name?.trim()) return;
  const location = await bpDialog.prompt('Location key:', name.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
  const { meltdownEmit, jwt } = getRuntime();
  await upsertNavigationMenu(meltdownEmit, jwt, {
    label: name.trim(),
    key: name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, ''),
    locationKey: location || ''
  });
  await reloadSnapshot();
  renderShell();
}

async function addPage(page: PageRecord): Promise<void> {
  if (!state.selectedMenu) return;
  const { meltdownEmit, jwt } = getRuntime();
  const parentId = selectedParentId();
  const siblings = childItemsForParent(parentId);
  const created = await addNavigationItem(meltdownEmit, jwt, state.selectedMenu, {
    parentId,
    type: 'page',
    title: page.title || page.slug || `Page ${page.id}`,
    url: page.slug ? `/${String(page.slug).replace(/^\/+/u, '')}` : '/',
    sourceModule: 'pagesManager',
    sourceId: page.id,
    position: siblings.length,
    status: page.status === 'published' ? 'active' : 'draft',
    meta: { visibility: { desktop: true, mobile: true } }
  });
  state.selectedItemId = itemId(created);
  await reloadTree();
  setFeedback('Page link added.');
  renderShell();
}

async function addCustom(): Promise<void> {
  if (!state.selectedMenu || !hostElement) return;
  const input = hostElement.querySelector<HTMLInputElement>('[data-nav-search]');
  const raw = input?.value.trim() || '';
  const label = await bpDialog.prompt('Menu item label:', raw.replace(/^https?:\/\//u, '').replace(/^\/+/u, '') || 'New link');
  if (!label?.trim()) return;
  const { meltdownEmit, jwt } = getRuntime();
  const parentId = selectedParentId();
  const siblings = childItemsForParent(parentId);
  const created = await addNavigationItem(meltdownEmit, jwt, state.selectedMenu, {
    parentId,
    type: 'custom',
    title: label.trim(),
    url: raw || '#',
    position: siblings.length,
    status: 'active',
    meta: { visibility: { desktop: true, mobile: true } }
  });
  state.selectedItemId = itemId(created);
  await reloadTree();
  setFeedback('Custom link added.');
  renderShell();
}

async function saveSelectedItem(): Promise<void> {
  if (!hostElement) return;
  const item = selectedItem();
  if (!item) return;
  const form = hostElement.querySelector<HTMLElement>('[data-inspector-form]');
  if (!form) return;

  const getInput = <T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(name: string): T | null =>
    form.querySelector<T>(`[name="${name}"]`);
  const selectedPage = state.pages.find(page => idEquals(page.id, getInput<HTMLSelectElement>('sourceId')?.value));
  const currentMeta = itemMeta(item);
  const megaLayoutId = getInput<HTMLSelectElement>('megaLayoutId')?.value || '';
  const selectedDesign = state.designs.find(design => idEquals(design.id, megaLayoutId));
  const megaEnabled = getInput<HTMLSelectElement>('megaEnabled')?.value === 'true';
  const meta: NavigationItemMeta = {
    ...currentMeta,
    icon: getInput<HTMLInputElement>('icon')?.value.trim() || undefined,
    visibility: {
      desktop: getInput<HTMLInputElement>('desktop')?.checked !== false,
      mobile: getInput<HTMLInputElement>('mobile')?.checked !== false
    },
    mega: {
      ...(currentMeta.mega || {}),
      enabled: megaEnabled,
      layoutId: megaLayoutId || null,
      layoutTitle: selectedDesign?.title || '',
      source: megaEnabled ? 'designer' : '',
      fallback: 'children'
    }
  };
  if (!meta.icon) delete meta.icon;
  if (!megaEnabled) meta.mega = { enabled: false, fallback: 'children' };

  const patch: Partial<NavigationMenuItem> = {
    title: getInput<HTMLInputElement>('title')?.value.trim() || item.title || '',
    type: getInput<HTMLSelectElement>('type')?.value || item.type || 'custom',
    url: getInput<HTMLInputElement>('url')?.value.trim() || '',
    sourceId: selectedPage?.id || null,
    sourceModule: selectedPage ? 'pagesManager' : item.sourceModule ?? item.source_module ?? null,
    target: getInput<HTMLSelectElement>('target')?.value || '',
    rel: getInput<HTMLInputElement>('rel')?.value.trim() || '',
    status: getInput<HTMLSelectElement>('status')?.value || 'active',
    meta
  };

  if (selectedPage && !patch.url) {
    patch.url = selectedPage.slug ? `/${String(selectedPage.slug).replace(/^\/+/u, '')}` : '/';
  }

  const { meltdownEmit, jwt } = getRuntime();
  await updateNavigationItem(meltdownEmit, jwt, item, patch);
  await reloadTree();
  setFeedback('Item saved.');
  renderShell();
}

async function applyMetaJson(): Promise<void> {
  if (!hostElement) return;
  const item = selectedItem();
  const textarea = hostElement.querySelector<HTMLTextAreaElement>('[name="metaJson"]');
  if (!item || !textarea) return;
  try {
    const parsed = JSON.parse(textarea.value) as NavigationItemMeta;
    const { meltdownEmit, jwt } = getRuntime();
    await updateNavigationItem(meltdownEmit, jwt, item, { meta: parsed });
    await reloadTree();
    setFeedback('Meta JSON applied.');
    renderShell();
  } catch (err) {
    setFeedback(`PLAINSPACE_NAVIGATION_STUDIO_META_JSON_INVALID: ${err instanceof Error ? err.message : 'Invalid JSON'}`);
  }
}

async function deleteSelectedItem(): Promise<void> {
  const item = selectedItem();
  if (!item) return;
  if (!(await bpDialog.confirm(`Delete "${itemLabel(item)}"?`))) return;
  const { meltdownEmit, jwt } = getRuntime();
  await deleteNavigationItem(meltdownEmit, jwt, item);
  state.selectedItemId = null;
  await reloadTree();
  setFeedback('Item deleted.');
  renderShell();
}

async function generateFromPages(): Promise<void> {
  if (!state.selectedMenu) return;
  if (state.items.length && !(await bpDialog.confirm('Replace this menu with links generated from public pages?'))) return;
  const { meltdownEmit, jwt } = getRuntime();
  await replaceMenuItemsWithGeneratedPages(meltdownEmit, jwt, state.selectedMenu, state.items, state.pages);
  state.selectedItemId = null;
  await reloadTree();
  setFeedback('Menu generated from public pages.');
  renderShell();
}

function moveSibling(id: string | number, direction: -1 | 1): void {
  const found = findItem(state.items, id);
  if (!found) return;
  const nextIndex = found.index + direction;
  if (nextIndex < 0 || nextIndex >= found.parent.length) return;
  const [item] = found.parent.splice(found.index, 1);
  if (!item) return;
  found.parent.splice(nextIndex, 0, item);
}

function outdentItem(id: string | number): void {
  const found = findItem(state.items, id);
  if (!found || found.parent === state.items) return;
  const parentRow = flattenNavigationItems(state.items).find(row => (
    row.item.children === found.parent
  ));
  if (!parentRow) return;
  const grandParent = parentRow.parentId == null
    ? state.items
    : findItem(state.items, parentRow.parentId)?.item.children || state.items;
  const parentIndex = grandParent.findIndex(item => idEquals(itemId(item), itemId(parentRow.item)));
  const [item] = found.parent.splice(found.index, 1);
  if (!item) return;
  grandParent.splice(parentIndex + 1, 0, item);
}

function moveDraggedItem(targetId: string | number | null, mode: DropMode): boolean {
  if (dragItemId == null) return false;
  const dragged = findItem(state.items, dragItemId);
  if (!dragged) return false;
  if (targetId != null && idEquals(targetId, dragItemId)) return false;
  if (targetId != null && isDescendant(dragged.item, targetId)) return false;

  const [item] = dragged.parent.splice(dragged.index, 1);
  if (!item) return false;
  if (mode === 'root' || targetId == null) {
    if (branchDepth(item) > maxDepthForMode()) {
      dragged.parent.splice(dragged.index, 0, item);
      setFeedback('NAV_STUDIO_DROP_DEPTH_LIMIT: This branch is too deep for the current mode.');
      return false;
    }
    state.items.push(item);
    return true;
  }

  const target = findItem(state.items, targetId);
  if (!target) {
    dragged.parent.splice(dragged.index, 0, item);
    return false;
  }
  if (target.depth + branchDepth(item) > maxDepthForMode()) {
    dragged.parent.splice(dragged.index, 0, item);
    setFeedback('NAV_STUDIO_DROP_DEPTH_LIMIT: This branch is too deep for the current mode.');
    return false;
  }
  target.item.children ||= [];
  target.item.children.push(item);
  return true;
}

async function persistMovedTree(): Promise<void> {
  const { meltdownEmit, jwt } = getRuntime();
  await persistNavigationOrder(meltdownEmit, jwt, state.items);
  await reloadTree();
  setFeedback('Menu order saved.');
  renderShell();
}

async function openMegaDesign(createIfMissing = false): Promise<void> {
  const item = selectedItem();
  if (!item) return;
  const meta = itemMeta(item);
  const layoutId = meta.mega?.layoutId;
  if (layoutId) {
    window.open(designUrl({ id: layoutId }), '_blank', 'noopener');
    return;
  }
  if (!createIfMissing) {
    setFeedback('NAV_STUDIO_MEGA_LAYOUT_MISSING: Select or create a Design Studio panel first.');
    return;
  }
  const { meltdownEmit, jwt } = getRuntime();
  const newId = await createMegaMenuDesign(
    meltdownEmit,
    jwt,
    decodeAdminId(jwt),
    `Mega Menu - ${itemLabel(item)}`
  );
  if (!newId) {
    setFeedback('NAV_STUDIO_MEGA_CREATE_FAILED: Designer did not return a layout id.');
    return;
  }
  await updateNavigationItem(meltdownEmit, jwt, item, {
    meta: {
      ...meta,
      mega: {
        enabled: true,
        layoutId: newId,
        layoutTitle: `Mega Menu - ${itemLabel(item)}`,
        source: 'designer',
        fallback: 'children'
      }
    }
  });
  state.designs = await fetchNavigationDesigns(meltdownEmit, jwt);
  await reloadTree();
  setFeedback('Mega Menu Design Studio panel created.');
  renderShell();
  window.open(designUrl({ id: newId }), '_blank', 'noopener');
}

function bindShellEvents(): void {
  if (!hostElement) return;
  hostElement.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => {
    button.addEventListener('click', () => {
      state.mode = button.dataset.mode as StudioMode;
      renderShell();
    });
  });
  hostElement.querySelectorAll<HTMLButtonElement>('[data-preview]').forEach(button => {
    button.addEventListener('click', () => {
      state.preview = button.dataset.preview as PreviewMode;
      renderShell();
    });
  });
  hostElement.querySelectorAll<HTMLButtonElement>('[data-menu-key]').forEach(button => {
    button.addEventListener('click', () => {
      void selectMenu(button.dataset.menuKey || '');
    });
  });
  hostElement.querySelector<HTMLButtonElement>('[data-create-menu]')?.addEventListener('click', () => {
    void createMenu();
  });
  hostElement.querySelector<HTMLButtonElement>('[data-generate-pages]')?.addEventListener('click', () => {
    void generateFromPages();
  });
  hostElement.querySelector<HTMLInputElement>('[data-nav-search]')?.addEventListener('input', () => {
    renderShell();
    hostElement?.querySelector<HTMLInputElement>('[data-nav-search]')?.focus();
  });
  hostElement.querySelectorAll<HTMLButtonElement>('[data-add-page]').forEach(button => {
    button.addEventListener('click', () => {
      const page = state.pages.find(candidate => idEquals(candidate.id, button.dataset.addPage));
      if (page) void addPage(page);
    });
  });
  hostElement.querySelector<HTMLButtonElement>('[data-add-custom]')?.addEventListener('click', () => {
    void addCustom();
  });
  hostElement.querySelectorAll<HTMLElement>('[data-select-item]').forEach(row => {
    row.addEventListener('click', event => {
      if ((event.target as Element).closest('button')) return;
      state.selectedItemId = row.dataset.selectItem || null;
      renderShell();
    });
  });
  hostElement.querySelector<HTMLButtonElement>('[data-save-item]')?.addEventListener('click', () => {
    void saveSelectedItem();
  });
  hostElement.querySelector<HTMLButtonElement>('[data-apply-meta-json]')?.addEventListener('click', () => {
    void applyMetaJson();
  });
  hostElement.querySelector<HTMLButtonElement>('[data-delete-item]')?.addEventListener('click', () => {
    void deleteSelectedItem();
  });
  hostElement.querySelector<HTMLButtonElement>('[data-open-mega-design]')?.addEventListener('click', () => {
    void openMegaDesign(false);
  });
  hostElement.querySelector<HTMLButtonElement>('[data-create-mega-design]')?.addEventListener('click', () => {
    void openMegaDesign(true);
  });
  hostElement.querySelectorAll<HTMLButtonElement>('[data-move-up], [data-move-down], [data-outdent]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.moveUp || button.dataset.moveDown || button.dataset.outdent;
      if (!id) return;
      if (button.dataset.moveUp) moveSibling(id, -1);
      if (button.dataset.moveDown) moveSibling(id, 1);
      if (button.dataset.outdent) outdentItem(id);
      void persistMovedTree();
    });
  });
  hostElement.querySelectorAll<HTMLElement>('.navigation-studio__tree-row').forEach(row => {
    row.addEventListener('dragstart', event => {
      dragItemId = row.dataset.itemId || null;
      event.dataTransfer?.setData('text/plain', String(dragItemId || ''));
    });
    row.addEventListener('dragend', () => {
      dragItemId = null;
    });
  });
  hostElement.querySelectorAll<HTMLElement>('[data-drop-child]').forEach(dropZone => {
    dropZone.addEventListener('dragover', event => event.preventDefault());
    dropZone.addEventListener('drop', event => {
      event.preventDefault();
      const moved = moveDraggedItem(dropZone.dataset.dropChild || null, 'child');
      dragItemId = null;
      if (moved) void persistMovedTree();
    });
  });
  hostElement.querySelector<HTMLElement>('[data-root-drop]')?.addEventListener('drop', event => {
    if ((event.target as Element).closest('[data-drop-child]')) return;
    event.preventDefault();
    const moved = moveDraggedItem(null, 'root');
    dragItemId = null;
    if (moved) void persistMovedTree();
  });
  hostElement.querySelector<HTMLElement>('[data-root-drop]')?.addEventListener('dragover', event => {
    event.preventDefault();
  });
  hostElement.querySelectorAll<HTMLButtonElement>('[data-focus-diagnostic]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.focusDiagnostic;
      if (id) {
        state.selectedItemId = id;
        renderShell();
      }
    });
  });
}

export async function render(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  hostElement = el;
  el.innerHTML = '<div class="navigation-studio__loading">Loading Navigation Studio...</div>';
  try {
    await reloadSnapshot();
    setFeedback('Ready.');
    renderShell();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Navigation Studio failed to load.';
    el.innerHTML = `
      <div class="navigation-studio__error" role="alert">
        <strong>PLAINSPACE_NAVIGATION_STUDIO_LOAD_FAILED</strong>
        <span>${escapeHtml(message)}</span>
      </div>
    `;
  }
}
