import { PUBLIC_CANVAS_STYLE_ID, PUBLIC_CANVAS_CSS, publicCanvasStyle, publicItemStyle, publicPlacement } from '/ui/shared/layout/publicCanvasPresentation.js';
// The loader is fetched as browser ESM rather than bundled server code.
import { emitRuntimePublic } from '/ui/shared/api-client/runtimeFacade.js';
import { executeJs } from '/ui/runtime/main/script-utils.js';
import { sanitizeHtml } from '/ui/shared/sanitize/sanitizer.js';
const PUBLIC_WIDGETS_READY_EVENT = 'bp:public-widgets-ready';
function toNumber(value, fallback) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function ensurePublicCanvasStyles() {
    if (document.getElementById(PUBLIC_CANVAS_STYLE_ID))
        return;
    const style = document.createElement('style');
    style.id = PUBLIC_CANVAS_STYLE_ID;
    style.textContent = PUBLIC_CANVAS_CSS;
    document.head.appendChild(style);
}
function preparePublicCanvas(gridEl, layout) {
    ensurePublicCanvasStyles();
    gridEl.classList.add('bp-public-canvas');
    Object.entries(publicCanvasStyle(layout)).forEach(([key, value]) => gridEl.style.setProperty(key, value));
}
function markPublicWidgetsReady(layout, renderedCount) {
    document.documentElement.dataset.bpPublicWidgetsReady = 'true';
    window.dispatchEvent(new CustomEvent(PUBLIC_WIDGETS_READY_EVENT, {
        detail: {
            layoutRef: layout.layoutRef || '',
            renderedCount
        }
    }));
}
function applyPublicPercentPosition(itemEl, item) {
    const { x, y, w, h } = publicPlacement(item);
    itemEl.dataset.xPercent = String(x);
    itemEl.dataset.yPercent = String(y);
    itemEl.dataset.wPercent = String(w);
    itemEl.dataset.hPercent = String(h);
    Object.entries(publicItemStyle(item)).forEach(([key, value]) => itemEl.style.setProperty(key, value));
}
function normalizePublicWidgetLayout(value) {
    if (!isRecord(value))
        return null;
    const items = Array.isArray(value.items) ? value.items : [];
    const grid = isRecord(value.grid) ? value.grid : {};
    return {
        grid: {
            columns: toNumber(grid.columns, 12),
            cellHeight: toNumber(grid.cellHeight, 8),
            rows: toNumber(grid.rows, 0)
        },
        items: items.filter(isRecord),
        layoutRef: typeof value.layoutRef === 'string' ? value.layoutRef : undefined
    };
}
function fallbackLayout(layoutRef) {
    return {
        grid: { columns: 12, cellHeight: 8 },
        items: [],
        layoutRef: typeof layoutRef === 'string' ? layoutRef : undefined
    };
}
async function emitPublicRuntime(ctx, resource, action, params = {}) {
    if (typeof ctx.meltdownEmit !== 'function') {
        throw new Error('[WidgetPublicLoader:PUBLIC_RUNTIME_EMIT_MISSING] meltdownEmit is required.');
    }
    return emitRuntimePublic(ctx.meltdownEmit, ctx.publicToken, resource, action, params);
}
function resolveWidgetLayout(descriptor, ctx) {
    const descriptorLayout = normalizePublicWidgetLayout(descriptor.layout);
    if (descriptorLayout)
        return descriptorLayout;
    if (descriptor.layout !== undefined) {
        console.warn('[WidgetPublicLoader:INVALID_LAYOUT_DESCRIPTOR] Ignoring invalid widget layout descriptor.');
    }
    const ctxLayout = normalizePublicWidgetLayout(ctx.activeLayout);
    if (ctxLayout)
        return ctxLayout;
    return fallbackLayout(descriptor.layoutRef || ctx.activeLayoutRef);
}
function parseWidgetCode(content) {
    if (!content)
        return {};
    if (typeof content !== 'string')
        return content;
    try {
        const parsed = JSON.parse(content);
        return parsed && typeof parsed === 'object' ? parsed : {};
    }
    catch {
        return {};
    }
}
function isSafeWidgetModulePath(value) {
    return typeof value === 'string'
        && /^\/ui\/widgets\/plainspace\/public\/basicwidgets\/[A-Za-z0-9_-]+\.js$/.test(value);
}
async function renderWidgetModule(container, item, def, ctx) {
    if (!isSafeWidgetModulePath(def.content))
        return false;
    try {
        const mod = await import(/* webpackIgnore: true */ def.content);
        if (typeof mod.render !== 'function')
            return false;
        await mod.render(container, {
            id: item.instanceId,
            widgetId: item.widgetId,
            publicToken: ctx.publicToken,
            meltdownEmit: ctx.meltdownEmit,
            metadata: def.metadata || {},
            instanceMetadata: isRecord(item.metadata) ? item.metadata : {}
        });
        return true;
    }
    catch (error) {
        console.error('[WidgetPublicLoader:MODULE_RENDER_FAILED]', error);
        return false;
    }
}
function createInstanceId(item) {
    const generated = globalThis.crypto?.randomUUID?.() || String(Math.random());
    return item.instanceId || generated;
}
async function loadWidgets(descriptor = {}, ctx = {}) {
    const layout = resolveWidgetLayout(descriptor, ctx);
    const root = document.getElementById('app') || document.body;
    // Raw HTML is the complete fallback presentation when no widget placements
    // exist. Appending the default 100vh canvas here would add a blank page after
    // otherwise complete imported or hand-authored content.
    const hasHtmlPage = ctx.hasPageHtmlContent === true || Boolean(root.querySelector('.bp-page-html'));
    if ((layout.items || []).length === 0 && hasHtmlPage) {
        markPublicWidgetsReady(layout, 0);
        return;
    }
    // HTML-only pages return above without downloading the interactive grid's
    // dependency graph. Import concrete shared helpers instead of the runtime
    // barrel, whose re-exports also pull admin surfaces into public page startup.
    const runtimeReady = Promise.all([
        import(/* webpackIgnore: true */ '/ui/shared/grid/canvasGrid.js'),
        import(/* webpackIgnore: true */ '/ui/widgets/options/widgetOptions.js')
    ]).catch(error => {
        throw new Error('WIDGET_PUBLIC_RUNTIME_IMPORT_FAILED: Unable to load canvas dependencies.', { cause: error });
    });
    const registryReady = typeof ctx.meltdownEmit === 'function'
        ? emitPublicRuntime(ctx, 'widgets', 'list').catch(() => [])
        : [];
    const [[{ init: initCanvasGrid }, { applyWidgetOptions }], registry] = await Promise.all([
        runtimeReady,
        registryReady
    ]);
    // Adopt only the server shell for this document. Widget data and module
    // execution remain on the existing client facade/rendering path.
    const initialGrid = root.querySelector('#bp-grid[data-bp-initial-layout="true"]');
    const gridEl = initialGrid || document.createElement('div');
    gridEl.id = 'bp-grid';
    preparePublicCanvas(gridEl, layout);
    root.appendChild(gridEl);
    const cols = toNumber(layout.grid?.columns, 12);
    const cellHeight = toNumber(layout.grid?.cellHeight, 8);
    const grid = initCanvasGrid({
        columns: cols,
        cellHeight,
        percentageMode: true,
        staticGrid: true,
        enableZoom: false
    }, gridEl);
    let rows = toNumber(layout.grid?.rows, 0);
    if (!rows) {
        const maxPercent = (layout.items || []).reduce((max, item) => Math.max(max, (item.yPercent ?? 0) + (item.hPercent ?? 0)), 100);
        rows = Math.max(1, Math.round((maxPercent / 100) * cols));
    }
    let renderedCount = 0;
    for (const [itemIndex, item] of (layout.items || []).entries()) {
        const def = registry.find(widget => widget.widgetId === item.widgetId);
        if (!def)
            continue;
        const itemEl = initialGrid?.querySelector(`[data-bp-initial-item="${itemIndex}"]`)
            || document.createElement('div');
        delete itemEl.dataset.bpInitialItem;
        itemEl.className = 'canvas-item';
        itemEl.dataset.instanceId = createInstanceId(item);
        const x = item.xPercent !== undefined ? Math.round((item.xPercent / 100) * cols) : item.x || 0;
        const y = item.yPercent !== undefined ? Math.round((item.yPercent / 100) * rows) : item.y || 0;
        const w = item.wPercent !== undefined ? Math.max(1, Math.round((item.wPercent / 100) * cols)) : item.w || 4;
        const h = item.hPercent !== undefined ? Math.max(1, Math.round((item.hPercent / 100) * rows)) : item.h || 8;
        itemEl.dataset.x = String(x);
        itemEl.dataset.y = String(y);
        itemEl.setAttribute('gs-w', String(w));
        itemEl.setAttribute('gs-h', String(h));
        gridEl.appendChild(itemEl);
        grid.makeWidget(itemEl);
        applyPublicPercentPosition(itemEl, item);
        const container = document.createElement('div');
        container.className = 'widget';
        itemEl.appendChild(container);
        const renderedByModule = await renderWidgetModule(container, item, def, ctx);
        if (!renderedByModule) {
            const code = {
                ...parseWidgetCode(def.content),
                ...(item.html ? { html: item.html } : {}),
                ...(item.css ? { css: item.css } : {}),
                ...(item.js ? { js: item.js } : {})
            };
            if (code?.css) {
                const style = document.createElement('style');
                style.textContent = code.css;
                itemEl.appendChild(style);
            }
            if (code?.html)
                container.innerHTML = sanitizeHtml(code.html);
            if (code?.js) {
                try {
                    executeJs(code.js, itemEl, itemEl, 'Widget');
                }
                catch (error) {
                    console.error(error);
                }
            }
        }
        applyWidgetOptions(itemEl, def.metadata || {});
        applyPublicPercentPosition(itemEl, item);
        renderedCount += 1;
    }
    // Missing widget definitions must not leave an unhydrated server placeholder.
    gridEl.querySelectorAll('[data-bp-initial-item]').forEach(element => element.remove());
    delete gridEl.dataset.bpInitialLayout;
    preparePublicCanvas(gridEl, layout);
    markPublicWidgetsReady(layout, renderedCount);
}
export function registerLoaders(register) {
    register('widgets', loadWidgets);
}
export { loadWidgets };
