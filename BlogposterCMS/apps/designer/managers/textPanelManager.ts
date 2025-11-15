import { attachEditButton, attachLockOnClick, attachOptionsMenu, attachRemoveButton, renderWidget } from './widgetManager.js';
import { sanitizeHtml } from '../../../public/plainspace/sanitizer.js';

type WidgetDefinition = {
  id: string;
  metadata?: {
    label?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type TemplateData = {
  html?: string;
  css?: string;
  js?: string;
};

type StoredTemplate = {
  name?: string;
  label?: string;
  widgetId?: string;
  data?: TemplateData | null;
  html?: string;
  css?: string;
  js?: string;
};

type TextPanelInitOptions = {
  grid: {
    makeWidget?: (el: HTMLElement) => void;
    update?: (el: HTMLElement, opts: Record<string, unknown>) => void;
    emitChange?: (el: HTMLElement, meta?: Record<string, unknown>) => void;
    removeWidget?: (el: HTMLElement) => void;
  } | null;
  gridEl: HTMLElement | null;
  allWidgets: WidgetDefinition[];
  genId: () => string;
  ensureCodeMap: () => Record<string, TemplateData>;
  getActiveLayer: () => number;
  selectWidget: (el: HTMLElement | null) => void;
  markInactiveWidgets: () => void;
  scheduleAutosave: () => void;
  shouldAutosave: () => boolean;
  pageId: string | number | null;
  defaultRows: number;
  iconMap?: Record<string, string>;
  getWidgetIcon?: (widgetDef: WidgetDefinition, iconMap?: Record<string, string>) => string;
};

type VariantKey = 'heading' | 'subheading' | 'body';

type TextVariant = {
  label: string;
  tag: string;
  placeholder: string;
};

const VARIANT_MAP: Record<VariantKey, TextVariant> = {
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

const sanitizeCssText = (css: string): string => css.replace(CSS_UNSAFE_PATTERN, '');

const parseTemplateData = (template: StoredTemplate | null | undefined): TemplateData | null => {
  if (!template) return null;
  if (template.widgetId && template.widgetId !== 'textBox') return null;
  const data = (template.data && typeof template.data === 'object') ? template.data : {};
  const nestedCode = (data && typeof (data as Record<string, unknown>).code === 'object')
    ? (data as { code?: TemplateData }).code || null
    : null;
  const html = template.html || (data as Record<string, unknown>).html || nestedCode?.html;
  const css = template.css || (data as Record<string, unknown>).css || nestedCode?.css;
  const js = template.js || (data as Record<string, unknown>).js || nestedCode?.js;
  if (!html && !css && !js) return null;
  const result: TemplateData = {};
  if (typeof html === 'string' && html.trim()) result.html = sanitizeHtml(html);
  if (typeof css === 'string' && css.trim()) result.css = sanitizeCssText(css);
  if (typeof js === 'string' && js.trim()) result.js = js;
  return Object.keys(result).length ? result : null;
};

const collectTemplates = (panel: HTMLElement | null, key: string): StoredTemplate[] => {
  if (!panel) return [];
  const raw = panel.dataset[key];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getGlobalTemplates = (panel: HTMLElement | null): StoredTemplate[] => {
  const datasetTemplates = collectTemplates(panel, 'globalTextTemplates');
  if (datasetTemplates.length) return datasetTemplates;
  const winTemplates = (window as Record<string, unknown>).GLOBAL_TEXT_WIDGETS;
  if (Array.isArray(winTemplates)) {
    return winTemplates as StoredTemplate[];
  }
  return [];
};

const getSavedTemplates = (panel: HTMLElement | null): StoredTemplate[] => {
  const datasetTemplates = collectTemplates(panel, 'savedTextTemplates');
  const saved: StoredTemplate[] = [];
  if (datasetTemplates.length) saved.push(...datasetTemplates);
  try {
    const raw = window.localStorage?.getItem('widgetTemplates');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(entry => {
          if (entry && typeof entry === 'object') saved.push(entry as StoredTemplate);
        });
      }
    }
  } catch {
    /* ignore storage errors */
  }
  return saved;
};

const nextAvailableRow = (gridEl: HTMLElement | null, activeLayer: number, defaultRows: number): number => {
  if (!gridEl) return 0;
  let maxY = 0;
  const widgets = Array.from(gridEl.querySelectorAll<HTMLElement>(`.canvas-item[data-layer="${activeLayer}"]`));
  widgets.forEach(widget => {
    const y = Number.parseInt(widget.dataset.y || '0', 10) || 0;
    const h = Number.parseInt(widget.getAttribute('gs-h') || `${defaultRows}`, 10) || defaultRows;
    maxY = Math.max(maxY, y + h);
  });
  return maxY;
};

const createCanvasItem = (
  options: TextPanelInitOptions,
  widgetDef: WidgetDefinition,
  config: {
    customData?: TemplateData | null;
    variant?: VariantKey;
    label: string;
  }
): HTMLElement | null => {
  const { grid, gridEl, genId, getActiveLayer, defaultRows } = options;
  if (!gridEl || !grid || typeof grid.makeWidget !== 'function') return null;
  const instanceId = genId();
  const activeLayer = getActiveLayer();
  const y = nextAvailableRow(gridEl, activeLayer, defaultRows);
  const wrapper = document.createElement('div');
  wrapper.classList.add('canvas-item');
  wrapper.dataset.widgetId = widgetDef.id;
  wrapper.dataset.instanceId = instanceId;
  wrapper.dataset.layer = String(activeLayer);
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
  } else {
    content.textContent = widgetDef.metadata?.label ? `${widgetDef.metadata.label}` : config.label;
  }
  wrapper.appendChild(content);

  gridEl.appendChild(wrapper);
  grid.makeWidget?.(wrapper);
  grid.update?.(wrapper, { x: 0, y, w: 4, h: defaultRows, layer: activeLayer });
  return wrapper;
};

const applyTemplateToWidget = async (
  options: TextPanelInitOptions,
  widgetDef: WidgetDefinition,
  wrapper: HTMLElement,
  config: { customData?: TemplateData | null; variant?: VariantKey }
): Promise<void> => {
  const { ensureCodeMap } = options;
  const codeMap = ensureCodeMap();
  const instanceId = wrapper.dataset.instanceId;
  if (!instanceId) return;
  if (config.customData) {
    codeMap[instanceId] = { ...config.customData };
    await renderWidget(wrapper, widgetDef, codeMap, config.customData);
    return;
  }

  await renderWidget(wrapper, widgetDef, codeMap);
  if (!config.variant) return;
  const container = wrapper.querySelector<HTMLElement>('.widget-container');
  if (!container) return;
  const editable = container.querySelector<HTMLElement>('.editable');
  if (!editable) return;
  const variant = VARIANT_MAP[config.variant];
  if (!variant) return;
  editable.innerHTML = '';
  const inner = document.createElement(variant.tag);
  inner.textContent = variant.placeholder;
  editable.appendChild(inner);
  const html = container.innerHTML.trim();
  if (!html) return;
  const existing = (codeMap[instanceId] && typeof codeMap[instanceId] === 'object')
    ? codeMap[instanceId]
    : {};
  codeMap[instanceId] = { ...existing, html };
};

const wireTemplateButton = (
  button: HTMLButtonElement,
  options: TextPanelInitOptions,
  widgetDef: WidgetDefinition,
  config: { customData?: TemplateData | null; variant?: VariantKey; label: string }
) => {
  button.addEventListener('click', async () => {
    if (button.disabled) return;
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
        if (options.shouldAutosave()) options.scheduleAutosave();
      });
      const editBtn = attachEditButton(wrapper, widgetDef);
      attachOptionsMenu(wrapper, widgetDef, editBtn, {
        grid: options.gridEl,
        pageId: options.pageId,
        scheduleAutosave: () => {
          if (options.shouldAutosave()) options.scheduleAutosave();
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
      if (options.shouldAutosave()) options.scheduleAutosave();
    } catch (err) {
      console.error('[Designer] failed to add text widget', err);
      wrapper.remove();
    } finally {
      button.disabled = false;
    }
  });
};

const renderTemplateList = (
  container: Element | null,
  options: TextPanelInitOptions,
  widgetDef: WidgetDefinition,
  templates: StoredTemplate[]
) => {
  if (!container) return;
  container.innerHTML = '';
  const normalized = templates
    .map(template => ({ template, data: parseTemplateData(template) }))
    .filter((entry): entry is { template: StoredTemplate; data: TemplateData } => Boolean(entry.data));
  if (!normalized.length) {
    (container.parentElement as HTMLElement | null)?.style?.setProperty('display', 'none');
    return;
  }
  (container.parentElement as HTMLElement | null)?.style?.removeProperty('display');
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

const registerVariantButtons = (
  panel: HTMLElement,
  options: TextPanelInitOptions,
  widgetDef: WidgetDefinition
) => {
  const headingBtn = panel.querySelector<HTMLButtonElement>('.heading-choice');
  if (headingBtn) {
    wireTemplateButton(headingBtn, options, widgetDef, { variant: 'heading', label: VARIANT_MAP.heading.label });
  }
  const subheadingBtn = panel.querySelector<HTMLButtonElement>('.subheading-choice');
  if (subheadingBtn) {
    wireTemplateButton(subheadingBtn, options, widgetDef, { variant: 'subheading', label: VARIANT_MAP.subheading.label });
  }
  const bodyBtn = panel.querySelector<HTMLButtonElement>('.body-choice');
  if (bodyBtn) {
    wireTemplateButton(bodyBtn, options, widgetDef, { variant: 'body', label: VARIANT_MAP.body.label });
  }
};

export function initTextPanel(options: TextPanelInitOptions): void {
  if (!options?.gridEl || !options.grid) return;
  const panel = document.getElementById('builderPanel');
  if (!panel) return;
  const textPanel = panel.querySelector('.text-panel');
  if (!textPanel) return;
  const widgetDef = options.allWidgets.find(widget => widget.id === 'textBox');
  if (!widgetDef) return;

  registerVariantButtons(textPanel as HTMLElement, options, widgetDef);
  const globalList = (panel.querySelector('.text-global .global-list') as HTMLElement | null) || null;
  const savedList = (panel.querySelector('.text-saved .saved-list') as HTMLElement | null) || null;

  const globalTemplates = getGlobalTemplates(panel);
  renderTemplateList(globalList, options, widgetDef, globalTemplates);

  const savedTemplates = getSavedTemplates(panel);
  renderTemplateList(savedList, options, widgetDef, savedTemplates);

  if (savedList && !(savedList as unknown as { __textPanelListenersAttached?: boolean }).__textPanelListenersAttached) {
    const savedMarker = savedList as unknown as {
      __textPanelListenersAttached?: boolean;
      __textPanelRefresh?: () => void;
      __textPanelStorageHandler?: (event: StorageEvent) => void;
    };
    const refreshSaved = () => {
      const nextTemplates = getSavedTemplates(panel);
      renderTemplateList(savedList, options, widgetDef, nextTemplates);
    };
    const storageHandler = (event: StorageEvent) => {
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
