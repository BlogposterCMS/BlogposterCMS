import { renderAdminSettingsSurface } from './widgetRuntimeGateway.js';
import { bpDialog } from '../../shared/dialogs/bpDialog.js';
import { ensureGlobalStyle, ensureLayout, resolveRuntimeShellConfig } from './runtimePageShell.js';
import { hydrateRuntimeShellPartials } from './runtimeShellPartials.js';
import { fetchRuntimePageBySlug, fetchRuntimePublicSettings, fetchRuntimeWidgetRegistry, initializeRuntimeDesignDefaults, loadRuntimeGlobalLayout, resolveRuntimeWidgetLane } from './runtimePageData.js';
import { renderPublicRuntimePageContent } from './runtimePageComposition.js';
import { renderAdminRuntimeGrid } from './runtimeAdminGrid.js';
import { bindAdminContentNavigation } from './runtimeAdminNavigation.js';
import { createDebouncedEmitter } from './runtimeWidgetEvents.js';
import { applyRuntimePageTitle, exposeRuntimeWidgetRegistry, resolveRuntimePageContext } from './runtimePageContext.js';
const emitDebounced = createDebouncedEmitter(100);
const GLOBAL_BODY_BACKGROUND_KEY = 'DESIGN_STUDIO_GLOBAL_BODY_BACKGROUND';
let unbindAdminNavigation = null;
function validRuntimeBackground(value) {
    const color = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : '#f2f3f7';
}
async function applyRuntimeGlobalBackground(lane) {
    try {
        const settings = await fetchRuntimePublicSettings(meltdownEmit, lane, [GLOBAL_BODY_BACKGROUND_KEY]);
        document.body.style.backgroundColor = validRuntimeBackground(settings[GLOBAL_BODY_BACKGROUND_KEY]);
    }
    catch (err) {
        console.warn('[Renderer] RUNTIME_GLOBAL_BACKGROUND_LOAD_FAILED', err);
        document.body.style.backgroundColor = '#f2f3f7';
    }
}
function beginContentTransition(contentEl, mode) {
    if (mode !== 'content-only')
        return () => undefined;
    contentEl.classList.remove('is-content-ready');
    contentEl.classList.add('is-content-refreshing');
    return () => {
        contentEl.classList.remove('is-content-refreshing');
        contentEl.classList.add('is-content-ready');
        window.setTimeout(() => {
            contentEl.classList.remove('is-content-ready');
        }, 360);
    };
}
export async function renderRuntimePage(context, mode = 'full') {
    const { slug, lane, debug } = context;
    ensureGlobalStyle(lane);
    await applyRuntimeGlobalBackground(lane);
    if (debug)
        console.debug('[Renderer] boot', { slug, lane, mode });
    const page = await fetchRuntimePageBySlug(meltdownEmit, slug, lane);
    if (debug)
        console.debug('[Renderer] page', page);
    if (!page) {
        await bpDialog.alert('Page not found');
        return;
    }
    const config = resolveRuntimeShellConfig(page, page.meta || {}, context);
    applyRuntimePageTitle(page, lane);
    ensureLayout(config.layout || {}, lane);
    const contentEl = document.getElementById('content');
    if (!contentEl)
        return;
    const finishContentTransition = beginContentTransition(contentEl, mode);
    try {
        if (mode === 'content-only') {
            await hydrateRuntimeShellPartials(config, { mode: 'content-only' });
        }
        else {
            await hydrateRuntimeShellPartials(config);
        }
        const widgetLane = resolveRuntimeWidgetLane(lane, config);
        const allWidgets = await fetchRuntimeWidgetRegistry(meltdownEmit, lane, widgetLane);
        if (debug)
            console.debug('[Renderer] widgets', allWidgets);
        exposeRuntimeWidgetRegistry(allWidgets);
        let globalLayout = [];
        try {
            globalLayout = await loadRuntimeGlobalLayout(meltdownEmit, lane);
        }
        catch (err) {
            console.warn('[Renderer] failed to load global layout', err);
        }
        if (lane !== 'admin') {
            await renderPublicRuntimePageContent({
                page,
                config,
                contentEl,
                globalLayout,
                allWidgets,
                lane,
                emit: meltdownEmit,
                widgetEmit: emitDebounced,
                debug
            });
            return;
        }
        const renderedSettingsSurface = await renderAdminSettingsSurface(contentEl, page);
        if (renderedSettingsSurface) {
            return;
        }
        await renderAdminRuntimeGrid({
            page,
            contentEl,
            globalLayout,
            allWidgets,
            lane,
            emit: meltdownEmit,
            widgetEmit: emitDebounced,
            debug
        });
    }
    finally {
        finishContentTransition();
    }
}
export async function bootPageRenderer() {
    try {
        const context = resolveRuntimePageContext();
        if (typeof window.meltdownEmit === 'function') {
            await initializeRuntimeDesignDefaults(window.meltdownEmit, context.lane);
        }
        await renderRuntimePage(context);
        if (context.lane === 'admin' && !unbindAdminNavigation) {
            unbindAdminNavigation = bindAdminContentNavigation({
                render: async (request) => {
                    await renderRuntimePage(resolveRuntimePageContext(request), 'content-only');
                }
            });
        }
    }
    catch (err) {
        console.error('[Renderer] Fatal error:', err);
        await bpDialog.alert('Renderer error: ' + (err instanceof Error ? err.message : String(err)));
    }
}
