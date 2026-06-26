export function parseMetadata(value) {
    if (!value)
        return {};
    if (typeof value === 'object' && !Array.isArray(value)) {
        return { ...value };
    }
    if (typeof value !== 'string')
        return {};
    try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return { ...parsed };
        }
    }
    catch { }
    return {};
}
export function normalizeEffects(value) {
    if (!value)
        return [];
    if (Array.isArray(value)) {
        return value.filter(effect => effect && typeof effect === 'object');
    }
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return normalizeEffects(parsed);
        }
        catch {
            return [];
        }
    }
    return [];
}
function normalizeToken(value) {
    if (typeof value !== 'string')
        return '';
    return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}
export function getSceneMetadata(item = {}) {
    const code = item?.code && typeof item.code === 'object' ? item.code : {};
    return {
        ...parseMetadata(code.metadata),
        ...parseMetadata(code.meta),
        ...parseMetadata(item.metadata),
        ...parseMetadata(item.meta),
    };
}
export function readSceneValue(item, meta, keys) {
    for (const key of keys) {
        const val = item?.[key] ?? meta?.[key];
        if (val !== null && val !== undefined && val !== '')
            return val;
    }
    return undefined;
}
function setOptionalDataset(el, name, value) {
    if (value === null || value === undefined || value === '')
        return;
    el.dataset[name] = String(value);
}
function clamp01(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.min(1, value));
}
export function normalizeRuntimeOpacity(value) {
    if (value === null || value === undefined || value === '')
        return null;
    const raw = typeof value === 'string' ? parseFloat(value) : Number(value);
    if (!Number.isFinite(raw))
        return null;
    return clamp01(raw > 1 ? raw / 100 : raw);
}
function normalizeRuntimeRadius(value) {
    if (value === null || value === undefined || value === '')
        return null;
    const raw = typeof value === 'string' ? parseFloat(value) : Number(value);
    return Number.isFinite(raw) ? Math.max(0, raw) : null;
}
export function applyItemAppearance(wrapper) {
    const opacity = normalizeRuntimeOpacity(wrapper.dataset.opacity);
    if (opacity !== null)
        wrapper.style.opacity = String(opacity);
    const radius = normalizeRuntimeRadius(wrapper.dataset.radius);
    const content = wrapper.querySelector(':scope > .canvas-item-content');
    if (content && radius !== null)
        content.style.borderRadius = `${Number(radius.toFixed(2))}px`;
}
export function applySceneMetadata(wrapper, item = {}) {
    const meta = getSceneMetadata(item);
    const behavior = normalizeToken(readSceneValue(item, meta, ['behavior', 'behaviour'])) || 'scroll';
    const sceneId = readSceneValue(item, meta, ['sceneId', 'scene_id']);
    const sceneTitle = readSceneValue(item, meta, ['sceneTitle', 'scene_title']);
    const sceneBackground = readSceneValue(item, meta, ['sceneBackground', 'scene_background']);
    const scrollStart = readSceneValue(item, meta, [
        'scrollStart',
        'scroll_start',
        'scrollRangeStart',
        'scroll_range_start',
    ]);
    const scrollEnd = readSceneValue(item, meta, [
        'scrollEnd',
        'scroll_end',
        'scrollRangeEnd',
        'scroll_range_end',
    ]);
    const elementName = readSceneValue(item, meta, ['elementName', 'element_name', 'name']);
    const opacity = readSceneValue(item, meta, ['opacity']);
    const radius = readSceneValue(item, meta, ['radius', 'cornerRadius', 'corner_radius']);
    wrapper.dataset.behavior = behavior;
    wrapper.classList.add('scene-runtime-item', `scene-runtime-item--${behavior}`);
    setOptionalDataset(wrapper, 'sceneId', sceneId);
    setOptionalDataset(wrapper, 'sceneTitle', sceneTitle);
    setOptionalDataset(wrapper, 'sceneBackground', sceneBackground);
    setOptionalDataset(wrapper, 'scrollStart', scrollStart);
    setOptionalDataset(wrapper, 'scrollEnd', scrollEnd);
    setOptionalDataset(wrapper, 'elementName', elementName);
    setOptionalDataset(wrapper, 'opacity', opacity);
    setOptionalDataset(wrapper, 'radius', radius);
    const opacityValue = normalizeRuntimeOpacity(opacity);
    if (opacityValue !== null)
        wrapper.style.opacity = String(opacityValue);
    const effects = normalizeEffects(readSceneValue(item, meta, ['effects']));
    if (effects.length) {
        wrapper.dataset.effects = JSON.stringify(effects);
        wrapper.classList.add('scene-runtime-item--with-effects');
    }
}
export function mergeSceneMetaIntoCode(code, item = {}) {
    if (!code || typeof code !== 'object')
        return code;
    const meta = getSceneMetadata({ ...item, code });
    const behavior = readSceneValue(item, meta, ['behavior', 'behaviour']);
    const sceneId = readSceneValue(item, meta, ['sceneId', 'scene_id']);
    const sceneTitle = readSceneValue(item, meta, ['sceneTitle', 'scene_title']);
    const sceneBackground = readSceneValue(item, meta, ['sceneBackground', 'scene_background']);
    const scrollStart = readSceneValue(item, meta, ['scrollStart', 'scroll_start']);
    const scrollEnd = readSceneValue(item, meta, ['scrollEnd', 'scroll_end']);
    const elementName = readSceneValue(item, meta, ['elementName', 'element_name', 'name']);
    const opacity = readSceneValue(item, meta, ['opacity']);
    const radius = readSceneValue(item, meta, ['radius', 'cornerRadius', 'corner_radius']);
    const effects = normalizeEffects(readSceneValue(item, meta, ['effects']));
    const merged = {
        ...meta,
        ...(behavior ? { behavior } : {}),
        ...(sceneId ? { sceneId } : {}),
        ...(sceneTitle ? { sceneTitle } : {}),
        ...(sceneBackground ? { sceneBackground } : {}),
        ...(scrollStart ? { scrollStart } : {}),
        ...(scrollEnd ? { scrollEnd } : {}),
        ...(elementName ? { elementName } : {}),
        ...(opacity !== undefined ? { opacity } : {}),
        ...(radius !== undefined ? { radius } : {}),
        ...(effects.length ? { effects } : {}),
    };
    return { ...code, meta: merged };
}
