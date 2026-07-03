const GUIDE_KINDS = ['start', 'center', 'end'];
const DEFAULT_TOLERANCE = 6;
const SNAP_EPSILON = 0.0001;
function axisTolerance(options, axis) {
    const raw = options.tolerance;
    if (typeof raw === 'number')
        return Math.max(0, raw);
    const value = raw?.[axis];
    return Number.isFinite(value) ? Math.max(0, Number(value)) : DEFAULT_TOLERANCE;
}
function axisStep(options, axis) {
    const value = options.step?.[axis];
    return Number.isFinite(value) && Number(value) > 0 ? Number(value) : 0;
}
function rectIsUsable(rect) {
    return [rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) && rect.w > 0 && rect.h > 0;
}
function positionsForAxis(rect, axis) {
    if (axis === 'x') {
        return {
            start: rect.x,
            center: rect.x + rect.w / 2,
            end: rect.x + rect.w
        };
    }
    return {
        start: rect.y,
        center: rect.y + rect.h / 2,
        end: rect.y + rect.h
    };
}
function spanForAxis(rect, axis) {
    return axis === 'x'
        ? { start: rect.y, end: rect.y + rect.h }
        : { start: rect.x, end: rect.x + rect.w };
}
function startForAxis(rect, axis) {
    return axis === 'x' ? rect.x : rect.y;
}
function sizeForAxis(rect, axis) {
    return axis === 'x' ? rect.w : rect.h;
}
function endForAxis(rect, axis) {
    return startForAxis(rect, axis) + sizeForAxis(rect, axis);
}
function alignToStep(value, step) {
    if (!step)
        return value;
    const stepped = Math.round(value / step) * step;
    return Math.abs(stepped - value) <= SNAP_EPSILON ? stepped : null;
}
function guideRank(guide) {
    const kindRank = guide.kind === 'spacing' ? 100 : 0;
    const sameKind = guide.sourceKind === guide.targetKind ? 0 : 1;
    const targetRank = GUIDE_KINDS.indexOf(guide.targetKind);
    const sourceRank = GUIDE_KINDS.indexOf(guide.sourceKind);
    return kindRank + sameKind * 10 + targetRank * 3 + sourceRank;
}
function choiceRank(choice) {
    const firstGuide = choice.guides[0];
    return firstGuide ? guideRank(firstGuide) : Number.MAX_SAFE_INTEGER;
}
function chooseBetterChoice(current, next) {
    if (!next)
        return current;
    if (!current)
        return next;
    const distance = Math.abs(next.delta);
    const bestDistance = Math.abs(current.delta);
    if (distance < bestDistance - SNAP_EPSILON ||
        (Math.abs(distance - bestDistance) <= SNAP_EPSILON && choiceRank(next) < choiceRank(current))) {
        return next;
    }
    return current;
}
function chooseAxisAlignChoice(active, candidates, axis, options) {
    const tolerance = axisTolerance(options, axis);
    const step = axisStep(options, axis);
    const activePositions = positionsForAxis(active, axis);
    const activeSpan = spanForAxis(active, axis);
    const activeStart = axis === 'x' ? active.x : active.y;
    let best = null;
    for (const candidate of candidates) {
        if (!rectIsUsable(candidate))
            continue;
        const candidatePositions = positionsForAxis(candidate, axis);
        const candidateSpan = spanForAxis(candidate, axis);
        for (const targetKind of GUIDE_KINDS) {
            for (const sourceKind of GUIDE_KINDS) {
                const rawDelta = candidatePositions[sourceKind] - activePositions[targetKind];
                if (Math.abs(rawDelta) > tolerance)
                    continue;
                const steppedStart = alignToStep(activeStart + rawDelta, step);
                if (steppedStart == null)
                    continue;
                const delta = steppedStart - activeStart;
                const guide = {
                    axis,
                    position: candidatePositions[sourceKind],
                    spanStart: Math.min(activeSpan.start, candidateSpan.start),
                    spanEnd: Math.max(activeSpan.end, candidateSpan.end),
                    delta,
                    sourceId: candidate.id || null,
                    sourceKind,
                    targetKind,
                    kind: candidate.id === 'canvas' ? 'align' : 'align'
                };
                best = chooseBetterChoice(best, { delta, guides: [guide] });
            }
        }
    }
    return best;
}
function spacingCandidates(candidates, axis) {
    return candidates
        .filter(candidate => rectIsUsable(candidate) && candidate.id !== 'canvas')
        .sort((a, b) => startForAxis(a, axis) - startForAxis(b, axis));
}
function spacingChoiceForStart(active, axis, options, desiredStart, guides) {
    const tolerance = axisTolerance(options, axis);
    const step = axisStep(options, axis);
    const activeStart = startForAxis(active, axis);
    if (Math.abs(desiredStart - activeStart) > tolerance)
        return null;
    const steppedStart = alignToStep(desiredStart, step);
    if (steppedStart == null)
        return null;
    const delta = steppedStart - activeStart;
    return {
        delta,
        guides: guides.map(guide => ({
            ...guide,
            delta
        }))
    };
}
function spanAcross(axis, rects) {
    const spans = rects.map(rect => spanForAxis(rect, axis));
    return {
        start: Math.min(...spans.map(span => span.start)),
        end: Math.max(...spans.map(span => span.end))
    };
}
function makeSpacingGuide(axis, position, span, source, secondarySource, sourceKind, targetKind, spacing) {
    return {
        axis,
        position,
        spanStart: span.start,
        spanEnd: span.end,
        delta: 0,
        sourceId: source.id || null,
        secondarySourceId: secondarySource.id || null,
        sourceKind,
        targetKind,
        kind: 'spacing',
        spacing
    };
}
function chooseAxisSpacingChoice(active, candidates, axis, options) {
    const sorted = spacingCandidates(candidates, axis);
    const activeSize = sizeForAxis(active, axis);
    let best = null;
    for (let index = 0; index < sorted.length - 1; index += 1) {
        const left = sorted[index];
        const right = sorted[index + 1];
        if (!left || !right)
            continue;
        const gap = startForAxis(right, axis) - endForAxis(left, axis);
        if (!Number.isFinite(gap) || gap < 0)
            continue;
        const beforeLeftStart = startForAxis(left, axis) - gap - activeSize;
        const beforeSpan = spanAcross(axis, [active, left, right]);
        best = chooseBetterChoice(best, spacingChoiceForStart(active, axis, options, beforeLeftStart, [
            makeSpacingGuide(axis, beforeLeftStart + activeSize, beforeSpan, left, right, 'start', 'end', gap)
        ]));
        const afterRightStart = endForAxis(right, axis) + gap;
        const afterSpan = spanAcross(axis, [active, left, right]);
        best = chooseBetterChoice(best, spacingChoiceForStart(active, axis, options, afterRightStart, [
            makeSpacingGuide(axis, afterRightStart, afterSpan, right, left, 'end', 'start', gap)
        ]));
        const available = startForAxis(right, axis) - endForAxis(left, axis) - activeSize;
        if (available < 0)
            continue;
        const equalGap = available / 2;
        const betweenStart = endForAxis(left, axis) + equalGap;
        const betweenSpan = spanAcross(axis, [active, left, right]);
        best = chooseBetterChoice(best, spacingChoiceForStart(active, axis, options, betweenStart, [
            makeSpacingGuide(axis, betweenStart, betweenSpan, left, right, 'end', 'start', equalGap),
            makeSpacingGuide(axis, betweenStart + activeSize, betweenSpan, right, left, 'start', 'end', equalGap)
        ]));
    }
    return best;
}
function chooseAxisChoice(active, candidates, axis, options) {
    const alignChoice = chooseAxisAlignChoice(active, candidates, axis, options);
    const spacingChoice = chooseAxisSpacingChoice(active, candidates, axis, options);
    return chooseBetterChoice(alignChoice, spacingChoice);
}
export function resolveObjectSnap(active, candidates, options = {}) {
    if (!rectIsUsable(active)) {
        return { x: active.x, y: active.y, snapped: false, guides: [] };
    }
    const usableCandidates = candidates.filter(rectIsUsable);
    const xChoice = chooseAxisChoice(active, usableCandidates, 'x', options);
    const yChoice = chooseAxisChoice(active, usableCandidates, 'y', options);
    const guides = [
        ...(xChoice?.guides || []),
        ...(yChoice?.guides || [])
    ];
    return {
        x: active.x + (xChoice?.delta || 0),
        y: active.y + (yChoice?.delta || 0),
        snapped: guides.length > 0,
        guides
    };
}
