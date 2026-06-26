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
export function toProviders(value) {
    return toArray(value).filter((item) => (Boolean(item) &&
        typeof item === 'object' &&
        typeof item.name === 'string'));
}
export function errorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
export async function fetchFontProviders(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    const res = await meltdownEmit('listFontProviders', {
        jwt,
        moduleName: 'fontsManager',
        moduleType: 'core'
    });
    return toProviders(res);
}
export async function fetchGoogleFontsKey(emit, jwt) {
    const meltdownEmit = requireEmitter(emit);
    try {
        const keyRes = await meltdownEmit('getSetting', {
            jwt,
            moduleName: 'settingsManager',
            moduleType: 'core',
            key: 'GOOGLE_FONTS_API_KEY'
        });
        return String(keyRes || '').trim();
    }
    catch {
        return '';
    }
}
export async function fetchFontProvidersState(emit, jwt) {
    const [providers, googleFontsKey] = await Promise.all([
        fetchFontProviders(emit, jwt),
        fetchGoogleFontsKey(emit, jwt)
    ]);
    return { providers, googleFontsKey };
}
export async function setFontProviderEnabled(emit, jwt, providerName, enabled) {
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('setFontProviderEnabled', {
        jwt,
        moduleName: 'fontsManager',
        moduleType: 'core',
        providerName,
        enabled
    });
}
export async function saveGoogleFontsKey(emit, jwt, value) {
    const nextKey = value.trim();
    const meltdownEmit = requireEmitter(emit);
    await meltdownEmit('setSetting', {
        jwt,
        moduleName: 'settingsManager',
        moduleType: 'core',
        key: 'GOOGLE_FONTS_API_KEY',
        value: nextKey
    });
    return nextKey;
}
export async function refreshFontProviderCatalog(emit, jwt, providerName, wasEnabled) {
    if (wasEnabled) {
        await setFontProviderEnabled(emit, jwt, providerName, false);
    }
    await setFontProviderEnabled(emit, jwt, providerName, true);
}
