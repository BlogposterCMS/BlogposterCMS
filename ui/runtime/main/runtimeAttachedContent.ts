import {
  applyRuntimeDesignStyles,
  getRuntimeDesignLayout
} from './runtimeDesignLayouts.js';
import {
  fetchRuntimeChildPages,
  fetchRuntimeDesign,
  fetchRuntimePageById,
  loadRuntimeLayoutTemplate,
  type RuntimeEmitter as RuntimeDataEmitter
} from './runtimePageData.js';
import type { RuntimeWidgetDefinition } from './runtimeWidgetRenderer.js';
import { appendRuntimeHtmlContent } from './runtimeContentFallbacks.js';
import { renderStaticRuntimeGrid } from './runtimeStaticGrid.js';
import { getRuntimeDesignDocument, renderRuntimeDesignDocument } from './runtimeDesignDocument.js';
import type { RuntimeEmitter as RuntimeWidgetEmitter } from './runtimeWidgetInstances.js';

type LooseRecord = Record<string, any>;
type LayoutItem = LooseRecord;

const noopWidgetEmit: RuntimeWidgetEmitter = async () => undefined;

export type RuntimeAttachedContentOptions = {
  page: LooseRecord;
  lane: string;
  allWidgets: RuntimeWidgetDefinition[];
  container: HTMLElement | null | undefined;
  emit: RuntimeDataEmitter;
  widgetEmit?: RuntimeWidgetEmitter;
};

export async function renderAttachedRuntimeContent({
  page,
  lane,
  allWidgets,
  container,
  emit,
  widgetEmit = noopWidgetEmit
}: RuntimeAttachedContentOptions): Promise<void> {
  if (!container) return;
  try {
    const items = await fetchRuntimeChildPages(emit, page.id, lane);
    for (const child of items.filter((candidate: LooseRecord) => candidate.is_content)) {
      const childPage = await fetchRuntimePageById(emit, child.id, lane);
      if (!childPage) continue;

      const section = document.createElement('section');
      section.className = 'attached-content';
      const designId = childPage.designId ?? childPage.design_id ?? childPage.meta?.designId ?? childPage.meta?.design_id;
      if (designId) {
        try {
          const res = await fetchRuntimeDesign(emit, designId, lane);
          const layout = getRuntimeDesignLayout(res);
          applyRuntimeDesignStyles(section, res?.design);
          // Attached content preserves the authored container tree and nested designs.
          const rendered = await renderRuntimeDesignDocument(
            section, getRuntimeDesignDocument({ ...res, placements: layout }), allWidgets, lane,
            { emit, widgetEmit, designPath: [String(designId)] }
          );
          if (!rendered) await renderStaticRuntimeGrid(section, layout, allWidgets, lane, { widgetEmit });
        } catch (err) {
          console.warn('[Renderer] RUNTIME_ATTACHED_DESIGN_LOAD_FAILED', err);
        }
      } else if (childPage.meta?.layoutTemplate) {
        let layoutArr: LayoutItem[] = [];
        try {
          layoutArr = await loadRuntimeLayoutTemplate(
            emit,
            childPage.meta.layoutTemplate,
            lane
          );
        } catch (err) {
          console.warn('[Renderer] failed to load layout template', err);
        }
        await renderStaticRuntimeGrid(section, layoutArr, allWidgets, lane, { widgetEmit });
      } else if (childPage.html) {
        appendRuntimeHtmlContent(section, childPage.html);
      }
      container.appendChild(section);
    }
  } catch (err) {
    console.warn('[Renderer] failed to load attached content', err);
  }
}
