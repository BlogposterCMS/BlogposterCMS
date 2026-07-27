import { fetchRuntimeWidgetRegistry } from '/ui/runtime/main/runtimePageData.js';
import { renderPublicRuntimePageContent } from '/ui/runtime/main/runtimePageComposition.js';
import { ensureGlobalStyle, ensureLayout } from '/ui/runtime/main/runtimePageShell.js';
import { applyColorLibraryVariables, normalizeColorLibrarySnapshot } from '/ui/shared/colors/colorLibrary.js';
import { applyActiveFontPackage, normalizeFontPackagesSnapshot } from '/ui/shared/fonts/fontPackages.js';
import { DESIGNER_LIVE_PREVIEW_FAILED, DESIGNER_LIVE_PREVIEW_READY, DESIGNER_LIVE_PREVIEW_RENDER, DESIGNER_LIVE_PREVIEW_RENDERED, DESIGNER_LIVE_PREVIEW_RUNTIME_REQUEST, DESIGNER_LIVE_PREVIEW_RUNTIME_RESPONSE } from './livePreviewMessages.js';
const RUNTIME_REQUEST_TIMEOUT_MS = 12000;
const DESIGNER_LIVE_PREVIEW_QUERY = 'designer-live-preview';
let nextRuntimeRequestId = 1;
let livePreviewRuntimeBooted = false;
const pendingRuntimeRequests = new Map();
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function parentPost(message) {
    window.parent?.postMessage(message, '*');
}
function previewRuntimeEmit(eventName, payload = {}, timeoutMs = RUNTIME_REQUEST_TIMEOUT_MS) {
    const requestId = `runtime-${nextRuntimeRequestId++}`;
    parentPost({
        type: DESIGNER_LIVE_PREVIEW_RUNTIME_REQUEST,
        requestId,
        eventName,
        payload,
        timeoutMs
    });
    return new Promise((resolve, reject) => {
        const timer = window.setTimeout(() => {
            pendingRuntimeRequests.delete(requestId);
            reject(new Error('DESIGNER_LIVE_PREVIEW_RUNTIME_TIMEOUT: runtime request timed out'));
        }, timeoutMs);
        pendingRuntimeRequests.set(requestId, { resolve, reject, timer });
    });
}
function handleRuntimeResponse(message) {
    if (message.type !== DESIGNER_LIVE_PREVIEW_RUNTIME_RESPONSE)
        return false;
    const requestId = String(message.requestId || '');
    const pending = pendingRuntimeRequests.get(requestId);
    if (!pending)
        return true;
    pendingRuntimeRequests.delete(requestId);
    window.clearTimeout(pending.timer);
    if (message.ok) {
        pending.resolve(message.data);
    }
    else {
        pending.reject(new Error(String(message.error || 'DESIGNER_LIVE_PREVIEW_RUNTIME_FAILED')));
    }
    return true;
}
function renderPreviewError(contentEl, message) {
    const error = document.createElement('div');
    error.className = 'designer-live-preview-runtime-error';
    error.setAttribute('role', 'alert');
    error.textContent = message;
    contentEl.replaceChildren(error);
}
function renderEmptyPreview(contentEl) {
    const empty = document.createElement('div');
    empty.className = 'designer-live-preview-runtime-empty';
    empty.textContent = 'No public preview content.';
    contentEl.replaceChildren(empty);
}
async function resolveWidgetRegistry(payload) {
    if (Array.isArray(payload.widgets) && payload.widgets.length) {
        return payload.widgets;
    }
    return fetchRuntimeWidgetRegistry(previewRuntimeEmit, 'public', 'public');
}
function previewDesignId(payload) {
    const id = String(payload.design?.id || '').trim();
    return id || '__designer_live_preview__';
}
function previewPageFromPayload(payload) {
    return {
        id: window.PAGE_ID || previewDesignId(payload),
        slug: window.PAGE_SLUG || '',
        title: payload.title || 'Design Preview',
        lane: 'public',
        meta: {
            designId: previewDesignId(payload),
            inheritParentDesign: false,
            inheritPresentation: false
        }
    };
}
function previewDesignResponseFromPayload(payload) {
    return {
        design: {
            ...payload.design,
            title: payload.title,
            layout: payload.document.layoutTree,
            scenes: payload.document.scenes
        },
        layoutTree: payload.document.layoutTree,
        placements: payload.document.placements,
        widgets: payload.document.placements,
        scenes: payload.document.scenes,
        styles: payload.document.styles,
        metadata: payload.document.metadata
    };
}
function previewRuntimeDataEmit(payload) {
    return async function emit(eventName, requestPayload = {}) {
        if (eventName !== 'cmsPublicRuntimeRequest') {
            return previewRuntimeEmit(eventName, requestPayload);
        }
        const resource = String(requestPayload.resource || '');
        const action = String(requestPayload.action || '');
        if (resource === 'designer' && action === 'get') {
            return previewDesignResponseFromPayload(payload);
        }
        if (resource === 'pages' && action === 'children') {
            return [];
        }
        if (resource === 'plainSpace' && action === 'widgetInstance') {
            const instanceId = String(requestPayload.params?.instanceId || '');
            if (!/^default\.[A-Za-z0-9_.:-]{1,160}$/.test(instanceId)) {
                throw new Error('DESIGNER_LIVE_PREVIEW_WIDGET_INSTANCE_ID_INVALID: only default widget instances are readable');
            }
            // The sandbox asks through the public Runtime contract, while its trusted
            // Designer parent already owns an authenticated AppLoader admin bridge.
            // Translate only this public-safe default read instead of granting the
            // app a direct PlainSpace or public-token bridge exception.
            return previewRuntimeEmit('cmsAdminApiRequest', {
                moduleName: 'runtimeManager',
                moduleType: 'core',
                resource: 'plainSpace',
                action: 'widgetInstance',
                params: { instanceId }
            });
        }
        return previewRuntimeEmit(eventName, requestPayload);
    };
}
function applyPreviewBrandStyles(payload) {
    const styles = isRecord(payload.document.styles) ? payload.document.styles : {};
    const fontCatalog = isRecord(styles.fontCatalog) ? styles.fontCatalog : {};
    const sources = isRecord(fontCatalog.sources)
        ? Object.fromEntries(Object.entries(fontCatalog.sources).filter(([name, url]) => (Boolean(name.trim()) && typeof url === 'string' && Boolean(url.trim()))))
        : {};
    const available = Array.isArray(fontCatalog.available)
        ? fontCatalog.available.filter((font) => typeof font === 'string' && Boolean(font.trim()))
        : Object.keys(sources);
    window.FONT_SOURCES = sources;
    window.AVAILABLE_FONTS = available;
    document.documentElement.dataset.bpFontPackagesLane = 'public';
    applyColorLibraryVariables(normalizeColorLibrarySnapshot(styles.colorLibrary));
    applyActiveFontPackage(normalizeFontPackagesSnapshot(styles.fontPackages));
}
export async function renderLivePreviewPayload(payload) {
    ensureGlobalStyle('public');
    ensureLayout({}, 'public');
    applyPreviewBrandStyles(payload);
    const contentEl = document.getElementById('content');
    if (!contentEl) {
        throw new Error('DESIGNER_LIVE_PREVIEW_CONTENT_MISSING: #content was not created');
    }
    contentEl.replaceChildren();
    const widgets = await resolveWidgetRegistry(payload);
    const previewEmit = previewRuntimeDataEmit(payload);
    await renderPublicRuntimePageContent({
        page: previewPageFromPayload(payload),
        config: { designId: previewDesignId(payload) },
        contentEl,
        globalLayout: Array.isArray(payload.globalLayout) ? payload.globalLayout : [],
        allWidgets: widgets,
        lane: 'public',
        emit: previewEmit,
        widgetEmit: previewEmit
    });
    if (!contentEl.childElementCount) {
        renderEmptyPreview(contentEl);
    }
}
export function bootLivePreviewRuntime() {
    if (livePreviewRuntimeBooted)
        return;
    livePreviewRuntimeBooted = true;
    window.addEventListener('message', event => {
        const message = isRecord(event.data) ? event.data : {};
        if (handleRuntimeResponse(message))
            return;
        if (message.type !== DESIGNER_LIVE_PREVIEW_RENDER || !isRecord(message.payload))
            return;
        const requestId = String(message.requestId || '');
        renderLivePreviewPayload(message.payload)
            .then(() => {
            document.body.dataset.livePreviewStatus = 'ready';
            parentPost({ type: DESIGNER_LIVE_PREVIEW_RENDERED, requestId });
        })
            .catch(err => {
            const contentEl = document.getElementById('content');
            const error = err instanceof Error ? err.message : String(err);
            console.error('[Designer Live Preview] DESIGNER_LIVE_PREVIEW_RENDER_FAILED', err);
            if (contentEl)
                renderPreviewError(contentEl, error);
            document.body.dataset.livePreviewStatus = 'error';
            parentPost({ type: DESIGNER_LIVE_PREVIEW_FAILED, requestId, error });
        });
    });
    parentPost({ type: DESIGNER_LIVE_PREVIEW_READY });
}
function shouldAutoBootLivePreviewRuntime() {
    try {
        return new URLSearchParams(window.location.search).has(DESIGNER_LIVE_PREVIEW_QUERY);
    }
    catch {
        return false;
    }
}
if (shouldAutoBootLivePreviewRuntime()) {
    bootLivePreviewRuntime();
}
