import { emitRuntimeAdmin, emitRuntimePublic } from '../api-client/runtimeFacade.js';
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
function isDesignerLivePreview() {
    try {
        return new URLSearchParams(window.location.search).has('designer-live-preview');
    }
    catch {
        return false;
    }
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
    if (isDesignerLivePreview()) {
        // The signed preview payload supplies the parent frame's validated font
        // catalog. Install the existing CSS loader without making a request from
        // the sandbox's opaque origin.
        publishAvailableFonts([], []);
        return;
    }
    try {
        const emitter = window.meltdownEmit;
        const appBridgeReady = isAppBridgeFrameReady();
        let list;
        let providers;
        if (appBridgeReady) {
            // Sandboxed apps already have a validated admin bridge. Reuse its read-only
            // font catalog contract instead of minting a public token inside the frame.
            list = unwrapData(await emitRuntimeAdmin(emitter, window.ADMIN_TOKEN, 'fonts', 'list'));
            providers = unwrapData(await emitRuntimeAdmin(emitter, window.ADMIN_TOKEN, 'fonts', 'listProviders'));
        }
        else {
            const jwt = await emitter('issuePublicToken', {
                purpose: 'fonts',
                moduleName: 'auth'
            });
            list = unwrapData(await emitRuntimePublic(emitter, jwt, 'fonts', 'list'));
            providers = unwrapData(await emitRuntimePublic(emitter, jwt, 'fonts', 'listProviders'));
        }
        fonts = list
            .map(font => font?.name)
            .filter((name) => typeof name === 'string' && Boolean(name));
        publishAvailableFonts(fonts, list);
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
