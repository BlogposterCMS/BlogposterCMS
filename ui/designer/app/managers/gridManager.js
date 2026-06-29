// @ts-nocheck
import { init as initCanvasGrid } from '/ui/runtime/main/canvasGrid.js';
export function initGrid(gridEl, state, selectWidget, opts = {}) {
    const columnCount = 12;
    // Determine the scroll container: prefer explicit option, otherwise
    // use the grid's parent element. This allows zoom to keep scrollbars
    // inside the designer viewport instead of the page.
    const scrollContainer = opts.scrollContainer || gridEl.parentElement || gridEl;
    const enableZoom = opts.enableZoom === true;
    const grid = initCanvasGrid({
        columns: columnCount,
        rows: Infinity,
        pushOnOverlap: false,
        liveSnap: false,
        liveSnapResize: false,
        percentageMode: true,
        bboxHandles: true,
        scrollContainer,
        enableZoom
    }, gridEl);
    gridEl.__grid = grid;
    let cwRAF = null;
    function setColumnWidth() {
        // Recalculate based on the element's clientWidth to ignore any
        // CSS transforms (e.g. panel-open scales the #content). Using
        // getBoundingClientRect() would include transforms and produce
        // incorrect column widths.
        if (cwRAF)
            return;
        cwRAF = requestAnimationFrame(() => {
            cwRAF = null;
            const containerEl = scrollContainer || gridEl;
            const width = containerEl.clientWidth ||
                // Fallback to computed style if clientWidth is 0 (detached?)
                parseFloat(getComputedStyle(containerEl).width) ||
                // Last resort
                (containerEl.getBoundingClientRect().width || 1);
            grid.options.columnWidth = width / grid.options.columns;
            // Trigger a silent update so widgets re-render to the new width
            grid.widgets.forEach(w => grid.update(w, {}, { silent: true }));
        });
    }
    setColumnWidth();
    window.addEventListener('resize', setColumnWidth);
    // Also observe direct size changes of the grid container (e.g. sidebar toggles).
    const __gridRO = new ResizeObserver(() => setColumnWidth());
    __gridRO.observe(scrollContainer);
    gridEl.__gridRO = __gridRO;
    grid.on('change', ({ el } = {}) => {
        if (el)
            selectWidget(el);
    });
    return grid;
}
export function getCurrentLayout(gridEl, codeMap) {
    if (!gridEl)
        return [];
    const items = Array.from(gridEl.querySelectorAll('.canvas-item'));
    return items.map(el => serializeCanvasItem(el, codeMap));
}
export function getCurrentLayoutForLayer(gridEl, idx, codeMap) {
    if (!gridEl)
        return [];
    const items = Array.from(gridEl.querySelectorAll(`.canvas-item[data-layer="${idx}"]`));
    return items.map(el => serializeCanvasItem(el, codeMap));
}
function serializeCanvasItem(el, codeMap) {
    const instanceId = el.dataset.instanceId;
    const workareaEl = el.closest('.layout-container');
    const workareaId = workareaEl?.dataset?.nodeId || '';
    const existingCode = instanceId ? codeMap[instanceId] : null;
    const code = existingCode && typeof existingCode === 'object'
        ? { ...existingCode }
        : {};
    const meta = code.meta && typeof code.meta === 'object'
        ? { ...code.meta }
        : {};
    if (el.dataset.sceneId)
        meta.sceneId = el.dataset.sceneId;
    if (el.dataset.behavior)
        meta.behavior = el.dataset.behavior;
    if (el.dataset.sceneTitle)
        meta.sceneTitle = el.dataset.sceneTitle;
    if (el.dataset.sceneBackground)
        meta.sceneBackground = el.dataset.sceneBackground;
    if (el.dataset.scrollStart)
        meta.scrollStart = el.dataset.scrollStart;
    if (el.dataset.scrollEnd)
        meta.scrollEnd = el.dataset.scrollEnd;
    if (el.dataset.elementName)
        meta.elementName = el.dataset.elementName;
    if (el.dataset.opacity)
        meta.opacity = el.dataset.opacity;
    if (el.dataset.radius)
        meta.radius = el.dataset.radius;
    if (workareaId)
        meta.workareaId = workareaId;
    const styleSource = readStyleSourceMeta(el);
    if (styleSource)
        meta.styleSource = styleSource;
    const effects = parseEffectsDataset(el.dataset.effects);
    if (effects.length)
        meta.effects = effects;
    if (Object.keys(meta).length)
        code.meta = meta;
    return {
        id: instanceId,
        widgetId: el.dataset.widgetId,
        workareaId,
        global: el.dataset.global === 'true',
        xPercent: +el.dataset.xPercent || 0,
        yPercent: +el.dataset.yPercent || 0,
        wPercent: +el.dataset.wPercent || 0,
        hPercent: +el.dataset.hPercent || 0,
        zIndex: Number.parseInt(el.style.zIndex || el.dataset.layer || '0', 10) || 0,
        behavior: el.dataset.behavior || meta.behavior || 'scroll',
        sceneId: el.dataset.sceneId || meta.sceneId || '',
        sceneTitle: el.dataset.sceneTitle || meta.sceneTitle || '',
        sceneBackground: el.dataset.sceneBackground || meta.sceneBackground || '',
        scrollStart: el.dataset.scrollStart || meta.scrollStart || '',
        scrollEnd: el.dataset.scrollEnd || meta.scrollEnd || '',
        elementName: el.dataset.elementName || meta.elementName || '',
        opacity: el.dataset.opacity || meta.opacity || '',
        radius: el.dataset.radius || meta.radius || '',
        effects: effects.length ? effects : (Array.isArray(meta.effects) ? meta.effects : []),
        code: Object.keys(code).length ? code : null
    };
}
function readStyleSourceMeta(el) {
    const meta = {};
    if (el.dataset.styleSourceEnabled)
        meta.enabled = el.dataset.styleSourceEnabled !== 'false';
    if (el.dataset.styleSourceRole)
        meta.role = el.dataset.styleSourceRole;
    if (el.dataset.styleSourceId)
        meta.sourceId = el.dataset.styleSourceId;
    if (el.dataset.styleSyncLayout)
        meta.syncLayout = el.dataset.styleSyncLayout !== 'false';
    if (el.dataset.styleSyncDesign)
        meta.syncDesign = el.dataset.styleSyncDesign !== 'false';
    return Object.keys(meta).length ? meta : null;
}
function parseEffectsDataset(value) {
    if (!value)
        return [];
    if (Array.isArray(value))
        return value;
    try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return Array.isArray(parsed)
            ? parsed.filter(effect => effect && typeof effect === 'object')
            : [];
    }
    catch {
        return [];
    }
}
export function pushState(stack, redoStack, layout) {
    stack.push(JSON.stringify(layout));
    if (stack.length > 50)
        stack.shift();
    redoStack.length = 0;
}
