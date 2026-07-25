const STORAGE_KEY = 'blogposter.designer.viewport.v1';
const BRIDGE_PREFERENCE_KEY = 'viewport';
const BRIDGE_PREFERENCE_GET = 'appPreference.get';
const BRIDGE_PREFERENCE_SET = 'appPreference.set';
const BRIDGE_PERSIST_DELAY_MS = 120;
export const BUILDER_VIEWPORT_MIN = 320;
export const BUILDER_VIEWPORT_MAX = 3840;
export const BUILDER_ZOOM_MIN = 10;
export const BUILDER_ZOOM_MAX = 500;
export const BUILDER_VIEWPORT_PRESETS = Object.freeze([
    { id: 'desktop', label: 'Desktop', width: 1280 },
    { id: 'tablet', label: 'Tablet', width: 820 },
    { id: 'mobile', label: 'Mobile', width: 390 }
]);
const listeners = new Set();
let state = readStoredState();
let bridgePersistTimer = null;
function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}
function clamp(value, min, max, fallback) {
    return Math.max(min, Math.min(max, Math.round(finiteNumber(value, fallback))));
}
function presetForWidth(width) {
    return BUILDER_VIEWPORT_PRESETS.find(preset => preset.width === width)?.id || 'custom';
}
export function builderBreakpointForWidth(width) {
    const value = clamp(width, BUILDER_VIEWPORT_MIN, BUILDER_VIEWPORT_MAX, 1280);
    if (value <= 600)
        return 'mobile';
    if (value <= 1024)
        return 'tablet';
    return 'desktop';
}
function normalizeState(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {};
    const width = clamp(source.width, BUILDER_VIEWPORT_MIN, BUILDER_VIEWPORT_MAX, 1280);
    return {
        width,
        presetId: presetForWidth(width),
        zoom: clamp(source.zoom, BUILDER_ZOOM_MIN, BUILDER_ZOOM_MAX, 100),
        zoomMode: source.zoomMode === 'manual' ? 'manual' : 'fit'
    };
}
function readStoredState() {
    if (typeof window === 'undefined')
        return normalizeState({});
    try {
        return normalizeState(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}'));
    }
    catch {
        return normalizeState({});
    }
}
function hasAppBridge() {
    if (typeof window === 'undefined')
        return false;
    const bridgeWindow = window;
    return bridgeWindow.__BLOGPOSTER_APP_INIT_TOKENS__?.appBridge === true
        && typeof window.meltdownEmit === 'function';
}
function persistToLocalStorage() {
    if (typeof window === 'undefined')
        return false;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
    }
    catch {
        // The admin app iframe intentionally has an opaque origin. Its state is
        // persisted by the parent through the existing AppBridge below.
        return false;
    }
}
function persistToParentBridge() {
    if (!hasAppBridge())
        return;
    if (bridgePersistTimer !== null)
        window.clearTimeout(bridgePersistTimer);
    bridgePersistTimer = window.setTimeout(() => {
        bridgePersistTimer = null;
        void window.meltdownEmit?.(BRIDGE_PREFERENCE_SET, {
            key: BRIDGE_PREFERENCE_KEY,
            value: getBuilderViewportState()
        }).catch(error => {
            console.warn('DESIGNER_VIEWPORT_PREFERENCE_WRITE_FAILED', error);
        });
    }, BRIDGE_PERSIST_DELAY_MS);
}
function persistState() {
    if (!persistToLocalStorage())
        persistToParentBridge();
}
function publish(next, options = {}) {
    state = normalizeState(next);
    if (options.persist !== false)
        persistState();
    const snapshot = getBuilderViewportState();
    listeners.forEach(listener => listener(snapshot));
    if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('bp:designer-viewport-changed', { detail: snapshot }));
    }
    return snapshot;
}
export function getBuilderViewportState() {
    return { ...state };
}
export function subscribeBuilderViewport(listener, options = {}) {
    listeners.add(listener);
    if (options.immediate !== false)
        listener(getBuilderViewportState());
    return () => listeners.delete(listener);
}
export function setBuilderViewportWidth(width) {
    return publish({
        ...state,
        width: clamp(width, BUILDER_VIEWPORT_MIN, BUILDER_VIEWPORT_MAX, state.width)
    });
}
export function setBuilderViewportPreset(id) {
    const preset = BUILDER_VIEWPORT_PRESETS.find(candidate => candidate.id === String(id || '').trim());
    if (!preset)
        return getBuilderViewportState();
    return publish({ ...state, width: preset.width, presetId: preset.id });
}
export function setBuilderZoom(zoom) {
    return publish({
        ...state,
        zoom: clamp(zoom, BUILDER_ZOOM_MIN, BUILDER_ZOOM_MAX, state.zoom),
        zoomMode: 'manual'
    });
}
export function setBuilderFitZoom(zoom) {
    return publish({
        ...state,
        zoom: clamp(zoom, BUILDER_ZOOM_MIN, BUILDER_ZOOM_MAX, state.zoom),
        zoomMode: 'fit'
    });
}
export function setBuilderZoomMode(mode) {
    return publish({
        ...state,
        zoomMode: mode === 'manual' ? 'manual' : 'fit'
    });
}
export async function hydrateBuilderViewportState() {
    if (!hasAppBridge())
        return getBuilderViewportState();
    try {
        const result = await window.meltdownEmit?.(BRIDGE_PREFERENCE_GET, {
            key: BRIDGE_PREFERENCE_KEY
        });
        if (result?.found) {
            return publish(normalizeState(result.value), { persist: false });
        }
    }
    catch (error) {
        console.warn('DESIGNER_VIEWPORT_PREFERENCE_READ_FAILED', error);
    }
    return getBuilderViewportState();
}
// Focused tests use this reset so singleton state never leaks between cases.
export function resetBuilderViewportStateForTests(value = {}) {
    if (bridgePersistTimer !== null && typeof window !== 'undefined') {
        window.clearTimeout(bridgePersistTimer);
        bridgePersistTimer = null;
    }
    state = normalizeState(value);
    return getBuilderViewportState();
}
