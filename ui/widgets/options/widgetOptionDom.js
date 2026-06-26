import { coercePercent } from './widgetPercentSizing.js';
function isFullAreaWidget(wrapper) {
    return wrapper.dataset.widgetSizeSlot === 'full';
}
function applyPercentStyle(wrapper, value, prop) {
    if (value == null)
        return;
    wrapper.style[prop] = `${value}%`;
}
function applyMaxBounds(wrapper, opts) {
    const maxPercent = coercePercent(opts.max);
    if (maxPercent != null) {
        wrapper.classList.add('max');
        applyPercentStyle(wrapper, maxPercent, 'maxWidth');
        applyPercentStyle(wrapper, maxPercent, 'maxHeight');
    }
    const maxWidthPercent = coercePercent(opts.maxWidth);
    if (maxWidthPercent != null) {
        wrapper.classList.add('max-width');
        applyPercentStyle(wrapper, maxWidthPercent, 'maxWidth');
    }
    const maxHeightPercent = coercePercent(opts.maxHeight);
    if (maxHeightPercent != null) {
        wrapper.classList.add('max-height');
        applyPercentStyle(wrapper, maxHeightPercent, 'maxHeight');
    }
}
function resolveWidgetPercents(opts) {
    let wPercent = null;
    let hPercent = null;
    if (opts.halfWidth) {
        wPercent = 50;
    }
    if (opts.thirdWidth) {
        wPercent = 33.333;
    }
    if (typeof opts.width === 'number' && Number.isFinite(opts.width)) {
        wPercent = opts.width;
    }
    if (typeof opts.height === 'number' && Number.isFinite(opts.height)) {
        hPercent = opts.height;
    }
    return { wPercent, hPercent };
}
function applyWidthClasses(wrapper, opts) {
    if (opts.halfWidth) {
        wrapper.classList.add('half-width');
    }
    if (opts.thirdWidth) {
        wrapper.classList.add('third-width');
    }
}
function applyPercentDatasets(wrapper, result) {
    if (result.wPercent != null) {
        wrapper.dataset.wPercent = String(result.wPercent);
        if (result.wPercent >= 100) {
            wrapper.dataset.widgetSizeSlot = 'full';
        }
    }
    if (result.hPercent != null) {
        wrapper.dataset.hPercent = String(result.hPercent);
    }
}
function applyOverflow(wrapper, opts) {
    const contentEl = wrapper.querySelector('.canvas-item-content');
    if (isFullAreaWidget(wrapper)) {
        wrapper.classList.remove('overflow');
        contentEl?.classList.remove('overflow');
        wrapper.dataset.widgetHeightMode = 'auto';
        return;
    }
    if (opts.overflow !== false) {
        wrapper.classList.add('overflow');
        contentEl?.classList.add('overflow');
        return;
    }
    wrapper.classList.remove('overflow');
    contentEl?.classList.remove('overflow');
}
export function applyWidgetDomOptions(wrapper, opts = {}) {
    applyMaxBounds(wrapper, opts);
    applyWidthClasses(wrapper, opts);
    const result = resolveWidgetPercents(opts);
    applyPercentDatasets(wrapper, result);
    applyOverflow(wrapper, opts);
    return result;
}
