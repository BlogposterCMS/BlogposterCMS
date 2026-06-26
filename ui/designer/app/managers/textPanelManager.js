import { attachEditButton, attachLockOnClick, attachOptionsMenu, attachRemoveButton, renderWidget } from './widgetManager.js';
import { sanitizeHtml } from '/ui/shared/sanitize/sanitizer.js';
const VARIANT_MAP = {
    heading: {
        label: 'Heading',
        tag: 'h1',
        placeholder: 'Start your heading'
    },
    subheading: {
        label: 'Subheading',
        tag: 'h2',
        placeholder: 'Add a supporting heading'
    },
    body: {
        label: 'Body text',
        tag: 'p',
        placeholder: 'Write your copy'
    }
};
const CSS_UNSAFE_PATTERN = /(expression|javascript:|vbscript:|data:|url\(\s*['\"]?javascript:)/gi;
const sanitizeCssText = (css) => css.replace(CSS_UNSAFE_PATTERN, '');
const parseTemplateData = (template) => {
    if (!template)
        return null;
    if (template.widgetId && template.widgetId !== 'textBox')
        return null;
    const data = (template.data && typeof template.data === 'object') ? template.data : {};
    const nestedCode = (data && typeof data.code === 'object')
        ? data.code || null
        : null;
    const html = template.html || data.html || nestedCode?.html;
    const css = template.css || data.css || nestedCode?.css;
    const js = template.js || data.js || nestedCode?.js;
    if (!html && !css && !js)
        return null;
    const result = {};
    if (typeof html === 'string' && html.trim())
        result.html = sanitizeHtml(html);
    if (typeof css === 'string' && css.trim())
        result.css = sanitizeCssText(css);
    if (typeof js === 'string' && js.trim())
        result.js = js;
    return Object.keys(result).length ? result : null;
};
const collectTemplates = (panel, key) => {
    if (!panel)
        return [];
    const raw = panel.dataset[key];
    if (!raw)
        return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
};
const getGlobalTemplates = (panel) => {
    const datasetTemplates = collectTemplates(panel, 'globalTextTemplates');
    if (datasetTemplates.length)
        return datasetTemplates;
    const winTemplates = window.GLOBAL_TEXT_WIDGETS;
    if (Array.isArray(winTemplates)) {
        return winTemplates;
    }
    return [];
};
const getSavedTemplates = (panel) => {
    const datasetTemplates = collectTemplates(panel, 'savedTextTemplates');
    const saved = [];
    if (datasetTemplates.length)
        saved.push(...datasetTemplates);
    try {
        const raw = window.localStorage?.getItem('widgetTemplates');
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                parsed.forEach(entry => {
                    if (entry && typeof entry === 'object')
                        saved.push(entry);
                });
            }
        }
    }
    catch {
        /* ignore storage errors */
    }
    return saved;
};
const nextAvailableRow = (gridEl, activeLayer, defaultRows) => {
    if (!gridEl)
        return 0;
    let maxY = 0;
    const widgets = Array.from(gridEl.querySelectorAll(`.canvas-item[data-layer="${activeLayer}"]`));
    widgets.forEach(widget => {
        const y = Number.parseInt(widget.dataset.y || '0', 10) || 0;
        const h = Number.parseInt(widget.getAttribute('gs-h') || `${defaultRows}`, 10) || defaultRows;
        maxY = Math.max(maxY, y + h);
    });
    return maxY;
};
const createCanvasItem = (options, widgetDef, config) => {
    const { grid, gridEl, genId, getActiveLayer, defaultRows } = options;
    if (!gridEl || !grid || typeof grid.makeWidget !== 'function')
        return null;
    const instanceId = genId();
    const activeLayer = getActiveLayer();
    const y = nextAvailableRow(gridEl, activeLayer, defaultRows);
    const wrapper = document.createElement('div');
    wrapper.classList.add('canvas-item');
    wrapper.dataset.widgetId = widgetDef.id;
    wrapper.dataset.instanceId = instanceId;
    wrapper.dataset.layer = String(activeLayer);
    wrapper.dataset.behavior = 'scroll';
    wrapper.dataset.scrollStart = '10';
    wrapper.dataset.scrollEnd = '60';
    const activeScene = options.getActiveScene?.();
    if (activeScene?.id)
        wrapper.dataset.sceneId = activeScene.id;
    if (activeScene?.title)
        wrapper.dataset.sceneTitle = activeScene.title;
    wrapper.dataset.x = '0';
    wrapper.dataset.y = String(y);
    wrapper.id = `widget-${instanceId}`;
    wrapper.style.zIndex = String(activeLayer);
    wrapper.setAttribute('gs-w', '4');
    wrapper.setAttribute('gs-h', String(defaultRows));
    wrapper.setAttribute('gs-min-w', '1');
    wrapper.setAttribute('gs-min-h', String(defaultRows));
    const content = document.createElement('div');
    content.className = 'canvas-item-content builder-themed';
    const iconHtml = options.getWidgetIcon?.(widgetDef, options.iconMap);
    if (iconHtml) {
        content.innerHTML = `${iconHtml}<span>${widgetDef.metadata?.label || config.label}</span>`;
    }
    else {
        content.textContent = widgetDef.metadata?.label ? `${widgetDef.metadata.label}` : config.label;
    }
    wrapper.appendChild(content);
    gridEl.appendChild(wrapper);
    grid.makeWidget?.(wrapper);
    grid.update?.(wrapper, { x: 0, y, w: 4, h: defaultRows, layer: activeLayer });
    return wrapper;
};
const applyTemplateToWidget = async (options, widgetDef, wrapper, config) => {
    const { ensureCodeMap } = options;
    const codeMap = ensureCodeMap();
    const instanceId = wrapper.dataset.instanceId;
    if (!instanceId)
        return;
    if (config.customData) {
        codeMap[instanceId] = { ...config.customData };
        await renderWidget(wrapper, widgetDef, codeMap, config.customData);
        return;
    }
    await renderWidget(wrapper, widgetDef, codeMap);
    if (!config.variant)
        return;
    const container = wrapper.querySelector('.widget-container');
    if (!container)
        return;
    const editable = container.querySelector('.editable');
    if (!editable)
        return;
    const variant = VARIANT_MAP[config.variant];
    if (!variant)
        return;
    editable.innerHTML = '';
    const inner = document.createElement(variant.tag);
    inner.textContent = variant.placeholder;
    editable.appendChild(inner);
    const html = container.innerHTML.trim();
    if (!html)
        return;
    const existing = (codeMap[instanceId] && typeof codeMap[instanceId] === 'object')
        ? codeMap[instanceId]
        : {};
    codeMap[instanceId] = { ...existing, html };
};
const wireTemplateButton = (button, options, widgetDef, config) => {
    button.addEventListener('click', async () => {
        if (button.disabled)
            return;
        button.disabled = true;
        const wrapper = createCanvasItem(options, widgetDef, config);
        if (!wrapper) {
            button.disabled = false;
            return;
        }
        try {
            const codeMap = options.ensureCodeMap();
            const grid = options.grid;
            if (!grid) {
                wrapper.remove();
                return;
            }
            attachRemoveButton(wrapper, grid, options.pageId, () => {
                if (options.shouldAutosave())
                    options.scheduleAutosave();
            });
            const editBtn = attachEditButton(wrapper, widgetDef);
            attachOptionsMenu(wrapper, widgetDef, editBtn, {
                grid: options.gridEl,
                pageId: options.pageId,
                scheduleAutosave: () => {
                    if (options.shouldAutosave())
                        options.scheduleAutosave();
                },
                activeLayer: options.getActiveLayer(),
                codeMap,
                genId: options.genId
            });
            attachLockOnClick(wrapper);
            await applyTemplateToWidget(options, widgetDef, wrapper, config);
            options.grid?.emitChange?.(wrapper);
            options.grid?.emitChange?.(wrapper, { contentOnly: true });
            options.selectWidget(wrapper);
            options.markInactiveWidgets();
            if (options.shouldAutosave())
                options.scheduleAutosave();
        }
        catch (err) {
            console.error('[Designer] failed to add text widget', err);
            wrapper.remove();
        }
        finally {
            button.disabled = false;
        }
    });
};
const renderTemplateList = (container, options, widgetDef, templates) => {
    if (!container)
        return;
    container.innerHTML = '';
    const normalized = templates
        .map(template => ({ template, data: parseTemplateData(template) }))
        .filter((entry) => Boolean(entry.data));
    if (!normalized.length) {
        container.parentElement?.style?.setProperty('display', 'none');
        return;
    }
    container.parentElement?.style?.removeProperty('display');
    normalized.forEach(({ template, data }, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'text-choice template-choice';
        const label = template.label || template.name || `Template ${index + 1}`;
        btn.textContent = label || `Template ${index + 1}`;
        container.appendChild(btn);
        wireTemplateButton(btn, options, widgetDef, { customData: data, label: label || `Template ${index + 1}` });
    });
};
const registerVariantButtons = (panel, options, widgetDef) => {
    const headingBtn = panel.querySelector('.heading-choice');
    if (headingBtn) {
        wireTemplateButton(headingBtn, options, widgetDef, { variant: 'heading', label: VARIANT_MAP.heading.label });
    }
    const subheadingBtn = panel.querySelector('.subheading-choice');
    if (subheadingBtn) {
        wireTemplateButton(subheadingBtn, options, widgetDef, { variant: 'subheading', label: VARIANT_MAP.subheading.label });
    }
    const bodyBtn = panel.querySelector('.body-choice');
    if (bodyBtn) {
        wireTemplateButton(bodyBtn, options, widgetDef, { variant: 'body', label: VARIANT_MAP.body.label });
    }
};
export function initTextPanel(options) {
    if (!options?.gridEl || !options.grid)
        return;
    const panel = document.getElementById('builderPanel');
    if (!panel)
        return;
    const textPanel = panel.querySelector('.text-panel');
    if (!textPanel)
        return;
    const widgetDef = options.allWidgets.find(widget => widget.id === 'textBox');
    if (!widgetDef)
        return;
    registerVariantButtons(textPanel, options, widgetDef);
    const globalList = panel.querySelector('.text-global .global-list') || null;
    const savedList = panel.querySelector('.text-saved .saved-list') || null;
    const globalTemplates = getGlobalTemplates(panel);
    renderTemplateList(globalList, options, widgetDef, globalTemplates);
    const savedTemplates = getSavedTemplates(panel);
    renderTemplateList(savedList, options, widgetDef, savedTemplates);
    if (savedList && !savedList.__textPanelListenersAttached) {
        const savedMarker = savedList;
        const refreshSaved = () => {
            const nextTemplates = getSavedTemplates(panel);
            renderTemplateList(savedList, options, widgetDef, nextTemplates);
        };
        const storageHandler = (event) => {
            if (event.key === 'widgetTemplates' && event.storageArea === window.localStorage) {
                refreshSaved();
            }
        };
        savedMarker.__textPanelListenersAttached = true;
        savedMarker.__textPanelRefresh = refreshSaved;
        savedMarker.__textPanelStorageHandler = storageHandler;
        window.addEventListener('widgetTemplatesUpdated', refreshSaved);
        window.addEventListener('storage', storageHandler);
    }
}
