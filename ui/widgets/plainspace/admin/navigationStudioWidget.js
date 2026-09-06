import { bpDialog } from '/ui/shared/dialogs/bpDialog.js';
import { registerWorkspaceAgent, patchAgentForm, readAgentForm, agentString } from '/ui/shared/agent/workspaceAgent.js';
import { registerWorkspaceChanges } from '/ui/shared/navigation/workspaceChanges.js';
import enhanceSelects from '../../../shared/controls/customSelect.js';
import { decodeAdminId } from './defaultwidgets/contentSummaryData.js';
import { NAVIGATION_STUDIO_MAX_DEPTH, addNavigationItem, buildNavigationDiagnostics, createMegaMenuDesign, deleteNavigationItem, designUrl, ensureNavigationStudioDefaults, fetchNavigationDesigns, fetchNavigationLocations, fetchNavigationMenus, fetchNavigationTree, fetchPublicPages, flattenNavigationItems, itemId, itemMeta, menuKey, menuLocationKey, persistNavigationOrder, replaceMenuItemsWithGeneratedPages, updateNavigationItem, upsertNavigationMenu } from './navigationStudioData.js';
const state = {
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
    diagnostics: [],
    query: '',
    addOpen: false,
    addParentId: null,
    dirty: false,
    busy: false,
    draft: null,
    collapsed: new Set()
};
let hostElement = null;
let dragItemId = null;
const NAVIGATION_STUDIO_PANEL_CARD_CLASS = 'navigation-studio__card';
function escapeHtml(value) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    };
    return String(value ?? '').replace(/[&<>"']/g, char => map[char] || char);
}
function icon(name, extraClass = '') {
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
function selectedItem() {
    if (state.selectedItemId == null)
        return null;
    return findItem(state.items, state.selectedItemId)?.item || null;
}
function idEquals(a, b) {
    return String(a ?? '') === String(b ?? '') && a != null && b != null;
}
function findItem(items, id, parent = null) {
    for (const [index, item] of items.entries()) {
        if (idEquals(itemId(item), id))
            return { item, parent: parent || items, index, depth: 1 };
        const childResult = findItem(item.children || [], id, item.children || []);
        if (childResult) {
            return { ...childResult, depth: childResult.depth + 1 };
        }
    }
    return null;
}
function isDescendant(parent, candidateId) {
    return (parent.children || []).some(child => (idEquals(itemId(child), candidateId) || isDescendant(child, candidateId)));
}
function branchDepth(item) {
    const children = item.children || [];
    if (!children.length)
        return 1;
    return 1 + Math.max(...children.map(branchDepth));
}
function maxDepthForMode() {
    if (state.mode === 'developer')
        return 20;
    if (state.mode === 'advanced')
        return 4;
    return NAVIGATION_STUDIO_MAX_DEPTH;
}
function setFeedback(message) {
    state.feedback = message;
    const target = hostElement?.querySelector('[data-nav-feedback]');
    if (target)
        target.textContent = message;
}
// Keep the editor draft through local view changes; only explicit navigation
// or a successful write may discard it.
function captureDraft() {
    if (!state.dirty)
        return;
    const inputs = hostElement?.querySelectorAll('[data-inspector-form] [name]');
    if (!inputs?.length)
        return;
    state.draft = { ...state.draft };
    inputs.forEach(input => {
        state.draft[input.name] = input instanceof HTMLInputElement && input.type === 'checkbox'
            ? input.checked : input.value;
    });
}
function clearDraft() {
    state.dirty = false;
    state.draft = null;
}
function setBusy(busy) {
    state.busy = busy;
    hostElement?.querySelector('.navigation-studio')?.setAttribute('aria-busy', String(busy));
    hostElement?.querySelectorAll('[data-nav-workspace]').forEach(el => { el.inert = busy; });
}
async function runAction(code, action, discard = false, propagate = false) {
    if (state.busy)
        return;
    setBusy(true);
    try {
        if (discard && state.dirty) {
            if (!(await bpDialog.confirm('Discard unsaved changes to this menu item?')))
                return;
        }
        const previousFeedback = state.feedback;
        setFeedback('Working…');
        await action();
        if (state.feedback === 'Working…')
            setFeedback(previousFeedback);
    }
    catch (err) {
        setFeedback(`${code}: ${err instanceof Error ? err.message : 'The action failed. Try again.'}`);
        if (propagate)
            throw err;
    }
    finally {
        setBusy(false);
    }
}
function menuLabel(menu) {
    return menu?.label || menuKey(menu) || menuLocationKey(menu) || 'Menu';
}
function itemLabel(item) {
    return item.title || item.url || 'Untitled';
}
function itemUrl(item) {
    return item.url || '#';
}
function titleCase(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
}
function selectedParentId() {
    // Adding a root link must never silently inherit the selected editor item.
    if (state.addParentId != null) {
        const parent = findItem(state.items, state.addParentId);
        if (!parent || parent.depth >= maxDepthForMode()) {
            throw new Error('NAV_STUDIO_ADD_PARENT_INVALID: Choose a parent within the current nesting limit.');
        }
    }
    return state.addParentId;
}
function childItemsForParent(parentId) {
    if (parentId == null)
        return state.items;
    const parent = findItem(state.items, parentId)?.item;
    if (!parent)
        return state.items;
    parent.children ||= [];
    return parent.children;
}
function updateDiagnostics() {
    state.diagnostics = buildNavigationDiagnostics(state.items, state.pages, state.selectedMenu);
}
async function reloadTree() {
    if (!state.selectedMenu)
        return;
    const { meltdownEmit, jwt } = getRuntime();
    state.items = await fetchNavigationTree(meltdownEmit, jwt, state.selectedMenu);
    if (state.addParentId != null && !findItem(state.items, state.addParentId))
        state.addParentId = null;
    if (!selectedItem())
        state.selectedItemId = itemId(state.items[0]);
    updateDiagnostics();
}
async function reloadSnapshot() {
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
        : menus.find(menu => menuLocationKey(menu) === 'primary') || menus[0] || null;
    await reloadTree();
}
function renderModeTabs() {
    return ['simple', 'advanced', 'developer'].map(mode => `
    <button class="navigation-studio__mode ${state.mode === mode ? 'is-active' : ''}" type="button" data-mode="${mode}" aria-pressed="${state.mode === mode}">
      ${escapeHtml(titleCase(mode))}
    </button>
  `).join('');
}
function renderPreviewTabs() {
    const tabs = ['desktop', 'tablet', 'mobile', 'mega', 'footer'];
    return tabs.map(tab => `
    <button class="navigation-studio__preview-tab ${state.preview === tab ? 'is-active' : ''}" type="button" data-preview="${tab}" aria-pressed="${state.preview === tab}">
      ${escapeHtml(titleCase(tab))}
    </button>
  `).join('');
}
function renderMenus() {
    return state.menus.map(menu => {
        const active = state.selectedMenu && (idEquals(menu.id || menu.menuId, state.selectedMenu.id || state.selectedMenu.menuId) ||
            (menuKey(menu) && menuKey(menu) === menuKey(state.selectedMenu)));
        return `
      <option value="${escapeHtml(menuKey(menu))}" ${active ? 'selected' : ''}>${escapeHtml(menuLabel(menu))} · ${escapeHtml(menuLocationKey(menu) || 'unassigned')}</option>
    `;
    }).join('');
}
function renderSearchResults() {
    const query = state.query.trim();
    const filteredPages = query
        ? state.pages
            .filter(page => `${page.title || ''} ${page.slug || ''}`.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 7)
        : state.pages.slice(0, 5);
    const pageRows = filteredPages.map(page => `
    <button class="navigation-studio__search-result" type="button" data-add-page="${escapeHtml(page.id)}">
      ${icon('file-text')}
      <span><strong>${escapeHtml(page.title || page.slug || page.id)}</strong><small>${escapeHtml(page.slug ? `/${page.slug}` : '/')}</small></span>
      ${icon('plus')}
    </button>
  `).join('');
    const customRow = query ? `
    <button class="navigation-studio__search-result" type="button" data-add-custom>
      ${icon('link')}
      <span><strong>Add custom link</strong><small>${escapeHtml(query)}</small></span>
      ${icon('plus')}
    </button>
  ` : '';
    return `${pageRows || '<p class="navigation-studio__empty" role="status">No matching pages.</p>'}${customRow}`;
}
function renderAddSearch() {
    const parents = flattenNavigationItems(state.items).filter(row => row.depth < maxDepthForMode());
    return `
    <div class="navigation-studio__add" data-add-panel ${state.addOpen ? '' : 'hidden'}>
      <label class="navigation-studio__add-target">Add to
        <select data-add-parent aria-label="Add new links to">
          <option value="">Top level</option>
          ${parents.map(row => `<option value="${escapeHtml(itemId(row.item))}" ${idEquals(itemId(row.item), state.addParentId) ? 'selected' : ''}>${'— '.repeat(row.depth - 1)}${escapeHtml(itemLabel(row.item))}</option>`).join('')}
        </select>
      </label>
      <div class="navigation-studio__search">
        ${icon('search')}
        <input data-nav-search type="search" aria-label="Search pages or type a URL" placeholder="Search pages or type a URL" value="${escapeHtml(state.query)}" />
      </div>
      <div class="navigation-studio__search-results" data-search-results>
        ${renderSearchResults()}
      </div>
    </div>
  `;
}
function renderTree(items, depth = 1) {
    if (!items.length && depth === 1) {
        return '<div class="navigation-studio__empty"><strong>This menu has no links yet.</strong><p>Use Add link to choose a page or enter a URL.</p></div>';
    }
    if (!items.length)
        return '';
    return `
    <ul class="navigation-studio__tree-list" data-depth="${depth}">
      ${items.map((item, index) => {
        const id = itemId(item);
        const meta = itemMeta(item);
        const isSelected = id != null && idEquals(id, state.selectedItemId);
        const isMega = Boolean(meta.mega?.enabled);
        const collapsed = state.collapsed.has(String(id));
        const hasChildren = Boolean(item.children?.length);
        return `
          <li class="navigation-studio__tree-row" data-item-id="${escapeHtml(id)}" draggable="true">
            <div class="navigation-studio__item ${isSelected ? 'is-selected' : ''}">
              <span class="navigation-studio__item-grip" aria-hidden="true">${icon('grip-vertical')}</span>
              ${hasChildren ? `<button type="button" data-collapse="${escapeHtml(id)}" aria-expanded="${!collapsed}" aria-label="${collapsed ? 'Expand' : 'Collapse'} ${escapeHtml(itemLabel(item))}">${icon(collapsed ? 'chevron-right' : 'chevron-down')}</button>` : ''}
              <button type="button" class="navigation-studio__item-main" data-select-item="${escapeHtml(id)}" aria-pressed="${isSelected}" aria-label="Edit ${escapeHtml(itemLabel(item))}">
                <strong>${escapeHtml(itemLabel(item))}</strong>
                <small>${escapeHtml(itemUrl(item))}</small>
              </button>
              <span class="navigation-studio__item-badges">
                ${isMega ? '<span class="navigation-studio__badge">Mega</span>' : ''}
                ${item.status && item.status !== 'active' ? `<span class="navigation-studio__badge">${escapeHtml(item.status)}</span>` : ''}
              </span>
              <span class="navigation-studio__item-actions">
                <button type="button" data-move-up="${escapeHtml(id)}" aria-label="Move ${escapeHtml(itemLabel(item))} up" ${index === 0 ? 'disabled' : ''}>${icon('chevron-up')}</button>
                <button type="button" data-move-down="${escapeHtml(id)}" aria-label="Move ${escapeHtml(itemLabel(item))} down" ${index === items.length - 1 ? 'disabled' : ''}>${icon('chevron-down')}</button>
                <button type="button" data-indent="${escapeHtml(id)}" aria-label="Nest ${escapeHtml(itemLabel(item))} under previous link" ${index === 0 || depth + branchDepth(item) > maxDepthForMode() ? 'disabled' : ''}>${icon('corner-down-right')}</button>
                <button type="button" data-outdent="${escapeHtml(id)}" aria-label="Move ${escapeHtml(itemLabel(item))} to parent level" ${depth === 1 ? 'disabled' : ''}>${icon('corner-up-left')}</button>
              </span>
            </div>
            <div class="navigation-studio__drop-child" data-drop-child="${escapeHtml(id)}">Drop here to nest</div>
            ${collapsed ? '' : renderTree(item.children || [], depth + 1)}
          </li>
        `;
    }).join('')}
    </ul>
  `;
}
function previewItemsForMode(items) {
    const device = state.preview === 'mobile' ? 'mobile' : 'desktop';
    return items
        .filter(item => {
        if (item.status && item.status !== 'active')
            return false;
        const visibility = itemMeta(item).visibility || {};
        if (device === 'mobile')
            return visibility.mobile !== false;
        return visibility.desktop !== false;
    })
        .map(item => ({
        ...item,
        children: previewItemsForMode(item.children || [])
    }));
}
function renderPreviewList(items, depth = 1) {
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
function renderPreview() {
    const modeClass = `navigation-studio__preview navigation-studio__preview--${state.preview}`;
    const items = previewItemsForMode(state.items);
    return `
    <details class="${NAVIGATION_STUDIO_PANEL_CARD_CLASS} navigation-studio__preview-panel" data-section="preview">
      <summary class="navigation-studio__panel-title">Menu preview</summary>
      <div class="navigation-studio__preview-tabs" aria-label="Preview format">${renderPreviewTabs()}</div>
      <p class="navigation-studio__hint">Saved, active links only. The public site controls the final appearance.</p>
      <div class="${modeClass}">
        <nav aria-label="${escapeHtml(menuLabel(state.selectedMenu))}">
          ${items.length ? renderPreviewList(items) : '<div class="navigation-studio__empty">Preview is empty.</div>'}
        </nav>
      </div>
    </details>
  `;
}
function renderDiagnostics() {
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
function renderInspector() {
    const item = selectedItem();
    if (!item) {
        return `
      <section class="${NAVIGATION_STUDIO_PANEL_CARD_CLASS} navigation-studio__inspector">
        <h3 class="navigation-studio__panel-title">Link details</h3>
        <div class="navigation-studio__empty">Select a link in the menu structure to edit its label, target and visibility.</div>
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
    <section class="${NAVIGATION_STUDIO_PANEL_CARD_CLASS} navigation-studio__inspector">
      <div class="navigation-studio__panel-title">
        <h3>Link details · ${escapeHtml(itemLabel(item))}</h3>
        <button type="button" data-delete-item aria-label="Delete item">${icon('trash-2')}</button>
      </div>
      <form class="navigation-studio__form" data-inspector-form>
        <label>
          <span>Label</span>
          <input name="title" value="${escapeHtml(item.title || '')}" />
        </label>
        <label>
          <span>Link type</span>
          <select name="type">
            ${Array.from(new Set(['page', 'custom', item.type || 'custom'])).map(type => `
              <option value="${type}" ${item.type === type ? 'selected' : ''}>${type === 'page' ? 'Page' : type === 'custom' ? 'Custom link' : titleCase(type)}</option>
            `).join('')}
          </select>
        </label>
        <label data-page-target>
          <span>Page target</span>
          <select name="sourceId">
            <option value="">No page selected</option>
            ${pageOptions}
          </select>
        </label>
        <label data-url-target>
          <span>URL</span>
          <input name="url" value="${escapeHtml(item.url || '')}" />
        </label>
        <label>
          <span>Status</span>
          <select name="status">
            ${['active', 'draft', 'hidden'].map(status => `
              <option value="${status}" ${(item.status || 'active') === status ? 'selected' : ''}>${status}</option>
            `).join('')}
          </select>
        </label>
        <details data-section="options" class="navigation-studio__options">
        <summary>Display and advanced options</summary>
        <div class="navigation-studio__modes" aria-label="Editing mode">${renderModeTabs()}</div>
        <label>
          <span>Icon</span>
          <input name="icon" value="${escapeHtml(meta.icon || '')}" placeholder="menu, search, file-text" />
        </label>
        <div class="navigation-studio__check-row">
          <label><input name="desktop" type="checkbox" ${visibility.desktop === false ? '' : 'checked'} /> Desktop</label>
          <label><input name="mobile" type="checkbox" ${visibility.mobile === false ? '' : 'checked'} /> Mobile</label>
        </div>
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
        <div class="navigation-studio__inspector-actions" data-mega-actions>
          <button class="button small" type="button" data-open-mega-design>${icon('external-link')}<span>Open</span></button>
          <button class="button small" type="button" data-create-mega-design>${icon('plus')}<span>Create</span></button>
        </div>
        ${state.mode === 'developer' ? `
          <label class="navigation-studio__developer-json">
            <span>Meta JSON</span>
            <textarea name="metaJson" spellcheck="false">${escapeHtml(developerMeta)}</textarea>
          </label>
          <button class="button small" type="button" data-apply-meta-json>${icon('braces')}<span>Apply JSON</span></button>
        ` : ''}
        </details>
        <div class="navigation-studio__save-bar">
          <span data-draft-status role="status">Saved</span>
          <button class="button primary sm" type="submit" data-save-item><span>Save link</span></button>
        </div>
      </form>
    </section>
  `;
}
function renderShell() {
    if (!hostElement)
        return;
    captureDraft();
    const openSections = Array.from(hostElement.querySelectorAll('details[data-section][open]')).map(el => el.dataset.section);
    updateDiagnostics();
    hostElement.innerHTML = `
    <div class="navigation-studio">
      <header class="navigation-studio__header">
        <div>
          <h2>Navigation Studio</h2>
          <p>Manage menus, arrange links and edit their destinations.</p>
        </div>
      <div class="navigation-studio__toolbar" data-nav-workspace>
        <div class="navigation-studio__menu-picker"><select data-menu-select aria-label="Menu">${renderMenus()}</select></div>
        <button class="button secondary sm" type="button" data-create-menu>${icon('plus')}<span>Create menu</span></button>
      </div>
      </header>
      <div class="navigation-studio__feedback" data-nav-feedback role="status" aria-live="polite">${escapeHtml(state.feedback)}</div>
      <div class="navigation-studio__layout" data-nav-workspace>
        <section class="${NAVIGATION_STUDIO_PANEL_CARD_CLASS} navigation-studio__structure" aria-label="Menu structure">
          <div class="navigation-studio__panel-title">
            <h3>${escapeHtml(menuLabel(state.selectedMenu))} <small>${flattenNavigationItems(state.items).length} ${flattenNavigationItems(state.items).length === 1 ? 'link' : 'links'}</small></h3>
            <button class="button secondary sm" type="button" data-toggle-add aria-expanded="${state.addOpen}">${icon('plus')}<span>Add link</span></button>
          </div>
          <p class="navigation-studio__hint">Select a link to edit. Use the arrows or drag to arrange links. Structure changes save immediately.</p>
          ${renderAddSearch()}
          <div class="navigation-studio__tree" data-root-drop>
            ${renderTree(state.items)}
            <div class="navigation-studio__drop-child navigation-studio__drop-root">Drop here for top level</div>
          </div>
          <details class="navigation-studio__tools" data-section="tools">
            <summary>Menu tools</summary>
            <button class="button small" type="button" data-generate-pages>${icon('sparkles')}<span>Generate from pages</span></button>
            <p class="navigation-studio__hint">Replaces the current structure with links from public pages.</p>
          </details>
        </section>
        <aside class="navigation-studio__side">
          ${renderInspector()}
          <details class="${NAVIGATION_STUDIO_PANEL_CARD_CLASS} navigation-studio__diagnostics" data-section="warnings">
            <summary class="navigation-studio__panel-title">Warnings (${state.diagnostics.length})</summary>
            ${renderDiagnostics()}
          </details>
          ${renderPreview()}
        </aside>
      </div>
    </div>
  `;
    hostElement.querySelectorAll('details[data-section]').forEach(el => {
        el.open = openSections.includes(el.dataset.section);
    });
    hostElement.querySelectorAll('[data-inspector-form] [name]').forEach(input => {
        const value = state.draft?.[input.name];
        if (value == null)
            return;
        if (input instanceof HTMLInputElement && input.type === 'checkbox')
            input.checked = Boolean(value);
        else
            input.value = String(value);
    });
    refreshEditorState();
    hostElement.querySelectorAll('select').forEach(select => {
        select.dataset.enhance = 'dropdown';
        const label = select.closest('label')?.querySelector('span')?.textContent;
        if (label && !select.hasAttribute('aria-label'))
            select.setAttribute('aria-label', label);
    });
    enhanceSelects(hostElement);
    setBusy(state.busy);
    bindShellEvents();
}
function refreshEditorState() {
    const form = hostElement?.querySelector('[data-inspector-form]');
    if (!form)
        return;
    const isPage = form.querySelector('[name="type"]')?.value === 'page';
    form.querySelector('[data-page-target]').hidden = !isPage;
    form.querySelector('[data-url-target]').hidden = isPage;
    const status = form.querySelector('[data-draft-status]');
    if (status)
        status.textContent = state.dirty ? 'Unsaved changes' : 'Saved';
    const save = form.querySelector('[data-save-item]');
    if (save)
        save.disabled = !state.dirty;
}
function menuByKey(key) {
    return state.menus.find(menu => menuKey(menu) === key) || null;
}
async function selectMenu(key) {
    const menu = menuByKey(key);
    if (!menu)
        return;
    setFeedback('Loading menu...');
    const { meltdownEmit, jwt } = getRuntime();
    // Commit the menu and tree together so a failed read cannot relabel old links.
    const items = await fetchNavigationTree(meltdownEmit, jwt, menu);
    state.selectedMenu = menu;
    state.items = items;
    state.selectedItemId = itemId(items[0]);
    state.addOpen = false;
    state.addParentId = null;
    state.query = '';
    state.collapsed.clear();
    clearDraft();
    setFeedback('Menu loaded.');
    renderShell();
}
async function createMenu() {
    const locationField = document.createElement('label');
    locationField.className = 'form-field';
    locationField.textContent = 'Menu location (optional)';
    const locationInput = document.createElement('input');
    locationInput.type = 'text';
    locationInput.placeholder = 'e.g. primary or footer';
    locationField.appendChild(locationInput);
    const name = await bpDialog.prompt('Choose a name and where this menu is used.', '', {
        title: 'Create menu',
        submitLabel: 'Create menu',
        prompt: { label: 'Menu name', required: true },
        body: locationField
    });
    if (!name?.trim())
        return;
    const key = name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!key)
        throw new Error('NAV_STUDIO_MENU_KEY_REQUIRED: Include a letter or number in the menu name.');
    if (state.menus.some(menu => menuKey(menu) === key))
        throw new Error('NAV_STUDIO_MENU_EXISTS: A menu with this name already exists.');
    const { meltdownEmit, jwt } = getRuntime();
    const created = await upsertNavigationMenu(meltdownEmit, jwt, {
        label: name.trim(),
        key,
        locationKey: locationInput.value.trim()
    });
    state.selectedMenu = created;
    clearDraft();
    await reloadSnapshot();
    renderShell();
}
async function addPage(page) {
    if (!state.selectedMenu)
        return;
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
    clearDraft();
    await reloadTree();
    setFeedback('Page link added.');
    renderShell();
}
async function addCustom() {
    if (!state.selectedMenu || !hostElement)
        return;
    const input = hostElement.querySelector('[data-nav-search]');
    const raw = input?.value.trim() || '';
    const label = await bpDialog.prompt(raw, raw.replace(/^https?:\/\//u, '').replace(/^\/+/u, '') || 'New link', {
        title: 'Add custom link', submitLabel: 'Add link', prompt: { label: 'Link label', required: true }
    });
    if (!label?.trim())
        return;
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
    clearDraft();
    await reloadTree();
    setFeedback('Custom link added.');
    renderShell();
}
async function saveSelectedItem() {
    if (!hostElement)
        return;
    const item = selectedItem();
    if (!item)
        return;
    const form = hostElement.querySelector('[data-inspector-form]');
    if (!form)
        return;
    const getInput = (name) => form.querySelector(`[name="${name}"]`);
    const selectedPage = state.pages.find(page => idEquals(page.id, getInput('sourceId')?.value));
    const type = getInput('type')?.value || item.type || 'custom';
    const title = getInput('title')?.value.trim();
    if (!title)
        throw new Error('NAV_STUDIO_LABEL_REQUIRED: Enter a label for this link.');
    if (type === 'page' && !selectedPage)
        throw new Error('NAV_STUDIO_PAGE_REQUIRED: Choose a page target.');
    const currentMeta = itemMeta(item);
    const megaLayoutId = getInput('megaLayoutId')?.value || '';
    const selectedDesign = state.designs.find(design => idEquals(design.id, megaLayoutId));
    const megaEnabled = getInput('megaEnabled')?.value === 'true';
    const meta = {
        ...currentMeta,
        icon: getInput('icon')?.value.trim() || undefined,
        visibility: {
            ...currentMeta.visibility,
            desktop: getInput('desktop')?.checked !== false,
            mobile: getInput('mobile')?.checked !== false
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
    if (!meta.icon)
        delete meta.icon;
    if (!megaEnabled)
        meta.mega = { enabled: false, fallback: 'children' };
    const patch = {
        title,
        type,
        url: getInput('url')?.value.trim() || '',
        sourceId: type === 'page' ? selectedPage.id : type === 'custom' ? null : item.sourceId ?? item.source_id ?? null,
        sourceModule: type === 'page' ? 'pagesManager' : type === 'custom' ? null : item.sourceModule ?? item.source_module ?? null,
        entryId: type === 'page' || type === 'custom' ? null : item.entryId ?? item.entry_id ?? null,
        target: getInput('target')?.value || '',
        rel: getInput('rel')?.value.trim() ?? item.rel ?? '',
        status: getInput('status')?.value || 'active',
        meta
    };
    if (type === 'page' && selectedPage) {
        patch.url = selectedPage.slug ? `/${String(selectedPage.slug).replace(/^\/+/u, '')}` : '/';
    }
    const { meltdownEmit, jwt } = getRuntime();
    await updateNavigationItem(meltdownEmit, jwt, item, patch);
    clearDraft();
    await reloadTree();
    setFeedback('Item saved.');
    renderShell();
}
async function applyMetaJson() {
    if (!hostElement)
        return;
    const item = selectedItem();
    const textarea = hostElement.querySelector('[name="metaJson"]');
    if (!item || !textarea)
        return;
    try {
        const parsed = JSON.parse(textarea.value);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Metadata must be a JSON object.');
        }
        const { meltdownEmit, jwt } = getRuntime();
        await updateNavigationItem(meltdownEmit, jwt, item, { meta: parsed });
        clearDraft();
        await reloadTree();
        setFeedback('Meta JSON applied.');
        renderShell();
    }
    catch (err) {
        setFeedback(`PLAINSPACE_NAVIGATION_STUDIO_META_JSON_INVALID: ${err instanceof Error ? err.message : 'Invalid JSON'}`);
    }
}
async function deleteSelectedItem() {
    const item = selectedItem();
    if (!item)
        return;
    if (!(await bpDialog.confirm(`Delete "${itemLabel(item)}"${item.children?.length ? ' and its child links' : ''}?`)))
        return;
    const { meltdownEmit, jwt } = getRuntime();
    await deleteNavigationItem(meltdownEmit, jwt, item);
    clearDraft();
    state.selectedItemId = null;
    await reloadTree();
    setFeedback('Item deleted.');
    renderShell();
}
async function generateFromPages() {
    if (!state.selectedMenu)
        return;
    if (state.items.length && !(await bpDialog.confirm('Replace this menu with links generated from public pages?')))
        return;
    const { meltdownEmit, jwt } = getRuntime();
    await replaceMenuItemsWithGeneratedPages(meltdownEmit, jwt, state.selectedMenu, state.items, state.pages);
    clearDraft();
    state.selectedItemId = null;
    await reloadTree();
    setFeedback('Menu generated from public pages.');
    renderShell();
}
function moveSibling(id, direction) {
    const found = findItem(state.items, id);
    if (!found)
        return;
    const nextIndex = found.index + direction;
    if (nextIndex < 0 || nextIndex >= found.parent.length)
        return;
    const [item] = found.parent.splice(found.index, 1);
    if (!item)
        return;
    found.parent.splice(nextIndex, 0, item);
}
function outdentItem(id) {
    const found = findItem(state.items, id);
    if (!found || found.parent === state.items)
        return;
    const parentRow = flattenNavigationItems(state.items).find(row => (row.item.children === found.parent));
    if (!parentRow)
        return;
    const grandParent = parentRow.parentId == null
        ? state.items
        : findItem(state.items, parentRow.parentId)?.item.children || state.items;
    const parentIndex = grandParent.findIndex(item => idEquals(itemId(item), itemId(parentRow.item)));
    const [item] = found.parent.splice(found.index, 1);
    if (!item)
        return;
    grandParent.splice(parentIndex + 1, 0, item);
}
function moveTreeItem(id, targetId, mode) {
    const dragged = findItem(state.items, id);
    if (!dragged)
        return false;
    if (targetId != null && idEquals(targetId, id))
        return false;
    if (targetId != null && isDescendant(dragged.item, targetId))
        return false;
    const [item] = dragged.parent.splice(dragged.index, 1);
    if (!item)
        return false;
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
async function persistMovedTree() {
    const { meltdownEmit, jwt } = getRuntime();
    try {
        await persistNavigationOrder(meltdownEmit, jwt, state.items);
    }
    catch (err) {
        // Order writes use the existing per-item contract. Refresh partial failures
        // from the owner instead of presenting the optimistic tree as saved.
        await reloadTree();
        renderShell();
        throw err;
    }
    await reloadTree();
    setFeedback('Menu order saved.');
    renderShell();
}
async function openMegaDesign(createIfMissing = false) {
    const item = selectedItem();
    if (!item)
        return;
    const meta = itemMeta(item);
    const layoutId = hostElement?.querySelector('[name="megaLayoutId"]')?.value || meta.mega?.layoutId;
    if (layoutId) {
        window.open(designUrl({ id: layoutId }), '_blank', 'noopener');
        return;
    }
    if (!createIfMissing) {
        setFeedback('NAV_STUDIO_MEGA_LAYOUT_MISSING: Select or create a Design Studio panel first.');
        return;
    }
    const { meltdownEmit, jwt } = getRuntime();
    const newId = await createMegaMenuDesign(meltdownEmit, jwt, decodeAdminId(jwt), `Mega Menu - ${itemLabel(item)}`);
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
    clearDraft();
    state.designs = await fetchNavigationDesigns(meltdownEmit, jwt);
    await reloadTree();
    setFeedback('Mega Menu Design Studio panel created.');
    renderShell();
    window.open(designUrl({ id: newId }), '_blank', 'noopener');
}
function bindShellEvents() {
    if (!hostElement)
        return;
    const bindAction = (selector, code, action, discard = false) => {
        hostElement?.querySelector(selector)?.addEventListener('click', () => {
            void runAction(code, action, discard);
        });
    };
    hostElement.querySelectorAll('[data-mode]').forEach(button => {
        button.addEventListener('click', () => {
            state.mode = button.dataset.mode;
            renderShell();
        });
    });
    hostElement.querySelectorAll('[data-preview]').forEach(button => {
        button.addEventListener('click', () => {
            state.preview = button.dataset.preview;
            renderShell();
        });
    });
    hostElement.querySelector('[data-menu-select]')?.addEventListener('change', event => {
        const key = event.target.value;
        void runAction('NAV_STUDIO_MENU_LOAD_FAILED', () => selectMenu(key), true).then(() => {
            // A cancelled switch or failed read must keep the selector and tree aligned.
            if (menuKey(state.selectedMenu) !== key)
                renderShell();
        });
    });
    bindAction('[data-create-menu]', 'NAV_STUDIO_MENU_CREATE_FAILED', createMenu, true);
    bindAction('[data-generate-pages]', 'NAV_STUDIO_GENERATE_FAILED', generateFromPages, true);
    bindAction('[data-toggle-add]', 'NAV_STUDIO_ADD_PANEL_FAILED', () => {
        state.addOpen = !state.addOpen;
        renderShell();
    });
    hostElement.querySelector('[data-add-parent]')?.addEventListener('change', event => {
        state.addParentId = event.target.value || null;
    });
    hostElement.querySelector('[data-nav-search]')?.addEventListener('input', event => {
        state.query = event.target.value;
        const results = hostElement?.querySelector('[data-search-results]');
        // Do not replace the editor or search input on each keystroke.
        if (results)
            results.innerHTML = renderSearchResults();
    });
    hostElement.querySelector('[data-search-results]')?.addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button)
            return;
        if (button.hasAttribute('data-add-page')) {
            const page = state.pages.find(candidate => idEquals(candidate.id, button.dataset.addPage));
            if (page)
                void runAction('NAV_STUDIO_ADD_FAILED', () => addPage(page), true);
        }
        else if (button.hasAttribute('data-add-custom')) {
            void runAction('NAV_STUDIO_ADD_FAILED', addCustom, true);
        }
    });
    hostElement.querySelectorAll('[data-select-item]').forEach(button => {
        button.addEventListener('click', () => {
            if (idEquals(button.dataset.selectItem, state.selectedItemId))
                return;
            void runAction('NAV_STUDIO_SELECT_FAILED', () => {
                state.selectedItemId = button.dataset.selectItem || null;
                clearDraft();
                renderShell();
                hostElement?.querySelector('[name="title"]')?.focus();
            }, true);
        });
    });
    hostElement.querySelectorAll('[data-collapse]').forEach(button => {
        button.addEventListener('click', () => {
            const id = button.dataset.collapse;
            if (state.collapsed.has(id))
                state.collapsed.delete(id);
            else
                state.collapsed.add(id);
            renderShell();
            Array.from(hostElement?.querySelectorAll('[data-collapse]') || [])
                .find(candidate => candidate.dataset.collapse === id)?.focus();
        });
    });
    const form = hostElement.querySelector('[data-inspector-form]');
    const onEdit = () => {
        state.dirty = true;
        refreshEditorState();
    };
    form?.addEventListener('input', onEdit);
    form?.addEventListener('change', onEdit);
    form?.addEventListener('submit', event => {
        event.preventDefault();
        void runAction('NAV_STUDIO_SAVE_FAILED', saveSelectedItem);
    });
    bindAction('[data-apply-meta-json]', 'NAV_STUDIO_META_SAVE_FAILED', applyMetaJson);
    bindAction('[data-delete-item]', 'NAV_STUDIO_DELETE_FAILED', deleteSelectedItem);
    bindAction('[data-open-mega-design]', 'NAV_STUDIO_DESIGN_OPEN_FAILED', () => openMegaDesign(false));
    bindAction('[data-create-mega-design]', 'NAV_STUDIO_DESIGN_CREATE_FAILED', () => openMegaDesign(true), true);
    hostElement.querySelectorAll('[data-move-up], [data-move-down], [data-outdent], [data-indent]').forEach(button => {
        button.addEventListener('click', () => {
            const id = button.dataset.moveUp || button.dataset.moveDown || button.dataset.outdent || button.dataset.indent;
            if (!id)
                return;
            void runAction('NAV_STUDIO_ORDER_SAVE_FAILED', async () => {
                if (button.dataset.moveUp)
                    moveSibling(id, -1);
                if (button.dataset.moveDown)
                    moveSibling(id, 1);
                if (button.dataset.outdent)
                    outdentItem(id);
                if (button.dataset.indent) {
                    const row = findItem(state.items, id);
                    const previous = row?.parent[(row?.index ?? 0) - 1];
                    if (!previous || !moveTreeItem(id, itemId(previous), 'child'))
                        return;
                }
                await persistMovedTree();
            });
        });
    });
    hostElement.querySelectorAll('.navigation-studio__tree-row').forEach(row => {
        row.addEventListener('dragstart', event => {
            // Nested draggable rows must not let an ancestor take over the dragged id.
            event.stopPropagation();
            if (state.busy) {
                event.preventDefault();
                return;
            }
            dragItemId = row.dataset.itemId || null;
            event.dataTransfer?.setData('text/plain', String(dragItemId || ''));
            hostElement?.querySelector('.navigation-studio')?.classList.add('is-dragging');
        });
        row.addEventListener('dragend', event => {
            event.stopPropagation();
            dragItemId = null;
            hostElement?.querySelector('.navigation-studio')?.classList.remove('is-dragging');
        });
    });
    const drop = (event, targetId, mode) => {
        event.preventDefault();
        event.stopPropagation();
        const id = dragItemId;
        dragItemId = null;
        hostElement?.querySelector('.navigation-studio')?.classList.remove('is-dragging');
        if (id == null)
            return;
        void runAction('NAV_STUDIO_ORDER_SAVE_FAILED', async () => {
            if (moveTreeItem(id, targetId, mode))
                await persistMovedTree();
        });
    };
    hostElement.querySelectorAll('[data-drop-child]').forEach(zone => {
        zone.addEventListener('dragover', event => { event.preventDefault(); event.stopPropagation(); });
        zone.addEventListener('drop', event => drop(event, zone.dataset.dropChild || null, 'child'));
    });
    hostElement.querySelector('[data-root-drop]')?.addEventListener('drop', event => drop(event, null, 'root'));
    hostElement.querySelector('[data-root-drop]')?.addEventListener('dragover', event => event.preventDefault());
    hostElement.querySelectorAll('[data-focus-diagnostic]').forEach(button => {
        button.addEventListener('click', () => {
            const id = button.dataset.focusDiagnostic;
            if (!id)
                return;
            void runAction('NAV_STUDIO_SELECT_FAILED', () => {
                state.selectedItemId = id;
                clearDraft();
                renderShell();
                hostElement?.querySelector('[name="title"]')?.focus();
            }, true);
        });
    });
    hostElement.querySelector('.navigation-studio__preview')?.addEventListener('click', event => {
        if (event.target.closest('a'))
            event.preventDefault();
    });
}
export async function render(el) {
    if (el)
        registerWorkspaceChanges(el, { isDirty: () => state.dirty, isBusy: () => state.busy });
    if (!el)
        return;
    hostElement = el;
    clearDraft();
    state.busy = false;
    state.addOpen = false;
    state.query = '';
    state.addParentId = null;
    state.selectedMenu = null;
    state.selectedItemId = null;
    state.mode = 'simple';
    state.preview = 'desktop';
    state.collapsed.clear();
    el.innerHTML = '<div class="navigation-studio__loading" role="status">Loading Navigation Studio...</div>';
    try {
        await reloadSnapshot();
        setFeedback('');
        renderShell();
        const editableFields = ['title', 'type', 'sourceId', 'url', 'status', 'icon', 'target', 'megaLayoutId', 'megaEnabled'];
        registerWorkspaceAgent({ root: el, id: 'navigation', title: 'Navigation',
            read: () => ({ dirty: state.dirty, busy: state.busy, error: /(?:FAILED|INVALID|ERROR):/.test(state.feedback) ? state.feedback : null, feedback: state.feedback,
                selection: { menu: menuKey(state.selectedMenu), item: state.selectedItemId },
                menus: state.menus, items: state.items, diagnostics: state.diagnostics,
                draft: readAgentForm(el, editableFields),
                pages: state.pages.map(({ id, title, slug, status }) => ({ id, title, slug, status }))
            }),
            actions: [
                { action: 'navigation.selectMenu', label: 'Select menu', params: [{ name: 'key', type: 'string', required: true }], run: p => {
                        const key = agentString(p, 'key');
                        if (!menuByKey(key))
                            throw new Error('NAV_STUDIO_MENU_NOT_FOUND');
                        return runAction('NAV_STUDIO_MENU_LOAD_FAILED', () => selectMenu(key), false, true);
                    } },
                { action: 'navigation.selectItem', label: 'Select menu item', params: [{ name: 'id', type: 'string', required: true }], run: p => {
                        const id = agentString(p, 'id');
                        if (!findItem(state.items, id))
                            throw new Error('NAV_STUDIO_ITEM_NOT_FOUND');
                        state.selectedItemId = id;
                        clearDraft();
                        renderShell();
                    } },
                { action: 'navigation.updateDraft', label: 'Update link details', acceptsDraft: true,
                    params: [{ name: 'fields', type: 'object', required: true }], run: p => patchAgentForm(el, p.fields, editableFields) },
                { action: 'navigation.save', label: 'Save menu item', acceptsDraft: true, confirm: true,
                    run: () => {
                        if (!selectedItem())
                            throw new Error('NAV_STUDIO_ITEM_NOT_FOUND');
                        return runAction('NAV_STUDIO_SAVE_FAILED', saveSelectedItem, false, true);
                    } },
                { action: 'navigation.addPage', label: 'Add a page link', confirm: true,
                    params: [{ name: 'pageId', type: 'string', required: true }, { name: 'parentId', type: 'string', required: false }],
                    run: p => {
                        const page = state.pages.find(candidate => idEquals(candidate.id, agentString(p, 'pageId')) && candidate.status !== 'deleted');
                        if (!page || !state.selectedMenu)
                            throw new Error('NAV_STUDIO_PAGE_REQUIRED');
                        state.addParentId = p.parentId == null ? null : agentString(p, 'parentId');
                        return runAction('NAV_STUDIO_ADD_FAILED', () => addPage(page), false, true);
                    } },
                { action: 'navigation.moveItem', label: 'Move a menu branch', confirm: true,
                    params: [{ name: 'id', type: 'string', required: true }, { name: 'parentId', type: 'string', required: false }],
                    run: p => runAction('NAV_STUDIO_MOVE_FAILED', async () => {
                        const id = agentString(p, 'id');
                        const parent = p.parentId == null ? null : agentString(p, 'parentId');
                        if (!moveTreeItem(id, parent, parent == null ? 'root' : 'child'))
                            throw new Error('NAV_STUDIO_MOVE_INVALID: Check the target and nesting limit.');
                        await persistMovedTree();
                    }, false, true) }
            ]
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Navigation Studio failed to load.';
        el.innerHTML = `
      <div class="navigation-studio__error" role="alert">
        <strong>PLAINSPACE_NAVIGATION_STUDIO_LOAD_FAILED</strong>
        <span>${escapeHtml(message)}</span>
        <button class="button small" type="button" data-retry>Retry</button>
      </div>
    `;
        el.querySelector('[data-retry]')?.addEventListener('click', () => { void render(el); });
    }
}
