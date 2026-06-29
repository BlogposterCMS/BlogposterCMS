import {
  applyRuntimeDesignStyles,
  getRuntimeDesignLayout
} from './runtimeDesignLayouts.js';
import {
  getRuntimeDesignDocument,
  renderRuntimeDesignDocument
} from './runtimeDesignDocument.js';
import { renderAttachedRuntimeContent } from './runtimeAttachedContent.js';
import { clearContentKeepHeader } from './runtimePageShell.js';
import {
  appendRuntimeEmptyState,
  appendRuntimeHtmlContent
} from './runtimeContentFallbacks.js';
import {
  fetchRuntimeDesign,
  loadRuntimeLayoutForViewport,
  loadRuntimeLayoutTemplate,
  type RuntimeEmitter as RuntimeDataEmitter
} from './runtimePageData.js';
import {
  resolveRuntimePresentationCascade,
  type RuntimePresentationSource
} from './runtimePresentationCascade.js';
import type { RuntimeWidgetDefinition } from './runtimeWidgetRenderer.js';
import {
  renderPublicRuntimeGrid,
  renderStaticRuntimeGrid
} from './runtimeStaticGrid.js';
import type { RuntimeEmitter as RuntimeWidgetEmitter } from './runtimeWidgetInstances.js';

type LooseRecord = Record<string, any>;
type LayoutItem = LooseRecord;

const noopWidgetEmit: RuntimeWidgetEmitter = async () => undefined;

function mergedPresentationPage(page: LooseRecord, config: LooseRecord = {}): LooseRecord {
  const pageMeta = page.meta && typeof page.meta === 'object' && !Array.isArray(page.meta)
    ? page.meta
    : {};
  const configMeta = config && typeof config === 'object' && !Array.isArray(config)
    ? config
    : {};
  return {
    ...page,
    meta: {
      ...pageMeta,
      ...configMeta
    }
  };
}

function inheritedContentMount(contentEl: HTMLElement): HTMLElement {
  return contentEl.querySelector<HTMLElement>('.runtime-design-document [data-workarea="true"]')
    || contentEl.querySelector<HTMLElement>('.runtime-design-document .runtime-layout-container:not([data-split="true"])')
    || contentEl;
}

function appendInheritedPageHtml(
  contentEl: HTMLElement,
  page: LooseRecord,
  presentation: RuntimePresentationSource
): void {
  if (!presentation.inherited || !page.html) return;
  appendRuntimeHtmlContent(inheritedContentMount(contentEl), page.html);
}

export type RuntimePublicPageContentOptions = {
  page: LooseRecord;
  config?: LooseRecord;
  contentEl: HTMLElement;
  globalLayout?: LayoutItem[];
  allWidgets: RuntimeWidgetDefinition[];
  lane: string;
  emit: RuntimeDataEmitter;
  widgetEmit?: RuntimeWidgetEmitter;
  debug?: boolean;
};

export async function renderPublicRuntimePageContent({
  page,
  config = page.meta || {},
  contentEl,
  globalLayout = [],
  allWidgets,
  lane,
  emit,
  widgetEmit = noopWidgetEmit,
  debug = false
}: RuntimePublicPageContentOptions): Promise<void> {
  const presentation = await resolveRuntimePresentationCascade(
    mergedPresentationPage(page, config),
    emit,
    lane
  );

  if (presentation?.designId) {
    try {
      const res = await fetchRuntimeDesign(emit, presentation.designId, lane);
      const layout = getRuntimeDesignLayout(res);
      const combined = [...globalLayout, ...layout];
      clearContentKeepHeader(contentEl);
      applyRuntimeDesignStyles(contentEl, res?.design);
      const designDocument = getRuntimeDesignDocument({
        ...res,
        placements: layout
      });
      const renderedDocument = await renderRuntimeDesignDocument(contentEl, designDocument, allWidgets, lane, {
        emit,
        widgetEmit,
        globalLayout
      });
      if (!renderedDocument) {
        await renderStaticRuntimeGrid(contentEl, combined, allWidgets, lane, { widgetEmit });
      }
      appendInheritedPageHtml(contentEl, page, presentation);
      await renderAttachedRuntimeContent({ page, lane, allWidgets, container: contentEl, emit, widgetEmit });
      return;
    } catch (err) {
      console.warn('[Renderer] failed to load design', err);
    }
  }

  if (presentation?.layoutTemplate) {
    let layoutArr: LayoutItem[] = [];
    try {
      layoutArr = await loadRuntimeLayoutTemplate(emit, presentation.layoutTemplate, lane);
    } catch (err) {
      console.warn('[Renderer] failed to load layout template', err);
    }
    const combined = [...globalLayout, ...layoutArr];
    clearContentKeepHeader(contentEl);
    await renderStaticRuntimeGrid(contentEl, combined, allWidgets, lane, { widgetEmit });
    appendInheritedPageHtml(contentEl, page, presentation);
    await renderAttachedRuntimeContent({ page, lane, allWidgets, container: contentEl, emit, widgetEmit });
    return;
  }

  if (page.html) {
    clearContentKeepHeader(contentEl);
    appendRuntimeHtmlContent(contentEl, page.html);
    await renderAttachedRuntimeContent({ page, lane, allWidgets, container: contentEl, emit, widgetEmit });
    return;
  }

  const layout = await loadRuntimeLayoutForViewport(emit, page.id, lane);
  if (debug) console.debug('[Renderer] layout', layout);

  const items: LayoutItem[] = layout.length
    ? layout
    : ((config.widgets || []) as any[]).map((id: unknown, idx: number) => ({
        id: `w${idx}`,
        widgetId: id,
        x: 0,
        y: idx * 2,
        w: 8,
        h: 4,
        code: null
      }));
  const combined: LayoutItem[] = [...globalLayout, ...items];

  clearContentKeepHeader(contentEl);
  if (!combined.length) {
    appendRuntimeEmptyState(contentEl);
    return;
  }

  await renderPublicRuntimeGrid(contentEl, combined, allWidgets, lane, widgetEmit, debug);
  await renderAttachedRuntimeContent({ page, lane, allWidgets, container: contentEl, emit, widgetEmit });
}
