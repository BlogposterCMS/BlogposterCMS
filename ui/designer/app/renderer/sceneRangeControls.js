export const MIN_SCENE_RANGE_GAP = 1;
export function clampScenePercent(value, fallback = 0) {
    const parsed = typeof value === 'string'
        ? Number.parseFloat(value.replace('%', '').trim())
        : Number(value);
    const num = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(0, Math.min(100, Math.round(num)));
}
export function normalizeSceneRange(startValue, endValue) {
    let start = clampScenePercent(startValue, 10);
    let end = clampScenePercent(endValue, 60);
    if (start > end) {
        const nextStart = end;
        end = start;
        start = nextStart;
    }
    if (start === end) {
        end = Math.min(100, start + MIN_SCENE_RANGE_GAP);
        if (end === start)
            start = Math.max(0, end - MIN_SCENE_RANGE_GAP);
    }
    return { start, end };
}
export function rangeFromPointer(clientX, rect, handle, currentRange) {
    const width = Math.max(1, Number(rect.width) || 1);
    const left = Number(rect.left) || 0;
    const pct = clampScenePercent(((clientX - left) / width) * 100);
    const range = normalizeSceneRange(currentRange.start, currentRange.end);
    if (handle === 'start') {
        return {
            start: Math.min(pct, range.end - MIN_SCENE_RANGE_GAP),
            end: range.end
        };
    }
    return {
        start: range.start,
        end: Math.max(pct, range.start + MIN_SCENE_RANGE_GAP)
    };
}
