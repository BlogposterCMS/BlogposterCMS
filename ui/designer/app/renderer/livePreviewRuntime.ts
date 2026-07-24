import {
  fetchRuntimeWidgetRegistry
} from '/ui/runtime/main/runtimePageData.js';
import {
  renderPublicRuntimePageContent
} from '/ui/runtime/main/runtimePageComposition.js';
import {
  ensureGlobalStyle,
  ensureLayout
} from '/ui/runtime/main/runtimePageShell.js';
import {
  applyColorLibraryVariables,
  normalizeColorLibrarySnapshot
} from '/ui/shared/colors/colorLibrary.js';
import {
  applyActiveFontPackage,
  normalizeFontPackagesSnapshot
} from '/ui/shared/fonts/fontPackages.js';
import {
  DESIGNER_LIVE_PREVIEW_FAILED,
  DESIGNER_LIVE_PREVIEW_READY,
  DESIGNER_LIVE_PREVIEW_RENDER,
  DESIGNER_LIVE_PREVIEW_RENDERED,
  DESIGNER_LIVE_PREVIEW_RUNTIME_REQUEST,
  DESIGNER_LIVE_PREVIEW_RUNTIME_RESPONSE,
  type DesignerLivePreviewPayload
} from './livePreviewMessages.js';

type LooseRecord = Record<string, any>;

const RUNTIME_REQUEST_TIMEOUT_MS = 12000;
const DESIGNER_LIVE_PREVIEW_QUERY = 'designer-live-preview';

let nextRuntimeRequestId = 1;
let livePreviewRuntimeBooted = false;
const pendingRuntimeRequests = new Map<string, {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timer: number;
}>();

function isRecord(value: unknown): value is LooseRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parentPost(message: Record<string, unknown>): void {
  window.parent?.postMessage(message, '*');
}

function previewRuntimeEmit(
  eventName: string,
  payload: Record<string, unknown> = {},
  timeoutMs = RUNTIME_REQUEST_TIMEOUT_MS
): Promise<unknown> {
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

function handleRuntimeResponse(message: LooseRecord): boolean {
  if (message.type !== DESIGNER_LIVE_PREVIEW_RUNTIME_RESPONSE) return false;
  const requestId = String(message.requestId || '');
  const pending = pendingRuntimeRequests.get(requestId);
  if (!pending) return true;
  pendingRuntimeRequests.delete(requestId);
  window.clearTimeout(pending.timer);
  if (message.ok) {
    pending.resolve(message.data);
  } else {
    pending.reject(new Error(String(message.error || 'DESIGNER_LIVE_PREVIEW_RUNTIME_FAILED')));
  }
  return true;
}

function renderPreviewError(contentEl: HTMLElement, message: string): void {
  const error = document.createElement('div');
  error.className = 'designer-live-preview-runtime-error';
  error.setAttribute('role', 'alert');
  error.textContent = message;
  contentEl.replaceChildren(error);
}

function renderEmptyPreview(contentEl: HTMLElement): void {
  const empty = document.createElement('div');
  empty.className = 'designer-live-preview-runtime-empty';
  empty.textContent = 'No public preview content.';
  contentEl.replaceChildren(empty);
}

async function resolveWidgetRegistry(payload: DesignerLivePreviewPayload): Promise<unknown[]> {
  if (Array.isArray(payload.widgets) && payload.widgets.length) {
    return payload.widgets;
  }
  return fetchRuntimeWidgetRegistry(previewRuntimeEmit, 'public', 'public');
}

function previewDesignId(payload: DesignerLivePreviewPayload): string {
  const id = String(payload.design?.id || '').trim();
  return id || '__designer_live_preview__';
}

function previewPageFromPayload(payload: DesignerLivePreviewPayload): LooseRecord {
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

function previewDesignResponseFromPayload(payload: DesignerLivePreviewPayload): LooseRecord {
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

function previewRuntimeDataEmit(payload: DesignerLivePreviewPayload) {
  return async function emit(eventName: string, requestPayload: LooseRecord = {}): Promise<unknown> {
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
    return previewRuntimeEmit(eventName, requestPayload);
  };
}

function applyPreviewBrandStyles(payload: DesignerLivePreviewPayload): void {
  const styles = isRecord(payload.document.styles) ? payload.document.styles : {};
  const fontCatalog = isRecord(styles.fontCatalog) ? styles.fontCatalog : {};
  const sources = isRecord(fontCatalog.sources)
    ? Object.fromEntries(Object.entries(fontCatalog.sources).filter(([name, url]) => (
      Boolean(name.trim()) && typeof url === 'string' && Boolean(url.trim())
    )))
    : {};
  const available = Array.isArray(fontCatalog.available)
    ? fontCatalog.available.filter((font): font is string => typeof font === 'string' && Boolean(font.trim()))
    : Object.keys(sources);

  window.FONT_SOURCES = sources;
  window.AVAILABLE_FONTS = available;
  document.documentElement.dataset.bpFontPackagesLane = 'public';
  applyColorLibraryVariables(normalizeColorLibrarySnapshot(styles.colorLibrary));
  applyActiveFontPackage(normalizeFontPackagesSnapshot(styles.fontPackages));
}

export async function renderLivePreviewPayload(payload: DesignerLivePreviewPayload): Promise<void> {
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
    globalLayout: Array.isArray(payload.globalLayout) ? payload.globalLayout as any[] : [],
    allWidgets: widgets as any[],
    lane: 'public',
    emit: previewEmit,
    widgetEmit: previewRuntimeEmit
  });

  if (!contentEl.childElementCount) {
    renderEmptyPreview(contentEl);
  }
}

export function bootLivePreviewRuntime(): void {
  if (livePreviewRuntimeBooted) return;
  livePreviewRuntimeBooted = true;

  window.addEventListener('message', event => {
    const message = isRecord(event.data) ? event.data : {};
    if (handleRuntimeResponse(message)) return;
    if (message.type !== DESIGNER_LIVE_PREVIEW_RENDER || !isRecord(message.payload)) return;

    const requestId = String(message.requestId || '');
    renderLivePreviewPayload(message.payload as DesignerLivePreviewPayload)
      .then(() => {
        document.body.dataset.livePreviewStatus = 'ready';
        parentPost({ type: DESIGNER_LIVE_PREVIEW_RENDERED, requestId });
      })
      .catch(err => {
        const contentEl = document.getElementById('content');
        const error = err instanceof Error ? err.message : String(err);
        console.error('[Designer Live Preview] DESIGNER_LIVE_PREVIEW_RENDER_FAILED', err);
        if (contentEl) renderPreviewError(contentEl, error);
        document.body.dataset.livePreviewStatus = 'error';
        parentPost({ type: DESIGNER_LIVE_PREVIEW_FAILED, requestId, error });
      });
  });

  parentPost({ type: DESIGNER_LIVE_PREVIEW_READY });
}

function shouldAutoBootLivePreviewRuntime(): boolean {
  try {
    return new URLSearchParams(window.location.search).has(DESIGNER_LIVE_PREVIEW_QUERY);
  } catch {
    return false;
  }
}

if (shouldAutoBootLivePreviewRuntime()) {
  bootLivePreviewRuntime();
}
