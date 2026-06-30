const RUNTIME_MANAGER_MODULE = {
    moduleName: 'runtimeManager',
    moduleType: 'core'
};
function objectParams(value = {}) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function unwrapRuntimeFacadeData(value) {
    if (value &&
        typeof value === 'object' &&
        'resource' in value &&
        'action' in value &&
        'data' in value) {
        return value.data;
    }
    return value;
}
function runtimePublicPayload(jwt, resource, action, params = {}) {
    return {
        jwt,
        ...RUNTIME_MANAGER_MODULE,
        resource,
        action,
        params: objectParams(params)
    };
}
function unwrapData(value) {
    if (Array.isArray(value))
        return value;
    if (value && typeof value === 'object' && 'data' in value) {
        const data = value.data;
        return Array.isArray(data) ? data : [];
    }
    return [];
}
function getErrorMessage(err) {
    return err instanceof Error ? err.message : String(err);
}
function hasAppBridgeScript() {
    return Boolean(document.querySelector('script[src*="/build/appBridge.js"], script[src$="appBridge.js"]'));
}
function isAppBridgeFrameWaitingForInit() {
    if (!hasAppBridgeScript())
        return false;
    return !window.__BLOGPOSTER_APP_INIT_TOKENS__;
}
function isAppBridgeFrameReady() {
    return hasAppBridgeScript() && Boolean(window.__BLOGPOSTER_APP_INIT_TOKENS__);
}
function publishAvailableFonts(fonts, list = []) {
    window.AVAILABLE_FONTS = fonts;
    window.FONT_SOURCES = Object.fromEntries(list
        .filter(font => typeof font?.name === 'string' && typeof font?.url === 'string' && font.url)
        .map(font => [font.name, font.url]));
    window.LOADED_FONT_CSS = window.LOADED_FONT_CSS || {};
    window.loadFontCss = function loadFontCss(name) {
        try {
            if (!name)
                return;
            if (window.LOADED_FONT_CSS?.[name])
                return;
            const href = window.FONT_SOURCES?.[name];
            if (!href)
                return;
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            document.head.appendChild(link);
            if (window.LOADED_FONT_CSS) {
                window.LOADED_FONT_CSS[name] = true;
            }
        }
        catch {
            // best-effort font CSS injection
        }
    };
    document.dispatchEvent(new CustomEvent('fontsUpdated', { detail: { fonts } }));
}
export async function loadFonts() {
    let fonts = [];
    if (typeof window.meltdownEmit !== 'function')
        return;
    if (isAppBridgeFrameReady()) {
        publishAvailableFonts([]);
        return;
    }
    try {
        const jwt = await window.meltdownEmit('issuePublicToken', {
            purpose: 'fonts',
            moduleName: 'auth'
        });
        const rawList = await window.meltdownEmit('cmsPublicRuntimeRequest', runtimePublicPayload(jwt, 'fonts', 'list'));
        const list = unwrapData(unwrapRuntimeFacadeData(rawList));
        fonts = list
            .map(font => font?.name)
            .filter((name) => typeof name === 'string' && Boolean(name));
        publishAvailableFonts(fonts, list);
        const rawProviders = await window.meltdownEmit('cmsPublicRuntimeRequest', runtimePublicPayload(jwt, 'fonts', 'listProviders'));
        const providers = unwrapData(unwrapRuntimeFacadeData(rawProviders));
        providers.find(provider => provider.name === 'googleFonts');
    }
    catch (err) {
        console.error('[fontsLoader] Failed to load fonts', err);
        document.dispatchEvent(new CustomEvent('fontsError', { detail: { error: getErrorMessage(err) } }));
    }
}
function startWhenReady(attempt = 0) {
    if (isAppBridgeFrameWaitingForInit()) {
        if (attempt >= 80)
            return;
        setTimeout(() => startWhenReady(attempt + 1), 50);
        return;
    }
    if (typeof window.meltdownEmit === 'function') {
        void loadFonts();
        return;
    }
    if (attempt >= 40)
        return;
    setTimeout(() => startWhenReady(attempt + 1), 50);
}
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    startWhenReady();
}
else {
    document.addEventListener('DOMContentLoaded', () => startWhenReady());
}
