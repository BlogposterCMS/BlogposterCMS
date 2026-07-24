import { serializeLayout } from '/ui/shared/layout/layoutDom.js';
import {
  DESIGNER_LIVE_PREVIEW_FAILED,
  DESIGNER_LIVE_PREVIEW_READY,
  DESIGNER_LIVE_PREVIEW_RENDER,
  DESIGNER_LIVE_PREVIEW_RENDERED,
  DESIGNER_LIVE_PREVIEW_RUNTIME_REQUEST,
  DESIGNER_LIVE_PREVIEW_RUNTIME_RESPONSE,
  type DesignerLivePreviewPayload,
  type DesignerLivePreviewViewport
} from './livePreviewMessages.js';
import {
  BUILDER_VIEWPORT_PRESETS,
  getBuilderViewportState,
  setBuilderViewportPreset,
  subscribeBuilderViewport
} from './viewportState.js';
import { getColorLibrarySnapshot } from '/ui/shared/colors/colorLibrary.js';
import { getFontPackagesSnapshot } from '/ui/shared/fonts/fontPackages.js';

type RuntimeEmit = (eventName: string, payload?: Record<string, unknown>, timeout?: number) => Promise<unknown>;
type LooseRecord = Record<string, any>;

type DisplayPortSource = {
  id?: unknown;
  label?: unknown;
  width?: unknown;
};

type LayoutLayer = {
  name?: string;
  layout?: unknown;
};

type LivePreviewPayloadOptions = {
  title?: string;
  activeLayer: number;
  hasLayoutStructure: boolean;
  gridEl: HTMLElement | null;
  layoutRoot: HTMLElement | null;
  layoutLayers: LayoutLayer[];
  allWidgets: unknown[];
  globalLayout?: unknown[];
  viewport: DesignerLivePreviewViewport;
  state?: LooseRecord;
  getCurrentLayoutForLayer: (gridEl: HTMLElement | null, layer: number, codeMap: LooseRecord) => unknown[];
  ensureCodeMap: () => LooseRecord;
  updateAllWidgetContents?: () => void;
  saveActiveLayer?: () => void;
  getSceneSections?: () => unknown[];
};

type LivePreviewControllerOptions = {
  displayPorts?: DisplayPortSource[];
  frameUrl?: string;
  buildPayload: (viewport: DesignerLivePreviewViewport) => DesignerLivePreviewPayload;
  emit?: RuntimeEmit;
  renderDebounceMs?: number;
  loadTimeoutMs?: number;
};

const DESIGNER_LIVE_PREVIEW_QUERY = 'designer-live-preview';
const DEFAULT_RENDER_DEBOUNCE_MS = 180;
const DEFAULT_LOAD_TIMEOUT_MS = 8000;
const FALLBACK_VIEWPORT: DesignerLivePreviewViewport = { id: 'desktop', label: 'Desktop', width: '100%' };
const DEFAULT_VIEWPORTS: DesignerLivePreviewViewport[] = [
  FALLBACK_VIEWPORT,
  { id: 'tablet', label: 'Tablet', width: '820px' },
  { id: 'mobile', label: 'Mobile', width: '390px' }
];

function isRecord(value: unknown): value is LooseRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function safeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parsedRecord(value: unknown): LooseRecord {
  if (isRecord(value)) return { ...value };
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? { ...parsed } : {};
  } catch {
    return {};
  }
}

function firstDefined(source: LooseRecord, keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      return source[key];
    }
  }
  return undefined;
}

function normalizedId(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizePreviewSlug(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/^\/+|\/+$/gu, '')
    .split('/')
    .map(segment => segment.replace(/[^a-z0-9_-]+/giu, '-').replace(/^-+|-+$/gu, '').toLowerCase())
    .filter(Boolean)
    .join('/');
}

export function buildLivePreviewFrameUrl(slug: unknown = ''): string {
  const normalized = normalizePreviewSlug(slug || window.PAGE_SLUG || '');
  const path = normalized
    ? `/${normalized.split('/').map(segment => encodeURIComponent(segment)).join('/')}`
    : '/';
  const url = new URL(path, window.location.origin);
  url.searchParams.set(DESIGNER_LIVE_PREVIEW_QUERY, '1');
  const originToken = new URLSearchParams(window.location.search).get('originToken');
  if (originToken) url.searchParams.set('originToken', originToken);
  return `${url.pathname}${url.search}`;
}

