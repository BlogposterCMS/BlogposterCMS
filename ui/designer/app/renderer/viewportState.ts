export type BuilderViewportPresetId = 'desktop' | 'tablet' | 'mobile' | 'custom';

export interface BuilderViewportState {
  width: number;
  presetId: BuilderViewportPresetId;
  zoom: number;
  zoomMode: 'fit' | 'manual';
}

export interface BuilderViewportPreset {
  id: Exclude<BuilderViewportPresetId, 'custom'>;
  label: string;
  width: number;
}

const STORAGE_KEY = 'blogposter.designer.viewport.v1';
const BRIDGE_PREFERENCE_KEY = 'viewport';
const BRIDGE_PREFERENCE_GET = 'appPreference.get';
const BRIDGE_PREFERENCE_SET = 'appPreference.set';
const BRIDGE_PERSIST_DELAY_MS = 120;
export const BUILDER_VIEWPORT_MIN = 320;
export const BUILDER_VIEWPORT_MAX = 3840;
export const BUILDER_ZOOM_MIN = 10;
export const BUILDER_ZOOM_MAX = 500;
export const BUILDER_VIEWPORT_PRESETS: readonly BuilderViewportPreset[] = Object.freeze([
  { id: 'desktop', label: 'Desktop', width: 1280 },
  { id: 'tablet', label: 'Tablet', width: 820 },
  { id: 'mobile', label: 'Mobile', width: 390 }
]);

type Listener = (state: BuilderViewportState) => void;

const listeners = new Set<Listener>();
let state: BuilderViewportState = readStoredState();
let bridgePersistTimer: number | null = null;

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return Math.max(min, Math.min(max, Math.round(finiteNumber(value, fallback))));
}

function presetForWidth(width: number): BuilderViewportPresetId {
  return BUILDER_VIEWPORT_PRESETS.find(preset => preset.width === width)?.id || 'custom';
}

export function builderBreakpointForWidth(width: unknown): Exclude<BuilderViewportPresetId, 'custom'> {
  const value = clamp(width, BUILDER_VIEWPORT_MIN, BUILDER_VIEWPORT_MAX, 1280);
  if (value <= 600) return 'mobile';
  if (value <= 1024) return 'tablet';
  return 'desktop';
}

function normalizeState(value: unknown): BuilderViewportState {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const width = clamp(source.width, BUILDER_VIEWPORT_MIN, BUILDER_VIEWPORT_MAX, 1280);
  return {
    width,
    presetId: presetForWidth(width),
    zoom: clamp(source.zoom, BUILDER_ZOOM_MIN, BUILDER_ZOOM_MAX, 100),
    zoomMode: source.zoomMode === 'manual' ? 'manual' : 'fit'
  };
}

function readStoredState(): BuilderViewportState {
  if (typeof window === 'undefined') return normalizeState({});
  try {
    return normalizeState(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}'));
  } catch {
    return normalizeState({});
  }
}

function hasAppBridge(): boolean {
  if (typeof window === 'undefined') return false;
  const bridgeWindow = window as Window & {
    __BLOGPOSTER_APP_INIT_TOKENS__?: { appBridge?: boolean };
  };
  return bridgeWindow.__BLOGPOSTER_APP_INIT_TOKENS__?.appBridge === true
    && typeof window.meltdownEmit === 'function';
}

function persistToLocalStorage(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    // The admin app iframe intentionally has an opaque origin. Its state is
    // persisted by the parent through the existing AppBridge below.
    return false;
  }
}

function persistToParentBridge(): void {
  if (!hasAppBridge()) return;
  if (bridgePersistTimer !== null) window.clearTimeout(bridgePersistTimer);
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

function persistState(): void {
  if (!persistToLocalStorage()) persistToParentBridge();
}

function publish(
  next: BuilderViewportState,
  options: { persist?: boolean } = {}
): BuilderViewportState {
  state = normalizeState(next);
  if (options.persist !== false) persistState();
  const snapshot = getBuilderViewportState();
  listeners.forEach(listener => listener(snapshot));
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('bp:designer-viewport-changed', { detail: snapshot }));
  }
  return snapshot;
}

export function getBuilderViewportState(): BuilderViewportState {
  return { ...state };
}

export function subscribeBuilderViewport(
  listener: Listener,
  options: { immediate?: boolean } = {}
): () => void {
  listeners.add(listener);
  if (options.immediate !== false) listener(getBuilderViewportState());
  return () => listeners.delete(listener);
}

export function setBuilderViewportWidth(width: unknown): BuilderViewportState {
  return publish({
    ...state,
    width: clamp(width, BUILDER_VIEWPORT_MIN, BUILDER_VIEWPORT_MAX, state.width)
  });
}

export function setBuilderViewportPreset(id: unknown): BuilderViewportState {
  const preset = BUILDER_VIEWPORT_PRESETS.find(candidate => candidate.id === String(id || '').trim());
  if (!preset) return getBuilderViewportState();
  return publish({ ...state, width: preset.width, presetId: preset.id });
}

export function setBuilderZoom(zoom: unknown): BuilderViewportState {
  return publish({
    ...state,
    zoom: clamp(zoom, BUILDER_ZOOM_MIN, BUILDER_ZOOM_MAX, state.zoom),
    zoomMode: 'manual'
  });
}

export function setBuilderFitZoom(zoom: unknown): BuilderViewportState {
  return publish({
    ...state,
    zoom: clamp(zoom, BUILDER_ZOOM_MIN, BUILDER_ZOOM_MAX, state.zoom),
    zoomMode: 'fit'
  });
}

export function setBuilderZoomMode(mode: unknown): BuilderViewportState {
  return publish({
    ...state,
    zoomMode: mode === 'manual' ? 'manual' : 'fit'
  });
}

export async function hydrateBuilderViewportState(): Promise<BuilderViewportState> {
  if (!hasAppBridge()) return getBuilderViewportState();
  try {
    const result = await window.meltdownEmit?.(BRIDGE_PREFERENCE_GET, {
      key: BRIDGE_PREFERENCE_KEY
    }) as { found?: boolean; value?: unknown } | undefined;
    if (result?.found) {
      return publish(normalizeState(result.value), { persist: false });
    }
  } catch (error) {
    console.warn('DESIGNER_VIEWPORT_PREFERENCE_READ_FAILED', error);
  }
  return getBuilderViewportState();
}

// Focused tests use this reset so singleton state never leaks between cases.
export function resetBuilderViewportStateForTests(value: unknown = {}): BuilderViewportState {
  if (bridgePersistTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(bridgePersistTimer);
    bridgePersistTimer = null;
  }
  state = normalizeState(value);
  return getBuilderViewportState();
}
