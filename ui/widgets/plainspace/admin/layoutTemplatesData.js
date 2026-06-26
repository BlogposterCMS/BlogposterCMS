function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('meltdownEmit unavailable');
    }
    return emit;
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export function toTemplateNames(value) {
    if (value &&
        typeof value === 'object' &&
        Array.isArray(value.templates)) {
        return value.templates
            .map(item => typeof item === 'string' ? { name: item } : item)
            .filter((item) => (Boolean(item) &&
            typeof item === 'object' &&
            typeof item.name === 'string'));
    }
    return [];
}
export function toPages(value) {
    const items = Array.isArray(value)
        ? value
        : value && typeof value === 'object' && Array.isArray(value.pages)
            ? value.pages
            : [];
    return items.filter((item) => Boolean(item) && typeof item === 'object');
}
export function buildTemplateViews(templateNames, pages) {
    const usedMap = {};
    pages.forEach(page => {
        const name = page.meta?.layoutTemplate;
        if (name) {
            usedMap[name] ??= [];
            usedMap[name].push(page.title || 'Unnamed');
        }
    });
    return templateNames.map(template => ({
        name: template.name,
        previewPath: template.previewPath || '',
        usedPages: usedMap[template.name] || []
    }));
}
export async function fetchLayoutTemplateNames(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await meltdownEmit('getLayoutTemplateNames', {
        jwt,
        moduleName: 'plainspace',
        moduleType: 'core',
        lane: 'public'
    });
    return toTemplateNames(res);
}
export async function fetchPublicPages(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await meltdownEmit('getPagesByLane', {
        jwt,
        moduleName: 'pagesManager',
        moduleType: 'core',
        lane: 'public'
    });
    return toPages(res);
}
export async function createBlankLayoutTemplate(emit, jwt, name, previewPath) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('saveLayoutTemplate', {
        jwt,
        moduleName: 'plainspace',
        moduleType: 'core',
        name: name.trim(),
        lane: 'public',
        viewport: 'desktop',
        layout: [],
        previewPath
    });
}
