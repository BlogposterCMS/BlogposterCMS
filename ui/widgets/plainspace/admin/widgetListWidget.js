import { fetchGlobalWidgetIds, fetchWidgetRegistry, getWidgetTemplates } from './widgetListData.js';
import { registerWorkspaceAgent, agentString } from '../../../shared/agent/workspaceAgent.js';
function readableError(err) {
    return err instanceof Error ? err.message : String(err);
}
/** A library of public building blocks, rendered through the normal widget facade. */
export async function render(el) {
    if (!el)
        return;
    el.innerHTML = '<p role="status">Loading widgets…</p>';
    let widgets;
    try {
        widgets = (await fetchWidgetRegistry(window.meltdownEmit, window.ADMIN_TOKEN))
            .filter(widget => widget.metadata?.hiddenFromCatalog !== true);
    }
    catch (err) {
        const message = document.createElement('p');
        message.setAttribute('role', 'alert');
        message.textContent = `WIDGET_LIBRARY_LOAD_FAILED: ${readableError(err)}`;
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'button secondary sm';
        retry.textContent = 'Retry';
        retry.addEventListener('click', () => void render(el));
        el.replaceChildren(message, retry);
        return;
    }
    let view = 'all';
    let query = '';
    let selectedKey = '';
    let globalIds = null;
    let globalError = '';
    let scanning = false;
    const adminBase = (window.ADMIN_BASE || '/admin').replace(/\/$/, '');
    el.innerHTML = `
    <section class="widget-library" aria-label="Widget library">
      <header class="widget-library__header">
        <div><h2>Widgets</h2><p>Building blocks for your public site. Place and edit widgets in Design Studio.</p></div>
        <a class="button secondary sm" data-open-studio>Open Design Studio</a>
      </header>
      <div class="widget-library__layout">
        <section class="widget-library__browse" aria-label="Available widgets">
          <input class="widget-library__search" type="search" aria-label="Search widgets" placeholder="Search widgets…">
          <div class="widget-library__filters" role="group" aria-label="Widget view">
            <button type="button" data-view="all" aria-pressed="true">Available</button>
            <button type="button" data-view="global" aria-pressed="false">Global</button>
            <button type="button" data-view="templates" aria-pressed="false">Templates</button>
          </div>
          <p class="widget-library__summary" role="status" aria-live="polite"></p>
          <div class="widget-library__list"></div>
        </section>
        <section class="widget-library__details" aria-label="Widget details"></section>
      </div>
    </section>`;
    const root = el.querySelector('.widget-library');
    const list = root.querySelector('.widget-library__list');
    const details = root.querySelector('.widget-library__details');
    const summary = root.querySelector('.widget-library__summary');
    root.querySelector('[data-open-studio]').href = `${adminBase}/content/designer-layouts`;
    function entries() {
        const title = (widget) => widget.metadata?.label || widget.label || widget.id;
        if (view === 'templates') {
            // Read when opened/refreshed so navigating away cannot leak window listeners.
            return getWidgetTemplates().map((template, index) => ({
                key: `template-${index}`,
                widgetId: template.widgetId,
                title: template.name || template.label || template.widgetId,
                description: 'Saved in this browser. Available in the saved templates section of Design Studio.',
                template
            }));
        }
        const definitions = view === 'global'
            ? Array.from(globalIds || []).map(id => widgets.find(widget => widget.id === id) || { id })
            : widgets;
        return definitions.map(widget => ({
            key: widget.id,
            widgetId: widget.id,
            title: title(widget),
            description: widget.metadata?.description || 'Select this widget in Design Studio to add it to your page.'
        }));
    }
    function renderDetails(entry) {
        details.replaceChildren();
        const kicker = document.createElement('p');
        kicker.className = 'widget-library__kicker';
        kicker.textContent = entry?.template ? 'LOCAL TEMPLATE' : view === 'global' ? 'GLOBAL WIDGET' : 'PUBLIC WIDGET';
        const title = document.createElement('h3');
        title.tabIndex = -1;
        title.textContent = entry?.title || 'Choose a widget';
        const copy = document.createElement('p');
        copy.textContent = entry?.description || 'Browse the available building blocks or search by name.';
        details.append(kicker, title, copy);
        if (entry && view === 'global') {
            const hint = document.createElement('p');
            hint.textContent = 'Used as a global instance in a saved page layout. Editing a shared instance affects every place that uses it.';
            details.appendChild(hint);
        }
        if (entry) {
            const destination = document.createElement('a');
            destination.className = 'button secondary sm';
            destination.href = `${adminBase}/content/designer-layouts`;
            destination.textContent = 'Open Design Studio';
            details.appendChild(destination);
        }
        const back = document.createElement('button');
        back.type = 'button';
        back.className = 'button text sm widget-library__back';
        back.textContent = 'Back to widgets';
        back.addEventListener('click', () => root.querySelector('[type="search"]')?.focus());
        details.appendChild(back);
    }
    function renderList() {
        list.replaceChildren();
        root.querySelectorAll('[data-view]').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.view === view));
        });
        if (view === 'global' && (scanning || globalError)) {
            summary.setAttribute('role', globalError ? 'alert' : 'status');
            summary.textContent = globalError || 'Checking saved page layouts…';
            if (globalError) {
                const retry = document.createElement('button');
                retry.type = 'button';
                retry.className = 'button secondary sm';
                retry.textContent = 'Retry';
                retry.addEventListener('click', () => void scanGlobal());
                list.appendChild(retry);
            }
            renderDetails();
            return;
        }
        const filtered = entries().filter(entry => `${entry.title} ${entry.widgetId}`.toLowerCase().includes(query.trim().toLowerCase()));
        summary.setAttribute('role', 'status');
        summary.textContent = `${filtered.length} ${view === 'templates' ? 'template' : 'widget'}${filtered.length === 1 ? '' : 's'}${view === 'templates' ? ' saved in this browser' : ''}`;
        if (!filtered.some(entry => entry.key === selectedKey))
            selectedKey = filtered[0]?.key || '';
        if (!filtered.length) {
            const empty = document.createElement('p');
            empty.className = 'widget-library__empty';
            empty.textContent = query.trim() ? 'No matches. Try another search.' : view === 'global'
                ? 'No global widgets found in saved page layouts.'
                : view === 'templates' ? 'No templates saved in this browser yet.' : 'No public widgets are available.';
            list.appendChild(empty);
        }
        for (const entry of filtered) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'widget-library__item';
            button.dataset.widgetId = entry.widgetId;
            button.setAttribute('aria-pressed', String(entry.key === selectedKey));
            const icon = document.createElement('img');
            icon.src = '/assets/icons/puzzle.svg';
            icon.alt = '';
            icon.className = 'icon';
            const name = document.createElement('strong');
            name.textContent = entry.title;
            button.append(icon, name);
            button.addEventListener('click', () => {
                selectedKey = entry.key;
                renderList();
                details.querySelector('h3')?.focus();
            });
            list.appendChild(button);
        }
        renderDetails(filtered.find(entry => entry.key === selectedKey));
    }
    async function scanGlobal() {
        if (scanning)
            return;
        scanning = true;
        globalError = '';
        renderList();
        try {
            globalIds = await fetchGlobalWidgetIds(window.meltdownEmit, window.ADMIN_TOKEN);
        }
        catch (err) {
            globalError = `WIDGET_LIBRARY_USAGE_FAILED: ${readableError(err)}`;
        }
        finally {
            scanning = false;
            if (root.isConnected)
                renderList();
        }
    }
    root.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
        view = button.dataset.view;
        selectedKey = '';
        if (view === 'global' && globalIds === null && !globalError)
            void scanGlobal();
        else
            renderList();
    }));
    root.querySelector('[type="search"]')?.addEventListener('input', event => {
        query = event.target.value;
        renderList();
    });
    renderList();
    registerWorkspaceAgent({ root, id: 'widgets', title: 'Widget library',
        read: () => ({ dirty: false, busy: scanning, error: globalError, selection: selectedKey,
            view, query, entries: entries(), widgets: widgets.map(({ id, metadata }) => ({ id, metadata })) }),
        actions: [
            { action: 'widgets.search', label: 'Search widgets', params: [{ name: 'query', type: 'string', required: true }], run: p => {
                    if (typeof p.query !== 'string')
                        throw new Error('CMS_AGENT_PARAM_INVALID: query must be a string.');
                    query = p.query;
                    root.querySelector('[type="search"]').value = query;
                    renderList();
                } },
            { action: 'widgets.select', label: 'Select widget', params: [{ name: 'key', type: 'string', required: true }], run: p => {
                    const key = agentString(p, 'key');
                    if (!entries().some(entry => entry.key === key))
                        throw new Error('WIDGET_LIBRARY_ENTRY_NOT_FOUND');
                    selectedKey = key;
                    renderList();
                } },
            { action: 'widgets.setView', label: 'Choose library view', params: [{ name: 'view', type: 'string', required: true }], run: async (p) => {
                    if (p.view !== 'all' && p.view !== 'global' && p.view !== 'templates')
                        throw new Error('WIDGET_LIBRARY_VIEW_INVALID');
                    view = p.view;
                    selectedKey = '';
                    if (view === 'global') {
                        await scanGlobal();
                        if (globalError)
                            throw new Error(globalError);
                    }
                    else
                        renderList();
                } }
        ]
    });
}
