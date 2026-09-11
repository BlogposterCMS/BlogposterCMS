import { orchestrate } from './envelope/orchestrator.js';
import { importDesignerLivePreviewRuntime, loadPublicRuntimeLoaders } from './publicLoaderImporter.js';
import { emitRuntimePublic } from '../shared/api-client/runtimeFacade.js';
import { configureColorLibraryClient, refreshColorLibrary } from '../shared/colors/colorLibrary.js';
import { configureFontPackagesClient, refreshFontPackages } from '../shared/fonts/fontPackages.js';
import { readPublicBootstrap } from './publicBootstrap.js';
const DESIGNER_LIVE_PREVIEW_QUERY = 'designer-live-preview';
function hasDesignerLivePreviewQuery() {
    try {
        return new URLSearchParams(window.location.search).has(DESIGNER_LIVE_PREVIEW_QUERY);
    }
    catch {
        return false;
    }
}
function markDesignerLivePreviewDocument() {
    document.documentElement.dataset.designerLivePreview = 'true';
    if (document.body) {
        document.body.dataset.designerLivePreview = 'true';
    }
}
function getMeltdownEmit() {
    const emit = window.meltdownEmit;
    if (typeof emit !== 'function') {
        throw new Error('window.meltdownEmit is required before public runtime boot.');
    }
    return emit;
}
async function ensureToken() {
    const emit = getMeltdownEmit();
    if (!window.PUBLIC_TOKEN) {
        window.PUBLIC_TOKEN = await emit('ensurePublicToken', {
            moduleName: 'auth',
            moduleType: 'core'
        }).catch(() => null);
    }
}
export async function bootPublicRuntime() {
    const livePreview = hasDesignerLivePreviewQuery();
    if (livePreview) {
        // Keep the requested preview width equal to the authored viewport width.
        // A hidden scrollbar still allows scrolling but no longer steals pixels
        // from responsive layout calculations inside the sandboxed iframe.
        markDesignerLivePreviewDocument();
        // The sandboxed preview has an opaque origin, so its data channel is the
        // parent Designer bridge. Boot that adapter before any direct public API
        // request; the current Color Scheme and Font Package arrive in the render
        // payload and do not need a second state owner.
        await importDesignerLivePreviewRuntime();
        return;
    }
    await ensureToken();
    const emit = getMeltdownEmit();
    configureColorLibraryClient({
        emit,
        token: window.PUBLIC_TOKEN,
        lane: 'public'
    });
    configureFontPackagesClient({
        emit,
        token: window.PUBLIC_TOKEN,
        lane: 'public'
    });
    // Start independent presentation reads alongside page discovery. Await them
    // before rendering so linked colors and typography retain their first paint.
    const presentationReady = Promise.all([refreshColorLibrary().catch(error => {
            console.warn('COLOR_LIBRARY_PUBLIC_LOAD_FAILED: Linked colors will use serialized fallbacks.', error);
        }), refreshFontPackages().catch(error => {
            console.warn('FONT_PACKAGES_PUBLIC_LOAD_FAILED: Content will use browser typography.', error);
        })]);
    const bootstrap = readPublicBootstrap();
    let slug = bootstrap?.slug || location.pathname.replace(/^\/+/, '') || '';
    if (!slug) {
        const start = await emitRuntimePublic(emit, window.PUBLIC_TOKEN, 'pages', 'start', {
            language: window.LANG || 'en'
        }).catch(() => null);
        slug = typeof start?.slug === 'string' ? start.slug : '';
    }
    if (!slug) {
        console.error('No start page configured');
        return;
    }
    const envelope = bootstrap?.envelope || await emitRuntimePublic(emit, window.PUBLIC_TOKEN, 'pages', 'envelope', {
        slug,
        language: window.LANG || 'en'
    });
    if (envelope?.meta?.seoTitle) {
        document.title = envelope.meta.seoTitle;
    }
    await Promise.all([loadPublicRuntimeLoaders(envelope), presentationReady]);
    const ctx = {
        meltdownEmit: emit,
        publicToken: window.PUBLIC_TOKEN,
        env: 'csr',
        initialLayoutResolved: bootstrap?.layoutResolved === true,
        initialLayout: bootstrap?.layout,
        initialDesignSnapshots: bootstrap?.designSnapshots,
        initialHtml: bootstrap?.htmlRendered ? document.getElementById('bp-initial-html') : null
    };
    await orchestrate(envelope, ctx);
}
