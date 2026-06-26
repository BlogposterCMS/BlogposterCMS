import { applyRuntimeDesignStyles, getRuntimeDesignLayout } from './runtimeDesignLayouts.js';
import { getRuntimeDesignDocument, renderRuntimeDesignDocument } from './runtimeDesignDocument.js';
import { renderAttachedRuntimeContent } from './runtimeAttachedContent.js';
import { clearContentKeepHeader } from './runtimePageShell.js';
import { appendRuntimeEmptyState, appendRuntimeHtmlContent } from './runtimeContentFallbacks.js';
import { fetchRuntimeDesign, loadRuntimeLayoutForViewport, loadRuntimeLayoutTemplate } from './runtimePageData.js';
import { renderPublicRuntimeGrid, renderStaticRuntimeGrid } from './runtimeStaticGrid.js';
const noopWidgetEmit = async () => undefined;
export async function renderPublicRuntimePageContent({ page, config = page.meta || {}, contentEl, globalLayout = [], allWidgets, lane, emit, widgetEmit = noopWidgetEmit, debug = false }) {
    if (page.meta?.designId) {
        try {
            const res = await fetchRuntimeDesign(emit, page.meta.designId, lane);
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
            await renderAttachedRuntimeContent({ page, lane, allWidgets, container: contentEl, emit, widgetEmit });
            return;
        }
        catch (err) {
            console.warn('[Renderer] failed to load design', err);
        }
    }
    if (config.layoutTemplate) {
        let layoutArr = [];
        try {
            layoutArr = await loadRuntimeLayoutTemplate(emit, config.layoutTemplate, lane);
        }
        catch (err) {
            console.warn('[Renderer] failed to load layout template', err);
        }
        const combined = [...globalLayout, ...layoutArr];
        clearContentKeepHeader(contentEl);
        await renderStaticRuntimeGrid(contentEl, combined, allWidgets, lane, { widgetEmit });
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
    if (debug)
        console.debug('[Renderer] layout', layout);
    const items = layout.length
        ? layout
        : (config.widgets || []).map((id, idx) => ({
            id: `w${idx}`,
            widgetId: id,
            x: 0,
            y: idx * 2,
            w: 8,
            h: 4,
            code: null
        }));
    const combined = [...globalLayout, ...items];
    clearContentKeepHeader(contentEl);
    if (!combined.length) {
        appendRuntimeEmptyState(contentEl);
        return;
    }
    await renderPublicRuntimeGrid(contentEl, combined, allWidgets, lane, widgetEmit, debug);
    await renderAttachedRuntimeContent({ page, lane, allWidgets, container: contentEl, emit, widgetEmit });
}
