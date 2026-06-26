import { applyRuntimeDesignStyles, getRuntimeDesignLayout } from './runtimeDesignLayouts.js';
import { fetchRuntimeChildPages, fetchRuntimeDesign, fetchRuntimePageById, loadRuntimeLayoutTemplate } from './runtimePageData.js';
import { appendRuntimeHtmlContent } from './runtimeContentFallbacks.js';
import { renderStaticRuntimeGrid } from './runtimeStaticGrid.js';
const noopWidgetEmit = async () => undefined;
export async function renderAttachedRuntimeContent({ page, lane, allWidgets, container, emit, widgetEmit = noopWidgetEmit }) {
    if (!container)
        return;
    try {
        const items = await fetchRuntimeChildPages(emit, page.id, lane);
        for (const child of items.filter((candidate) => candidate.is_content)) {
            const childPage = await fetchRuntimePageById(emit, child.id, lane);
            if (!childPage)
                continue;
            const section = document.createElement('section');
            section.className = 'attached-content';
            if (childPage.meta?.designId) {
                try {
                    const res = await fetchRuntimeDesign(emit, childPage.meta.designId, lane);
                    const layout = getRuntimeDesignLayout(res);
                    applyRuntimeDesignStyles(section, res?.design);
                    await renderStaticRuntimeGrid(section, layout, allWidgets, lane, { widgetEmit });
                }
                catch (err) {
                    console.warn('[Renderer] failed to load design', err);
                }
            }
            else if (childPage.meta?.layoutTemplate) {
                let layoutArr = [];
                try {
                    layoutArr = await loadRuntimeLayoutTemplate(emit, childPage.meta.layoutTemplate, lane);
                }
                catch (err) {
                    console.warn('[Renderer] failed to load layout template', err);
                }
                await renderStaticRuntimeGrid(section, layoutArr, allWidgets, lane, { widgetEmit });
            }
            else if (childPage.html) {
                appendRuntimeHtmlContent(section, childPage.html);
            }
            container.appendChild(section);
        }
    }
    catch (err) {
        console.warn('[Renderer] failed to load attached content', err);
    }
}
