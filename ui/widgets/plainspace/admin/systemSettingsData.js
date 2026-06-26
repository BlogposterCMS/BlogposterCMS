function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('meltdownEmit unavailable');
    }
    return emit;
}
function toArray(value) {
    if (Array.isArray(value))
        return value;
    if (value && typeof value === 'object' && Array.isArray(value.data)) {
        return value.data;
    }
    return [];
}
export function toPages(value) {
    return toArray(value).filter((item) => Boolean(item) && typeof item === 'object');
}
export function asSetting(value) {
    return value == null ? '' : String(value);
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export async function fetchSystemSettings(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const [title, desc, isMaint, pageId, faviconUrl, pagesRes, googleFontsKey] = await Promise.all([
        meltdownEmit('getSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'SITE_TITLE' }),
        meltdownEmit('getSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'SITE_DESC' }),
        meltdownEmit('getSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'MAINTENANCE_MODE' }),
        meltdownEmit('getSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'MAINTENANCE_PAGE_ID' }),
        meltdownEmit('getSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'FAVICON_URL' }),
        meltdownEmit('getAllPages', { jwt, moduleName: 'pagesManager', moduleType: 'core' }),
        meltdownEmit('getSetting', { jwt, moduleName: 'settingsManager', moduleType: 'core', key: 'GOOGLE_FONTS_API_KEY' })
    ]);
    const pages = toPages(pagesRes);
    const maintenancePageId = asSetting(pageId);
    return {
        siteTitle: asSetting(title),
        siteDescription: asSetting(desc),
        maintenanceMode: asSetting(isMaint) === 'true',
        maintenancePageId,
        maintenancePage: pages.find(page => String(page.id) === maintenancePageId),
        faviconUrl: asSetting(faviconUrl),
        pages,
        googleFontsApiKey: asSetting(googleFontsKey).trim()
    };
}
export async function setSystemSetting(emit, jwt, key, value) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('setSetting', {
        jwt,
        moduleName: 'settingsManager',
        moduleType: 'core',
        key,
        value
    });
}
export async function pickFaviconUrl(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const result = await meltdownEmit('openMediaExplorer', { jwt });
    const shareURL = result && typeof result === 'object' ? result.shareURL : '';
    const cancelled = result && typeof result === 'object' ? Boolean(result.cancelled) : false;
    return !cancelled && shareURL ? shareURL : null;
}