function normalizeLivePreviewPlacement(value: unknown): LooseRecord | null {
  if (!isRecord(value)) return null;

  const code = isRecord(value.code) ? { ...value.code } : {};
  const meta = {
    ...parsedRecord(code.meta),
    ...parsedRecord(code.metadata),
    ...parsedRecord(value.metadata)
  };
  const workareaId = normalizedId(
    firstDefined(value, ['workareaId', 'workarea_id'])
      ?? firstDefined(meta, ['workareaId', 'workarea_id'])
  );
  const styleSource = firstDefined(value, ['styleSource', 'style_source'])
    ?? firstDefined(meta, ['styleSource', 'style_source']);
  const hasTopLevelCode = value.html !== undefined || value.css !== undefined || value.js !== undefined;
  const hasCodePayload = Object.keys(code).length > 0 || Object.keys(meta).length > 0 || hasTopLevelCode;
  const normalizedCode = {
    ...code,
    ...(value.html !== undefined && code.html === undefined ? { html: value.html } : {}),
    ...(value.css !== undefined && code.css === undefined ? { css: value.css } : {}),
    ...(value.js !== undefined && code.js === undefined ? { js: value.js } : {}),
    meta: {
      ...meta,
      ...(workareaId ? { workareaId } : {}),
      ...(styleSource && isRecord(styleSource) ? { styleSource } : {})
    }
  };

  const placement: LooseRecord = {
    ...value,
    id: firstDefined(value, ['id', 'instanceId', 'instance_id']),
    widgetId: firstDefined(value, ['widgetId', 'widget_id']),
    xPercent: firstDefined(value, ['xPercent', 'x_percent']),
    yPercent: firstDefined(value, ['yPercent', 'y_percent']),
    wPercent: firstDefined(value, ['wPercent', 'w_percent']),
    hPercent: firstDefined(value, ['hPercent', 'h_percent']),
    layer: firstDefined(value, ['layer', 'zIndex', 'z_index']),
    zIndex: firstDefined(value, ['zIndex', 'z_index', 'layer']),
    rotationDeg: firstDefined(value, ['rotationDeg', 'rotation_deg']),
    behavior: firstDefined(value, ['behavior', 'behaviour']) ?? firstDefined(meta, ['behavior']),
    sceneId: firstDefined(value, ['sceneId', 'scene_id']) ?? firstDefined(meta, ['sceneId', 'scene_id']),
    sceneTitle: firstDefined(value, ['sceneTitle', 'scene_title']) ?? firstDefined(meta, ['sceneTitle', 'scene_title']),
    sceneBackground: firstDefined(value, ['sceneBackground', 'scene_background'])
      ?? firstDefined(meta, ['sceneBackground', 'scene_background']),
    scrollStart: firstDefined(value, ['scrollStart', 'scroll_start']) ?? firstDefined(meta, ['scrollStart', 'scroll_start']),
    scrollEnd: firstDefined(value, ['scrollEnd', 'scroll_end']) ?? firstDefined(meta, ['scrollEnd', 'scroll_end']),
    elementName: firstDefined(value, ['elementName', 'element_name', 'name'])
      ?? firstDefined(meta, ['elementName', 'element_name', 'name']),
    opacity: firstDefined(value, ['opacity']) ?? firstDefined(meta, ['opacity']),
    radius: firstDefined(value, ['radius', 'cornerRadius', 'corner_radius'])
      ?? firstDefined(meta, ['radius', 'cornerRadius', 'corner_radius']),
    effects: firstDefined(value, ['effects']) ?? firstDefined(meta, ['effects']),
    ...(workareaId ? { workareaId } : {}),
    ...(styleSource && isRecord(styleSource) ? { styleSource } : {}),
    ...(hasCodePayload ? { code: normalizedCode } : {})
  };
  Object.keys(placement).forEach(key => {
    if (placement[key] === undefined) delete placement[key];
  });
  return placement;
}

function normalizeLivePreviewPlacements(items: unknown[]): LooseRecord[] {
  return items
    .map(item => normalizeLivePreviewPlacement(item))
    .filter((item): item is LooseRecord => Boolean(item));
}

