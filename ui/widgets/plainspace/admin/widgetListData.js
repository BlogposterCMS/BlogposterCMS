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
    const res = await meltdownEmit('widget.registry.request.v1', {
        lane: 'public',
        moduleName: 'plainspace',
        moduleType: 'core',
        jwt
    });
    return toWidgets(res);
}
export async function fetchGlobalWidgetIds(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const globalIds = new Set();
    const res = await meltdownEmit('getPagesByLane', {
        jwt,
        moduleName: 'pagesManager',
        moduleType: 'core',
        lane: 'public'
    });
    const pages = toPages(res);
    if (pages.length > 20) {
        console.warn('[widgetList] Too many pages, skipping global widget lookup');
        return globalIds;
    }
    for (const page of pages) {
        const layoutRes = await meltdownEmit('getLayoutForViewport', {
            jwt,
            moduleName: 'plainspace',
            moduleType: 'core',
            pageId: page.id,
            lane: 'public',
            viewport: 'desktop'
        });
        toLayoutItems(layoutRes).forEach(item => {
            if (item.global && item.widgetId)
                globalIds.add(item.widgetId);
        });
    }
    return globalIds;
}
