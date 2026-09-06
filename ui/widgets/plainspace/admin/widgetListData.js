import { emitRuntimeAdmin } from '../../../shared/api-client/runtimeFacade.js';
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('meltdownEmit unavailable');
    }
    return emit;
}
export function toWidgets(value) {
    if (value &&
        typeof value === 'object' &&
        Array.isArray(value.widgets)) {
        return value.widgets.filter((item) => (Boolean(item) &&
            typeof item === 'object' &&
            typeof item.id === 'string'));
    }
    return [];
}
export function toPages(value) {
    const items = value && typeof value === 'object' && Array.isArray(value.pages)
        ? value.pages
        : Array.isArray(value) ? value : [];
    return items.filter((item) => Boolean(item) && typeof item === 'object');
}
export function toLayoutItems(value) {
    if (value &&
        typeof value === 'object' &&
        Array.isArray(value.layout)) {
        return value.layout.filter((item) => (Boolean(item) && typeof item === 'object'));
    }
    return [];
}
export function getWidgetTemplates(storage = window.localStorage) {
    try {
        const arr = JSON.parse(storage?.getItem('widgetTemplates') || '[]');
        return Array.isArray(arr)
            ? arr.filter((item) => (Boolean(item) &&
                typeof item === 'object' &&
                typeof item.widgetId === 'string'))
            : [];
    }
    catch {
        return [];
    }
}
export async function fetchWidgetRegistry(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'plainSpace', 'widgetRegistry', {
        lane: 'public'
    });
    return toWidgets(res);
}
export async function fetchGlobalWidgetIds(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const globalIds = new Set();
    const res = await emitRuntimeAdmin(meltdownEmit, jwt, 'pages', 'byLane', {
        lane: 'public'
    });
    const pages = toPages(res);
    // Scan every page with bounded concurrency. A large site is not an empty site;
    // failures reject the scan so the UI can report unknown usage instead of zero.
    const validPages = pages.filter(page => page.id !== undefined && page.id !== null);
    let nextPage = 0;
    async function scan() {
        while (nextPage < validPages.length) {
            const page = validPages[nextPage++];
            const layoutRes = await emitRuntimeAdmin(meltdownEmit, jwt, 'plainSpace', 'layoutForViewport', {
                pageId: page.id,
                lane: 'public',
                viewport: 'desktop'
            });
            toLayoutItems(layoutRes).forEach(item => {
                if (item.global && item.widgetId)
                    globalIds.add(item.widgetId);
            });
        }
    }
    await Promise.all(Array.from({ length: Math.min(4, validPages.length) }, () => scan()));
    return globalIds;
}