function normalizeViewportWidth(id: string, value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (/^\d+(?:\.\d+)?(?:px|rem|vw|%)$/.test(raw)) return raw;
  if (id === 'mobile') return '390px';
  if (id === 'tablet') return '820px';
  return '100%';
}

export function normalizeLivePreviewViewports(
  displayPorts: DisplayPortSource[] = []
): DesignerLivePreviewViewport[] {
  const normalized = displayPorts
    .map(port => {
      const id = String(port?.id || '').replace(/[^a-z0-9_-]/gi, '').toLowerCase();
      const label = String(port?.label || id || '').trim();
      if (!id || !label) return null;
      return {
        id,
        label,
        width: normalizeViewportWidth(id, port.width)
      };
    })
    .filter((port): port is DesignerLivePreviewViewport => Boolean(port));

  return normalized.length ? normalized : DEFAULT_VIEWPORTS;
}

function currentDesignBackground(gridEl: HTMLElement | null): Record<string, unknown> {
  const style = gridEl ? window.getComputedStyle(gridEl) : null;
  return {
    bg_color: style?.backgroundColor || '',
    bg_media_id: gridEl?.dataset.bgImageId || '',
    bg_media_url: gridEl?.dataset.bgImageUrl || ''
  };
}

function currentFontCatalog(): Record<string, unknown> {
  const available = Array.isArray(window.AVAILABLE_FONTS)
    ? window.AVAILABLE_FONTS.filter(font => typeof font === 'string' && font.trim())
    : [];
  const sources = window.FONT_SOURCES && typeof window.FONT_SOURCES === 'object'
    ? Object.fromEntries(Object.entries(window.FONT_SOURCES).filter(([name, url]) => (
      Boolean(name.trim()) && typeof url === 'string' && Boolean(url.trim())
    )))
    : {};
  return { available, sources };
}

function rootLayoutContainer(layoutRoot: HTMLElement | null): HTMLElement | null {
  if (!layoutRoot) return null;
  if (layoutRoot.classList.contains('layout-container')) return layoutRoot;
  return layoutRoot.querySelector<HTMLElement>('.layout-container');
}

function withSceneSections(layoutTree: unknown, scenes: unknown[]): unknown {
  if (!isRecord(layoutTree) || !scenes.length) return layoutTree;
  return {
    ...layoutTree,
    scenes
  };
}

function layerLayoutAt(
  layers: LayoutLayer[],
  layerIndex: number,
  activeLayer: number,
  activeLayout: unknown[]
): unknown[] {
  if (layerIndex === activeLayer) return activeLayout;
  return safeArray(layers[layerIndex]?.layout);
}

function previewPlacements({
  layoutLayers,
  activeLayer,
  hasLayoutStructure,
  gridEl,
  getCurrentLayoutForLayer,
  ensureCodeMap
}: Pick<LivePreviewPayloadOptions, 'layoutLayers' | 'activeLayer' | 'hasLayoutStructure' | 'gridEl' | 'getCurrentLayoutForLayer' | 'ensureCodeMap'>): unknown[] {
  const activeLayout = safeArray(getCurrentLayoutForLayer(gridEl, activeLayer, ensureCodeMap()));
  if (!hasLayoutStructure) return activeLayout;

  return layoutLayers
    .map((_, index) => layerLayoutAt(layoutLayers, index, activeLayer, activeLayout))
    .slice(1)
    .flatMap(safeArray);
}

export function buildLivePreviewPayload({
  title = 'Design Preview',
  activeLayer,
  hasLayoutStructure,
  gridEl,
  layoutRoot,
  layoutLayers,
  allWidgets,
  globalLayout = [],
  viewport,
  state = {},
  getCurrentLayoutForLayer,
  ensureCodeMap,
  updateAllWidgetContents,
  saveActiveLayer,
  getSceneSections
}: LivePreviewPayloadOptions): DesignerLivePreviewPayload {
  updateAllWidgetContents?.();
  saveActiveLayer?.();

  const scenes = safeArray(getSceneSections?.());
  const layoutTree = withSceneSections(
    serializeLayout(rootLayoutContainer(layoutRoot)) || { type: 'leaf', workarea: true },
    scenes
  );
  const placements = normalizeLivePreviewPlacements(previewPlacements({
    layoutLayers,
    activeLayer,
    hasLayoutStructure,
    gridEl,
    getCurrentLayoutForLayer,
    ensureCodeMap
  }));

  return {
    version: 1,
    title,
    lane: 'public',
    generatedAt: new Date().toISOString(),
    activeLayer,
    viewport,
    design: {
      id: state.designId || null,
      title,
      version: state.designVersion || 0,
      layout: layoutTree,
      ...currentDesignBackground(gridEl)
    },
    document: {
      version: 1,
      layoutTree,
      placements,
      scenes,
      styles: {
        colorLibrary: getColorLibrarySnapshot(),
        fontPackages: getFontPackagesSnapshot(),
        fontCatalog: currentFontCatalog()
      },
      metadata: {
        source: 'design-studio-live-preview',
        generatedFrom: 'ui/designer/app/renderer/livePreviewFrame.ts'
      }
    },
    widgets: safeArray(allWidgets),
    globalLayout: normalizeLivePreviewPlacements(safeArray(globalLayout))
  };
}

