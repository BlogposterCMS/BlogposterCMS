export const RESPONSIVE_PLACEMENT_VERSION = 1;
export const RESPONSIVE_VIEWPORT_MIN = 320;
export const RESPONSIVE_VIEWPORT_MAX = 3840;
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function finiteNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}
function clamp(value, min, max, fallback) {
    return Math.max(min, Math.min(max, finiteNumber(value, fallback)));
}
export function normalizeResponsiveWidthRange(value, fallbackWidth = 1280) {
    const source = isRecord(value) ? value : {};
    const fallback = clamp(fallbackWidth, RESPONSIVE_VIEWPORT_MIN, RESPONSIVE_VIEWPORT_MAX, 1280);
    const rawMin = clamp(source.minWidth, RESPONSIVE_VIEWPORT_MIN, RESPONSIVE_VIEWPORT_MAX, fallback);
    const rawMax = clamp(source.maxWidth, RESPONSIVE_VIEWPORT_MIN, RESPONSIVE_VIEWPORT_MAX, fallback);
    return {
        minWidth: Math.round(Math.min(rawMin, rawMax)),
        maxWidth: Math.round(Math.max(rawMin, rawMax))
    };
}
export function defaultResponsiveWidthRange(width) {
    const viewportWidth = clamp(width, RESPONSIVE_VIEWPORT_MIN, RESPONSIVE_VIEWPORT_MAX, 1280);
    if (viewportWidth <= 600) {
        return { minWidth: RESPONSIVE_VIEWPORT_MIN, maxWidth: 600 };
    }
    if (viewportWidth <= 1024) {
        return { minWidth: 601, maxWidth: 1024 };
    }
    return { minWidth: 1025, maxWidth: RESPONSIVE_VIEWPORT_MAX };
}
export function normalizeResponsivePlacementGeometry(value, fallback = {}) {
    const source = isRecord(value) ? value : {};
    const fallbackWidth = Math.max(1, finiteNumber(fallback.widthPx, 1));
    const fallbackHeight = Math.max(1, finiteNumber(fallback.heightPx, 1));
    const widthPx = Math.max(1, finiteNumber(source.widthPx, fallbackWidth));
    const heightPx = Math.max(1, finiteNumber(source.heightPx, fallbackHeight));
    const minWidthPx = Math.max(1, Math.min(widthPx, finiteNumber(source.minWidthPx, fallback.minWidthPx ?? 1)));
    const minHeightPx = Math.max(1, Math.min(heightPx, finiteNumber(source.minHeightPx, fallback.minHeightPx ?? 1)));
    return {
        centerXPercent: clamp(source.centerXPercent, -100, 200, finiteNumber(fallback.centerXPercent, 50)),
        yPx: Math.max(0, finiteNumber(source.yPx, finiteNumber(fallback.yPx, 0))),
        widthPx,
        heightPx,
        minWidthPx,
        minHeightPx
    };
}
export function normalizeResponsivePlacementContract(value, fallbackGeometry) {
    const source = isRecord(value) ? value : {};
    const base = normalizeResponsivePlacementGeometry(source.base, fallbackGeometry);
    const rules = Array.isArray(source.rules)
        ? source.rules
            .filter(isRecord)
            .map((rule, index) => {
            const range = normalizeResponsiveWidthRange(rule, 1280);
            return {
                id: String(rule.id || `rule-${index + 1}`),
                ...range,
                geometry: normalizeResponsivePlacementGeometry(rule.geometry, base)
            };
        })
        : [];
    return {
        version: RESPONSIVE_PLACEMENT_VERSION,
        base,
        rules
    };
}
export function responsiveRuleForWidth(contract, width) {
    const viewportWidth = clamp(width, RESPONSIVE_VIEWPORT_MIN, RESPONSIVE_VIEWPORT_MAX, 1280);
    return contract.rules
        .filter(rule => viewportWidth >= rule.minWidth && viewportWidth <= rule.maxWidth)
        .sort((left, right) => {
        const leftSpan = left.maxWidth - left.minWidth;
        const rightSpan = right.maxWidth - right.minWidth;
        return leftSpan === rightSpan ? contract.rules.indexOf(right) - contract.rules.indexOf(left) : leftSpan - rightSpan;
    })[0] || null;
}
export function resolveResponsivePlacementGeometry(contract, width) {
    return responsiveRuleForWidth(contract, width)?.geometry || contract.base;
}
export function projectResponsiveHorizontalPosition(geometry, width) {
    const viewportWidth = Math.max(1, finiteNumber(width, 1280));
    const widgetWidth = Math.max(1, finiteNumber(geometry.widthPx, 1));
    const projected = ((geometry.centerXPercent / 100) * viewportWidth) - (widgetWidth / 2);
    if (widgetWidth > viewportWidth) {
        // A fixed-width object cannot fully fit inside a narrower viewport.
        // Keep the overflow symmetric until the user authors a smaller responsive
        // variant instead of silently distorting the object.
        return (viewportWidth - widgetWidth) / 2;
    }
    return Math.max(0, Math.min(viewportWidth - widgetWidth, projected));
}
export function upsertResponsivePlacementRule(contract, width, rangeValue, geometryValue) {
    const viewportWidth = clamp(width, RESPONSIVE_VIEWPORT_MIN, RESPONSIVE_VIEWPORT_MAX, 1280);
    const range = normalizeResponsiveWidthRange(rangeValue, viewportWidth);
    const geometry = normalizeResponsivePlacementGeometry(geometryValue, contract.base);
    const activeRule = responsiveRuleForWidth(contract, viewportWidth);
    const activeIndex = activeRule ? contract.rules.indexOf(activeRule) : -1;
    const rule = {
        id: activeRule?.id || `viewport-${Math.round(viewportWidth)}-${contract.rules.length + 1}`,
        ...range,
        geometry
    };
    const rules = [...contract.rules];
    if (activeIndex >= 0)
        rules.splice(activeIndex, 1, rule);
    else
        rules.push(rule);
    return {
        contract: {
            version: RESPONSIVE_PLACEMENT_VERSION,
            base: contract.base,
            rules
        },
        rule
    };
}
