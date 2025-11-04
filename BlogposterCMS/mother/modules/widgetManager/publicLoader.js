// @ts-nocheck
import { init as initCanvasGrid } from '/plainspace/main/canvasGrid.js';
import { applyWidgetOptions } from '/plainspace/main/widgetOptions.js';
import { executeJs } from '/plainspace/main/script-utils.js';
async function loadWidgets(descriptor = {}, ctx = {}) {
    const layout = window.__BP_ACTIVE_LAYOUT__ || { grid: { columns: 12, cellHeight: 8 }, items: [] };
    const root = document.getElementById('app') || document.body;
    const registry = await ctx.meltdownEmit('getWidgets', {
        jwt: ctx.publicToken,
        moduleName: 'widgetManager',
        moduleType: 'core',
        widgetType: 'public'
    }).catch(() => []);
    const gridEl = document.createElement('div');
    gridEl.id = 'bp-grid';
    root.appendChild(gridEl);
    const cols = layout.grid?.columns || 12;
    const cellHeight = layout.grid?.cellHeight || 8;
    const grid = initCanvasGrid(gridEl, { columns: cols, cellHeight });
    let rows = layout.grid?.rows;
    if (!rows) {
        const maxPercent = (layout.items || []).reduce((m, it) => Math.max(m, (it.yPercent ?? 0) + (it.hPercent ?? 0)), 100);
        rows = Math.max(1, Math.round((maxPercent / 100) * cols));
    }
    for (const it of layout.items || []) {
        const def = registry.find(w => w.widgetId === it.widgetId);
        if (!def)
            continue;
        let code = {};
        try {
            code = typeof def.content === 'string' ? JSON.parse(def.content) : (def.content || {});
        }
        catch (_) { }
        const itemEl = document.createElement('div');
        itemEl.className = 'canvas-item';
        itemEl.dataset.instanceId = it.instanceId || crypto.randomUUID?.() || String(Math.random());
        const x = it.xPercent !== undefined ? Math.round((it.xPercent / 100) * cols) : it.x || 0;
        const y = it.yPercent !== undefined ? Math.round((it.yPercent / 100) * rows) : it.y || 0;
        const w = it.wPercent !== undefined ? Math.max(1, Math.round((it.wPercent / 100) * cols)) : it.w || 4;
        const h = it.hPercent !== undefined ? Math.max(1, Math.round((it.hPercent / 100) * rows)) : it.h || 8;
        grid.addWidget(itemEl, { x, y, w, h });
        const container = document.createElement('div');
        container.className = 'widget';
        itemEl.appendChild(container);
        if (code?.css) {
            const style = document.createElement('style');
            style.textContent = code.css;
            itemEl.appendChild(style);
        }
        if (code?.html)
            container.innerHTML = code.html;
        if (code?.js) {
            try {
                executeJs(code.js, itemEl, itemEl, 'Widget');
            }
            catch (e) {
                console.error(e);
            }
        }
        applyWidgetOptions(itemEl, def?.metadata || {});
    }
}
export function registerLoaders(register) {
    register('widgets', loadWidgets);
}
export { loadWidgets };