function iconButton(icon: string, label: string, className = ''): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = ['designer-live-preview__icon-btn', className].filter(Boolean).join(' ');
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = `<img src="/assets/icons/${icon}.svg" alt="" class="icon" />`;
  return button;
}

function textButton(label: string, className = ''): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = ['designer-live-preview__viewport-btn', className].filter(Boolean).join(' ');
  button.textContent = label;
  return button;
}

function setBodyPreviewDataset(open: boolean, status = 'closed', viewportId = ''): void {
  if (!open) {
    delete document.body.dataset.livePreviewOpen;
    delete document.body.dataset.livePreviewStatus;
    delete document.body.dataset.livePreviewViewport;
    return;
  }
  document.body.dataset.livePreviewOpen = 'true';
  document.body.dataset.livePreviewStatus = status;
  if (viewportId) document.body.dataset.livePreviewViewport = viewportId;
}

export function livePreviewFeedbackState(): Record<string, unknown> {
  const panel = document.getElementById('designerLivePreviewPanel') as HTMLElement | null;
  const frame = document.getElementById('designerLivePreviewFrame') as HTMLIFrameElement | null;
  const open = document.body.dataset.livePreviewOpen === 'true' || Boolean(panel?.isConnected);
  return {
    available: true,
    open,
    status: panel?.dataset.status || document.body.dataset.livePreviewStatus || (open ? 'unknown' : 'closed'),
    viewport: panel?.dataset.viewport || document.body.dataset.livePreviewViewport || null,
    source: open ? 'designer-live-preview-frame' : null,
    frameUrl: frame?.getAttribute('src') || null,
    errorCode: panel?.dataset.errorCode || null,
    errorMessage: panel?.dataset.errorMessage || null,
    runtime: 'public'
  };
}

