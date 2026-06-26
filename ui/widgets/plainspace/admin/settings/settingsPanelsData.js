const SETTINGS_MODULE = {
    moduleName: 'settingsManager',
    moduleType: 'core'
};
const PAGES_MODULE = {
    moduleName: 'pagesManager',
    moduleType: 'core'
};
function requireEmitter(emit) {
    if (typeof emit !== 'function') {
        throw new Error('PLAINSPACE_SETTINGS_PANELS_EMITTER_UNAVAILABLE: meltdownEmit unavailable');
    }
    return emit;
}
export function asSetting(value) {
    return value == null ? '' : String(value);
}
export function boolToString(value) {
    return value ? 'true' : 'false';
}
export function stringToBool(value) {
    return String(value).toLowerCase() === 'true';
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export function toPages(value) {
    const items = Array.isArray(value)
        ? value
        : value && typeof value === 'object' && Array.isArray(value.data)
            ? value.data
            : [];
    return items.filter((item) => Boolean(item) && typeof item === 'object');
}
export function publicPages(value) {
    return toPages(value).filter(page => page.lane === 'public');
}
export async function fetchSettingValue(emit, jwt, key) {
    const meltdownEmit = requireEmitter(emit);
    const value = await meltdownEmit('getSetting', {
        jwt,
        ...SETTINGS_MODULE,
        key
    });
    return asSetting(value);
}
export async function saveSettingValue(emit, jwt, key, value) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('setSetting', {
        jwt,
        ...SETTINGS_MODULE,
        key,
        value
    });
}
export async function fetchSettingValues(emit, jwt, keys) {
    const entries = await Promise.all(keys.map(async (key) => [
        key,
        await fetchSettingValue(emit, jwt, key)
    ]));
    return Object.fromEntries(entries);
}
export async function saveSettingValues(emit, jwt, values) {
    await Promise.all(Object.entries(values).map(([key, value]) => (saveSettingValue(emit, jwt, key, value ?? ''))));
}
export async function fetchGeneralSettings(emit, jwt) {
    const values = await fetchSettingValues(emit, jwt, ['SITE_TITLE', 'SITE_DESC']);
    return {
        siteTitle: values.SITE_TITLE,
        siteDescription: values.SITE_DESC
    };
}
export async function saveGeneralSettings(emit, jwt, values) {
    await saveSettingValues(emit, jwt, {
        SITE_TITLE: values.siteTitle,
        SITE_DESC: values.siteDescription
    });
}
export async function fetchDesignSettings(emit, jwt) {
    const values = await fetchSettingValues(emit, jwt, ['FAVICON_URL', 'GOOGLE_FONTS_API_KEY']);
    return {
        faviconUrl: values.FAVICON_URL,
        googleFontsApiKey: values.GOOGLE_FONTS_API_KEY
    };
}
export async function saveFaviconUrl(emit, jwt, value) {
    await saveSettingValue(emit, jwt, 'FAVICON_URL', value);
}
export async function saveGoogleFontsApiKey(emit, jwt, value) {
    await saveSettingValue(emit, jwt, 'GOOGLE_FONTS_API_KEY', value);
}
export async function pickMediaShareUrl(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const picked = await meltdownEmit('openMediaExplorer', { jwt });
    if (picked &&
        typeof picked === 'object' &&
        !picked.cancelled &&
        typeof picked.shareURL === 'string') {
        return picked.shareURL;
    }
    return null;
}
export async function fetchSeoSettings(emit, jwt) {
    const values = await fetchSettingValues(emit, jwt, [
        'SEO_META_DESCRIPTION',
        'SEO_TITLE_TEMPLATE',
        'SEO_INDEXING_ENABLED'
    ]);
    return {
        metaDescription: values.SEO_META_DESCRIPTION,
        titleTemplate: values.SEO_TITLE_TEMPLATE,
        indexingEnabled: values.SEO_INDEXING_ENABLED === '' ? true : stringToBool(values.SEO_INDEXING_ENABLED)
    };
}
export async function saveSeoSettings(emit, jwt, values) {
    await saveSettingValues(emit, jwt, {
        SEO_TITLE_TEMPLATE: values.titleTemplate,
        SEO_META_DESCRIPTION: values.metaDescription,
        SEO_INDEXING_ENABLED: boolToString(values.indexingEnabled)
    });
}
export async function fetchAllPages(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await meltdownEmit('getAllPages', {
        jwt,
        ...PAGES_MODULE
    });
    return toPages(res);
}
export async function fetchSecuritySettings(emit, jwt) {
    const [pages, values] = await Promise.all([
        fetchAllPages(emit, jwt),
        fetchSettingValues(emit, jwt, [
            'ALLOW_REGISTRATION',
            'FIRST_INSTALL_DONE',
            'MAINTENANCE_MODE',
            'MAINTENANCE_PAGE_ID'
        ])
    ]);
    return {
        allowRegistration: stringToBool(values.ALLOW_REGISTRATION),
        firstInstallDone: stringToBool(values.FIRST_INSTALL_DONE),
        maintenanceMode: stringToBool(values.MAINTENANCE_MODE),
        maintenancePageId: values.MAINTENANCE_PAGE_ID,
        publicPages: publicPages(pages)
    };
}
export async function saveAllowRegistration(emit, jwt, value) {
    await saveSettingValue(emit, jwt, 'ALLOW_REGISTRATION', boolToString(value));
}
export async function saveMaintenanceSettings(emit, jwt, maintenanceMode, maintenancePageId) {
    await saveSettingValues(emit, jwt, {
        MAINTENANCE_MODE: boolToString(maintenanceMode),
        MAINTENANCE_PAGE_ID: maintenancePageId
    });
}