export function createLivePreviewController({
  displayPorts = [],
  frameUrl = buildLivePreviewFrameUrl(),
  buildPayload,
  emit,
  renderDebounceMs = DEFAULT_RENDER_DEBOUNCE_MS,
  loadTimeoutMs = DEFAULT_LOAD_TIMEOUT_MS
}: LivePreviewControllerOptions) {
  const viewports = normalizeLivePreviewViewports(displayPorts);
  const initialViewportState = getBuilderViewportState();
  let activeViewport: DesignerLivePreviewViewport = {
    id: initialViewportState.presetId,
    label: BUILDER_VIEWPORT_PRESETS.find(preset => preset.id === initialViewportState.presetId)?.label || 'Custom',
    width: `${initialViewportState.width}px`
  };
  let panel: HTMLElement | null = null;
  let frame: HTMLIFrameElement | null = null;
  let trigger: HTMLElement | null = null;
  let open = false;
  let renderTimer = 0;
  let loadTimer = 0;
  let nextRequestId = 1;

  const runtimeEmit: RuntimeEmit = emit || ((eventName, payload, timeout) => {
    if (typeof window.meltdownEmit !== 'function') {
      return Promise.reject(new Error('DESIGNER_LIVE_PREVIEW_EMITTER_MISSING: meltdownEmit unavailable'));
    }
    return window.meltdownEmit(eventName, payload, timeout);
  });

  function clearLoadTimeout(): void {
    window.clearTimeout(loadTimer);
    loadTimer = 0;
  }

  function setStatus(status: string, errorCode = '', errorMessage = ''): void {
    clearLoadTimeout();
    if (panel) {
      panel.dataset.status = status;
      if (errorCode) panel.dataset.errorCode = errorCode;
      else delete panel.dataset.errorCode;
      if (errorMessage) panel.dataset.errorMessage = errorMessage;
      else delete panel.dataset.errorMessage;
      const statusEl = panel.querySelector<HTMLElement>('[data-live-preview-status]');
      if (statusEl) {
        statusEl.hidden = status === 'ready';
        statusEl.textContent = status === 'error'
          ? `${errorMessage || 'Preview unavailable'} (${errorCode || 'DESIGNER_LIVE_PREVIEW_FAILED'})`
          : 'Loading public runtime…';
      }
    }
    setBodyPreviewDataset(open, status, activeViewport.id);
    if (status === 'loading' && open) {
      loadTimer = window.setTimeout(() => {
        setStatus(
          'error',
          'DESIGNER_LIVE_PREVIEW_TIMEOUT',
          'The public runtime did not become ready in time.'
        );
      }, Math.max(100, loadTimeoutMs));
    }
  }

  function updateTrigger(): void {
    if (!trigger) return;
    trigger.setAttribute('aria-pressed', open ? 'true' : 'false');
    trigger.classList.toggle('is-live-preview-open', open);
  }

  function setFrameWidth(): void {
    if (!frame) return;
    frame.style.width = activeViewport.width;
    frame.title = `Live preview - ${activeViewport.label}`;
  }

  function markViewportButtons(): void {
    panel?.querySelectorAll<HTMLElement>('[data-live-preview-viewport]').forEach(button => {
      const active = button.dataset.livePreviewViewport === activeViewport.id;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function postRenderPayload(): void {
    if (!frame?.contentWindow) {
      console.warn('[Designer] DESIGNER_LIVE_PREVIEW_FRAME_MISSING');
      setStatus('error');
      return;
    }
    let payload: DesignerLivePreviewPayload;
    try {
      payload = buildPayload(activeViewport);
    } catch (err) {
      console.error('[Designer] DESIGNER_LIVE_PREVIEW_PAYLOAD_FAILED', err);
      setStatus('error');
      return;
    }
    setFrameWidth();
    setStatus('loading');
    frame.contentWindow.postMessage({
      type: DESIGNER_LIVE_PREVIEW_RENDER,
      requestId: `render-${nextRequestId++}`,
      payload
    }, '*');
  }

  function scheduleRender(delayMs = renderDebounceMs): void {
    if (!open) return;
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(postRenderPayload, delayMs);
  }

  function setViewport(viewportId: string): void {
    setBuilderViewportPreset(viewportId);
  }

  function buildPanel(): HTMLElement {
    const root = document.createElement('section');
    root.id = 'designerLivePreviewPanel';
    root.className = 'designer-live-preview';
    root.setAttribute('aria-label', 'Live public preview');
    root.dataset.status = 'loading';
    root.dataset.viewport = activeViewport.id;

    const bar = document.createElement('div');
    bar.className = 'designer-live-preview__bar';

    const title = document.createElement('div');
    title.className = 'designer-live-preview__title';
    title.textContent = 'Live Preview';
    bar.appendChild(title);
    const status = document.createElement('div');
    status.className = 'designer-live-preview__status';
    status.dataset.livePreviewStatus = 'true';
    status.setAttribute('role', 'status');
    status.textContent = 'Loading public runtime…';
    bar.appendChild(status);

    const viewportGroup = document.createElement('div');
    viewportGroup.className = 'designer-live-preview__viewport-group';
    viewportGroup.setAttribute('aria-label', 'Preview viewport');
    viewports.forEach(viewport => {
      const button = textButton(viewport.label);
      button.dataset.livePreviewViewport = viewport.id;
      button.addEventListener('click', () => setViewport(viewport.id));
      viewportGroup.appendChild(button);
    });
    bar.appendChild(viewportGroup);

    const actions = document.createElement('div');
    actions.className = 'designer-live-preview__actions';
    const refresh = iconButton('refresh-cw', 'Refresh preview');
    refresh.dataset.livePreviewAction = 'refresh';
    refresh.addEventListener('click', () => scheduleRender(0));
    const close = iconButton('x', 'Close preview');
    close.dataset.livePreviewAction = 'close';
    close.addEventListener('click', () => closePreview());
    actions.append(refresh, close);
    bar.appendChild(actions);

    const shell = document.createElement('div');
    shell.className = 'designer-live-preview__frame-shell';
    frame = document.createElement('iframe');
    frame.id = 'designerLivePreviewFrame';
    frame.className = 'designer-live-preview__frame';
    frame.src = frameUrl;
    frame.setAttribute('title', 'Live public preview');
    frame.setAttribute('loading', 'eager');
    frame.addEventListener('load', () => scheduleRender(0));
    shell.appendChild(frame);

    root.append(bar, shell);
    document.body.appendChild(root);
    markViewportButtons();
    setFrameWidth();
    return root;
  }

  async function answerRuntimeRequest(message: LooseRecord): Promise<void> {
    if (!frame?.contentWindow) return;
    const requestId = message.requestId;
    try {
      const data = await runtimeEmit(
        String(message.eventName || ''),
        isRecord(message.payload) ? message.payload : {},
        Number(message.timeoutMs || 0) || undefined
      );
      frame.contentWindow.postMessage({
        type: DESIGNER_LIVE_PREVIEW_RUNTIME_RESPONSE,
        requestId,
        ok: true,
        data
      }, '*');
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.warn('[Designer] DESIGNER_LIVE_PREVIEW_RUNTIME_REQUEST_FAILED', error);
      frame.contentWindow.postMessage({
        type: DESIGNER_LIVE_PREVIEW_RUNTIME_RESPONSE,
        requestId,
        ok: false,
        error
      }, '*');
    }
  }

  function handlePreviewMessage(event: MessageEvent): void {
    if (!frame?.contentWindow || event.source !== frame.contentWindow) return;
    const message = isRecord(event.data) ? event.data : {};
    if (message.type === DESIGNER_LIVE_PREVIEW_READY) {
      scheduleRender(0);
      return;
    }
    if (message.type === DESIGNER_LIVE_PREVIEW_RENDERED) {
      setStatus('ready');
      return;
    }
    if (message.type === DESIGNER_LIVE_PREVIEW_FAILED) {
      setStatus(
        'error',
        String(message.code || 'DESIGNER_LIVE_PREVIEW_RUNTIME_FAILED'),
        String(message.error || message.message || 'The public runtime rejected the preview payload.')
      );
      return;
    }
    if (message.type === DESIGNER_LIVE_PREVIEW_RUNTIME_REQUEST) {
      void answerRuntimeRequest(message);
    }
  }

  function openPreview(): void {
    if (open) {
      scheduleRender(0);
      return;
    }
    open = true;
    panel = panel?.isConnected ? panel : buildPanel();
    panel.hidden = false;
    panel.dataset.viewport = activeViewport.id;
    setStatus('loading');
    updateTrigger();
    scheduleRender(0);
  }

  function closePreview(): void {
    open = false;
    window.clearTimeout(renderTimer);
    clearLoadTimeout();
    // Remove the iframe instead of only hiding it so stale public-runtime
    // messages cannot keep the overlay in a confusing half-open state.
    panel?.remove();
    panel = null;
    frame = null;
    setBodyPreviewDataset(false);
    updateTrigger();
  }

  window.addEventListener('message', handlePreviewMessage);
  document.addEventListener('designerContentChanged', () => scheduleRender());
  const unsubscribeViewport = subscribeBuilderViewport(next => {
    activeViewport = {
      id: next.presetId,
      label: BUILDER_VIEWPORT_PRESETS.find(preset => preset.id === next.presetId)?.label || 'Custom',
      width: `${next.width}px`
    };
    if (panel) panel.dataset.viewport = activeViewport.id;
    markViewportButtons();
    setFrameWidth();
    scheduleRender(0);
  });

  return {
    open: openPreview,
    close: closePreview,
    toggle: () => (open ? closePreview() : openPreview()),
    refresh: () => scheduleRender(0),
    isOpen: () => open,
    setTrigger(nextTrigger: HTMLElement | null): void {
      trigger = nextTrigger;
      updateTrigger();
    },
    getActiveViewport: () => activeViewport,
    destroy(): void {
      closePreview();
      unsubscribeViewport();
      window.removeEventListener('message', handlePreviewMessage);
      panel?.remove();
      panel = null;
      frame = null;
    }
  };
}
