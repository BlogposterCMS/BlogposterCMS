import { createAgentControlClient, createAgentSurfaceClient, SURFACE_AGENT_ACTIONS } from '/ui/shared/agent/agentSurfaceClient.js';
import { capturePreview } from './renderer/capturePreview.js';
const SURFACE_ID = 'studio.designer';
const APP_NAME = 'designer';
const VISUAL_CAPTURE_MIN_INTERVAL_MS = 7000;
const DEFAULT_BEHAVIOR_RANGE = { start: 10, end: 60 };
const EFFECT_LABELS = {
    fadeIn: 'Fade In',
    fadeOut: 'Fade Out',
    moveY: 'Move Y'
};
const DESIGNER_AGENT_ACTIONS = Object.freeze([
    ...SURFACE_AGENT_ACTIONS,
    {
        action: 'feedback.refresh',
        label: 'Refresh feedback',
        category: 'feedback',
        description: 'Publishes a fresh structured Design Studio feedback snapshot through AgentManager.'
    },
    {
        action: 'scene.next',
        label: 'Next section',
        category: 'scene',
        description: 'Selects the next section on the stage.'
    },
    {
        action: 'scene.prev',
        label: 'Previous section',
        category: 'scene',
        description: 'Selects the previous section on the stage.'
    },
    {
        action: 'scene.add',
        label: 'Add section',
        category: 'scene',
        description: 'Creates a new section and makes it active.'
    },
    {
        action: 'scene.select',
        label: 'Select section',
        category: 'scene',
        description: 'Selects a section by id.',
        params: [{ name: 'sceneId', type: 'string', required: true }]
    },
    {
        action: 'scene.update',
        label: 'Update section',
        category: 'scene',
        description: 'Renames a section or changes its background.',
        params: [
            { name: 'sceneId', type: 'string', required: false },
            { name: 'title', type: 'string', required: false },
            { name: 'background', type: 'color', required: false }
        ]
    },
    {
        action: 'insert.element',
        label: 'Insert element',
        category: 'content',
        description: 'Inserts a native text, media, shape, button or background element.',
        params: [{ name: 'type', type: 'text|media|shape|button|background', required: true }]
    },
    {
        action: 'element.select',
        label: 'Select element',
        category: 'element',
        description: 'Selects an element by instance id, DOM id or widget id.',
        params: [{ name: 'id', type: 'string', required: true }]
    },
    {
        action: 'behavior.set',
        label: 'Set behavior',
        category: 'behavior',
        description: 'Sets selected element behavior to scroll, sticky or pinned.',
        requiresSelection: true,
        params: [
            { name: 'id', type: 'string', required: false },
            { name: 'behavior', type: 'scroll|sticky|pinned', required: true }
        ]
    },
    {
        action: 'range.set',
        label: 'Set behavior range',
        category: 'behavior',
        description: 'Sets selected element scroll behavior range in percent.',
        requiresSelection: true,
        params: [
            { name: 'id', type: 'string', required: false },
            { name: 'start', type: 'number', required: true },
            { name: 'end', type: 'number', required: true }
        ]
    },
    {
        action: 'effect.set',
        label: 'Set effect',
        category: 'behavior',
        description: 'Enables or adjusts fadeIn, fadeOut or moveY effect ranges.',
        requiresSelection: true,
        params: [
            { name: 'id', type: 'string', required: false },
            { name: 'effectId', type: 'fadeIn|fadeOut|moveY', required: true },
            { name: 'enabled', type: 'boolean', required: false },
            { name: 'start', type: 'number', required: false },
            { name: 'end', type: 'number', required: false }
        ]
    },
    {
        action: 'element.update',
        label: 'Update element',
        category: 'element',
        description: 'Updates selected element name, opacity, corner radius or button content.',
        requiresSelection: true,
        params: [
            { name: 'id', type: 'string', required: false },
            { name: 'name', type: 'string', required: false },
            { name: 'opacity', type: 'number', required: false },
            { name: 'radius', type: 'number', required: false },
            { name: 'label', type: 'string', required: false },
            { name: 'href', type: 'string', required: false }
        ]
    }
]);
let lastVisualSnapshot = null;
let lastVisualSnapshotAt = 0;
function cssEscape(value) {
    return window.CSS?.escape ? window.CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}
function textOf(el, fallback = '') {
    return String(el?.textContent || fallback).replace(/\s+/g, ' ').trim();
}
function datasetOf(el, keys) {
    const data = {};
    if (!el)
        return data;
    for (const key of keys) {
        const value = el.dataset[key];
        if (value)
            data[key] = value;
    }
    return data;
}
// Keep Studio behavior agent-readable here so controllers do not scrape UI copy.
function clampPercent(value, fallback) {
    const parsed = typeof value === 'string'
        ? Number.parseFloat(value.replace('%', '').trim())
        : Number(value);
    const number = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(0, Math.min(100, Math.round(number)));
}
function rangeOf(el) {
    const start = clampPercent(el?.dataset.scrollStart, DEFAULT_BEHAVIOR_RANGE.start);
    let end = clampPercent(el?.dataset.scrollEnd, DEFAULT_BEHAVIOR_RANGE.end);
    if (end < start)
        return { start: end, end: start };
    if (end === start)
        end = Math.min(100, start + 1);
    return { start, end };
}
function parseEffectList(value) {
    if (Array.isArray(value))
        return value.filter(item => item && typeof item === 'object');
    if (typeof value !== 'string' || !value.trim())
        return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed)
            ? parsed.filter(item => item && typeof item === 'object')
            : [];
    }
    catch {
        return [];
    }
}
function effectsOf(el) {
    return parseEffectList(el?.dataset.effects)
        .filter(effect => effect.enabled !== false)
        .map(effect => {
        const id = String(effect.id || '').trim();
        const range = {
            start: clampPercent(effect.start, DEFAULT_BEHAVIOR_RANGE.start),
            end: clampPercent(effect.end, DEFAULT_BEHAVIOR_RANGE.end)
        };
        return {
            id,
            label: EFFECT_LABELS[id] || id || 'Effect',
            enabled: true,
            ...range
        };
    })
        .filter(effect => effect.id);
}
function behaviorOf(el) {
    const behavior = String(el?.dataset.behavior || 'scroll').trim().toLowerCase();
    return ['scroll', 'sticky', 'pinned'].includes(behavior) ? behavior : 'scroll';
}
function elementBounds(el) {
    const rect = el.getBoundingClientRect();
    return {
        x: Math.round(rect.x || rect.left || 0),
        y: Math.round(rect.y || rect.top || 0),
        width: Math.round(rect.width || 0),
        height: Math.round(rect.height || 0),
        xPercent: clampPercent(el.dataset.xPercent, 0),
        yPercent: clampPercent(el.dataset.yPercent, 0),
        wPercent: clampPercent(el.dataset.wPercent, 0),
        hPercent: clampPercent(el.dataset.hPercent, 0)
    };
}
function feedbackNodeId(el, fallback) {
    return el.dataset.nodeId || el.dataset.instanceId || el.id || fallback;
}
function styleSourceState(el) {
    const enabled = el.dataset.styleSourceEnabled;
    const role = el.dataset.styleSourceRole;
    const sourceId = el.dataset.styleSourceId;
    const syncLayout = el.dataset.styleSyncLayout;
    const syncDesign = el.dataset.styleSyncDesign;
    if (!enabled && !role && !sourceId && !syncLayout && !syncDesign)
        return null;
    return {
        enabled: enabled !== 'false',
        role: role || (sourceId ? 'follower' : null),
        sourceId: sourceId || null,
        syncLayout: syncLayout !== 'false',
        syncDesign: syncDesign !== 'false'
    };
}
function uniqueHtmlElements(elements) {
    const seen = new Set();
    return elements.filter(el => {
        if (seen.has(el))
            return false;
        seen.add(el);
        return true;
    });
}
function layoutElements() {
    const root = document.getElementById('layoutRoot');
    return uniqueHtmlElements([
        ...(root ? [root] : []),
        ...Array.from(document.querySelectorAll('.layout-root, .layout-container'))
    ]);
}
function layoutParentId(el) {
    let parent = el.parentElement;
    while (parent) {
        if (parent.matches('.layout-root, .layout-container')) {
            return feedbackNodeId(parent, 'layout-parent');
        }
        parent = parent.parentElement;
    }
    return null;
}
function layoutNodeRole(el) {
    if (el.id === 'layoutRoot' || el.classList.contains('layout-root'))
        return 'layout-root';
    if (el.dataset.workarea === 'true')
        return 'workarea';
    return 'layout-container';
}
function layoutNodeFeedback(el, index) {
    const id = feedbackNodeId(el, `layout-node-${index + 1}`);
    const directChildren = Array.from(el.children).filter(child => child.matches?.('.layout-container, .layout-root')).length;
    return {
        id,
        role: layoutNodeRole(el),
        parentId: layoutParentId(el),
        label: el.dataset.label || el.dataset.nodeId || el.dataset.designRef || id,
        selected: el.classList.contains('layout-container--active') || el.classList.contains('tree-selected'),
        workarea: el.dataset.workarea === 'true',
        containsWorkspace: Boolean(el.querySelector(':scope > #workspaceMain, :scope > .builder-grid')),
        childContainerCount: directChildren,
        mode: el.dataset.layoutMode || 'free',
        settings: {
            gap: el.dataset.layoutGap || null,
            padding: el.dataset.layoutPadding || null,
            background: el.dataset.layoutBackground || el.dataset.sceneBackground || null,
            designRef: el.dataset.designRef || null
        },
        styleSource: styleSourceState(el),
        bounds: elementBounds(el)
    };
}
function widgetPlacementFeedback() {
    return Array.from(document.querySelectorAll('.canvas-item')).map((el, index) => {
        const workarea = el.closest('.layout-container, .layout-root');
        return {
            id: feedbackNodeId(el, `widget-placement-${index + 1}`),
            role: 'widget-placement',
            widgetId: el.dataset.widgetId || null,
            label: textOf(el.querySelector('.canvas-item-content'), el.dataset.elementName || el.dataset.widgetId || `Widget ${index + 1}`),
            sceneId: el.dataset.sceneId || null,
            sceneTitle: el.dataset.sceneTitle || null,
            workareaId: el.dataset.workareaId || workarea?.dataset.nodeId || null,
            selected: el.classList.contains('selected'),
            global: el.dataset.global === 'true',
            layer: el.dataset.layer || null,
            behavior: behaviorOf(el),
            range: rangeOf(el),
            effects: effectsOf(el),
            styleSource: styleSourceState(el),
            bounds: elementBounds(el)
        };
    });
}
function styleSourceEntry(node) {
    const styleSource = node.styleSource;
    if (!styleSource)
        return null;
    return {
        objectId: node.id || null,
        objectRole: node.role || null,
        enabled: styleSource.enabled !== false,
        role: styleSource.role || null,
        sourceId: styleSource.sourceId || null,
        syncLayout: styleSource.syncLayout !== false,
        syncDesign: styleSource.syncDesign !== false
    };
}
function styleSourceRelationships(layoutNodes, widgetPlacements) {
    const entries = [...layoutNodes, ...widgetPlacements]
        .map(styleSourceEntry)
        .filter(Boolean);
    const sources = entries.filter(entry => entry.enabled !== false && entry.role === 'source');
    const followers = entries.filter(entry => entry.enabled !== false && Boolean(entry.sourceId));
    const disabled = entries.filter(entry => entry.enabled === false);
    return {
        sourceCount: sources.length,
        followerCount: followers.length,
        disabledCount: disabled.length,
        sources,
        followers,
        disabled
    };
}
function visualFeedbackState(visual) {
    return {
        available: Boolean(visual.available),
        kind: visual.kind || null,
        source: visual.source || null,
        capturedAt: visual.capturedAt || null,
        reused: Boolean(visual.reused),
        reason: visual.reason || visual.reuseReason || null,
        width: visual.width || null,
        height: visual.height || null,
        previewBytes: Number(visual.previewDataUrl ? String(visual.previewDataUrl).length : visual.previewBytes || 0)
    };
}
function designerFeedbackWarnings(visual, layoutNodes, widgets) {
    const warnings = [];
    const hasLayoutRoot = Boolean(document.getElementById('layoutRoot'));
    const hasCommandPort = Boolean(window.blogposterDesignerCommands && typeof window.blogposterDesignerCommands.execute === 'function');
    const zeroSizeWidgets = widgets.filter(widget => {
        const bounds = widget.bounds;
        return bounds && (!bounds.width || !bounds.height);
    });
    if (!hasLayoutRoot || layoutNodes.length === 0) {
        warnings.push({
            code: 'DESIGNER_AGENT_FEEDBACK_NO_LAYOUT_ROOT',
            severity: 'warning',
            message: 'Design Studio feedback could not find #layoutRoot or layout containers.'
        });
    }
    if (!hasCommandPort) {
        warnings.push({
            code: 'DESIGNER_AGENT_FEEDBACK_NO_COMMAND_PORT',
            severity: 'warning',
            message: 'window.blogposterDesignerCommands.execute is missing, so write commands can only use fallback DOM actions.'
        });
    }
    if (zeroSizeWidgets.length > 0) {
        warnings.push({
            code: 'DESIGNER_AGENT_FEEDBACK_ZERO_WIDGET_BOUNDS',
            severity: 'warning',
            message: 'One or more widget placements reported zero-size bounds.',
            count: zeroSizeWidgets.length
        });
    }
    if (!visual.available) {
        warnings.push({
            code: 'DESIGNER_AGENT_FEEDBACK_VISUAL_PREVIEW_UNAVAILABLE',
            severity: 'info',
            message: 'Structured feedback is available, but the optional visual preview could not be captured.'
        });
    }
    return warnings;
}
function feedbackStatus(warnings) {
    if (warnings.some(warning => warning.severity === 'error'))
        return 'blocked';
    if (warnings.some(warning => warning.severity === 'warning'))
        return 'degraded';
    return 'ready';
}
function buildDesignerAgentFeedback(context, visual, activeSceneId, activeSceneTitle) {
    const layoutNodes = layoutElements().map(layoutNodeFeedback);
    const widgetPlacements = widgetPlacementFeedback();
    const warnings = designerFeedbackWarnings(visual, layoutNodes, widgetPlacements);
    const status = feedbackStatus(warnings);
    return {
        version: 1,
        channel: 'design-studio.agent-feedback',
        source: 'ui/designer/app/agentSurface.ts',
        guide: 'docs/design-studio-agent-feedback.md',
        status,
        reason: context.reason,
        generatedAt: new Date().toISOString(),
        contracts: {
            transport: 'AgentManager/AppLoader agentSurface',
            structuredSnapshot: true,
            commandPort: !warnings.some(warning => warning.code === 'DESIGNER_AGENT_FEEDBACK_NO_COMMAND_PORT'),
            visualPreview: Boolean(visual.available),
            stableBounds: true
        },
        viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            devicePixelRatio: window.devicePixelRatio || 1
        },
        document: {
            designId: document.body.dataset.designId || null,
            designVersion: document.body.dataset.designVersion || null,
            activeSceneId,
            activeSceneTitle,
            mode: document.body.classList.contains('builder-mode') ? 'builder' : 'unknown',
            route: window.location.pathname
        },
        layoutTree: {
            rootId: layoutNodes[0]?.id || null,
            nodeCount: layoutNodes.length,
            workareaCount: layoutNodes.filter(node => node.workarea === true).length,
            nodes: layoutNodes
        },
        widgetPlacements,
        styleSources: styleSourceRelationships(layoutNodes, widgetPlacements),
        selection: selectionState(),
        visual: visualFeedbackState(visual),
        warnings
    };
}
function behaviorElementNode(el, index, activeSceneId = '') {
    const effects = effectsOf(el);
    const behavior = behaviorOf(el);
    const sceneId = el.dataset.sceneId || '';
    return {
        id: el.dataset.instanceId || el.id || `element-${index + 1}`,
        widgetId: el.dataset.widgetId || null,
        label: textOf(el.querySelector('.canvas-item-content'), el.dataset.elementName || el.dataset.widgetId || `Element ${index + 1}`),
        sceneId,
        sceneTitle: el.dataset.sceneTitle || null,
        selected: el.classList.contains('selected'),
        visibleInActiveScene: !sceneId || !activeSceneId || sceneId === activeSceneId,
        behavior,
        behaviorState: el.dataset.behaviorState || null,
        range: rangeOf(el),
        effects,
        effectCount: effects.length,
        bounds: elementBounds(el),
        cues: {
            badge: Boolean(el.querySelector(':scope > .scene-behavior-badge')),
            range: Boolean(el.querySelector(':scope > .scene-behavior-range-cue')),
            effectGuide: Boolean(el.querySelector(':scope > .scene-stage-effect-guide')),
            stageHud: Boolean(el.querySelector(':scope > .scene-stage-hud'))
        }
    };
}
function stageBehaviorMap(activeSceneId = '') {
    const elements = Array.from(document.querySelectorAll('.canvas-item'))
        .map((el, index) => behaviorElementNode(el, index, activeSceneId));
    const behaviorElements = elements.filter(element => (element.behavior !== 'scroll' || Number(element.effectCount || 0) > 0));
    const behaviorCounts = elements.reduce((counts, element) => {
        const key = String(element.behavior || 'scroll');
        counts[key] = (counts[key] || 0) + 1;
        return counts;
    }, {});
    return {
        activeSceneId,
        elementCount: elements.length,
        behaviorElementCount: behaviorElements.length,
        effectElementCount: elements.filter(element => Number(element.effectCount || 0) > 0).length,
        selectedElementId: elements.find(element => element.selected)?.id || null,
        behaviorCounts,
        activeSceneElementIds: elements
            .filter(element => element.visibleInActiveScene)
            .map(element => element.id),
        elements
    };
}
function clickFirst(selector) {
    const target = document.querySelector(selector);
    if (!target || target.hasAttribute('disabled'))
        return false;
    target.click();
    return true;
}
function sectionNodes() {
    return Array.from(document.querySelectorAll('.scene-section-item')).map((section, index) => {
        const sceneId = section.dataset.sceneId || `section-${index + 1}`;
        const sceneElements = Array.from(document.querySelectorAll(`.canvas-item[data-scene-id="${cssEscape(sceneId)}"]`));
        const behaviorCount = sceneElements.filter(el => behaviorOf(el) !== 'scroll' || effectsOf(el).length > 0).length;
        return {
            id: sceneId,
            role: 'section',
            label: textOf(section.querySelector('.scene-section-title'), `Section ${index + 1}`),
            active: section.classList.contains('active'),
            meta: {
                number: textOf(section.querySelector('.scene-section-number'), String(index + 1)),
                detail: textOf(section.querySelector('.scene-section-meta')),
                elementCount: sceneElements.length,
                behaviorCount,
                ...datasetOf(section, ['sceneId'])
            }
        };
    });
}
function layerNodes() {
    return Array.from(document.querySelectorAll('.scene-layer-item')).map((layer, index) => {
        const id = layer.dataset.instanceId || layer.dataset.widgetId || `layer-${index + 1}`;
        const canvasItem = document.querySelector(`.canvas-item[data-instance-id="${cssEscape(id)}"], .canvas-item[data-widget-id="${cssEscape(id)}"]`);
        const effects = effectsOf(canvasItem);
        return {
            id,
            role: 'layer',
            label: textOf(layer.querySelector('.scene-layer-title'), textOf(layer, `Layer ${index + 1}`)),
            active: layer.classList.contains('scene-layer-item--active'),
            meta: {
                ...datasetOf(layer, ['widgetId', 'behavior', 'sceneId']),
                range: canvasItem ? rangeOf(canvasItem) : null,
                effects,
                effectCount: effects.length,
                behaviorState: canvasItem?.dataset.behaviorState || null
            }
        };
    });
}
function selectedCanvasItem() {
    return document.querySelector('.canvas-item.selected');
}
function selectionState() {
    const selected = selectedCanvasItem();
    if (!selected)
        return null;
    const effects = effectsOf(selected);
    return {
        id: selected.dataset.instanceId || selected.id || null,
        widgetId: selected.dataset.widgetId || null,
        sceneId: selected.dataset.sceneId || null,
        sceneTitle: selected.dataset.sceneTitle || null,
        behavior: selected.dataset.behavior || 'scroll',
        scrollStart: selected.dataset.scrollStart || null,
        scrollEnd: selected.dataset.scrollEnd || null,
        range: rangeOf(selected),
        effects,
        effectCount: effects.length,
        bounds: elementBounds(selected),
        label: textOf(selected.querySelector('.canvas-item-content'), selected.dataset.widgetId || 'Selected element')
    };
}
function availableControls() {
    const controls = [];
    document.querySelectorAll('[data-stage-scene-action]').forEach(button => {
        controls.push({
            id: `scene.${button.dataset.stageSceneAction}`,
            role: 'scene-command',
            label: button.getAttribute('aria-label') || textOf(button),
            disabled: button.hasAttribute('disabled')
        });
    });
    document.querySelectorAll('[data-tool]').forEach(button => {
        controls.push({
            id: `tool.${button.dataset.tool}`,
            role: 'insert-tool',
            label: button.getAttribute('aria-label') || textOf(button, button.dataset.tool || '')
        });
    });
    document.querySelectorAll('[data-stage-behavior]').forEach(button => {
        controls.push({
            id: `behavior.${button.dataset.stageBehavior}`,
            role: 'behavior-command',
            label: button.getAttribute('aria-label') || textOf(button, button.dataset.stageBehavior || ''),
            active: button.classList.contains('active')
        });
    });
    return controls;
}
async function captureStageVisual(reason) {
    const gridEl = document.getElementById('workspaceMain');
    if (!gridEl) {
        return { available: false, reason: 'missing-stage' };
    }
    const shouldCapture = reason === 'start' || reason === 'manual' || reason === 'command' || reason === 'refresh' || !lastVisualSnapshot;
    const now = Date.now();
    if (!shouldCapture && lastVisualSnapshot) {
        return { ...lastVisualSnapshot, reused: true, reuseReason: reason };
    }
    if (lastVisualSnapshot && now - lastVisualSnapshotAt < VISUAL_CAPTURE_MIN_INTERVAL_MS && reason !== 'command' && reason !== 'refresh') {
        return { ...lastVisualSnapshot, reused: true, reuseReason: 'rate-limit' };
    }
    const previewDataUrl = await capturePreview(gridEl);
    if (!previewDataUrl) {
        return {
            available: false,
            reason: 'capture-empty',
            activeSceneId: document.body.dataset.activeScene || ''
        };
    }
    lastVisualSnapshot = {
        available: true,
        kind: 'stage-preview',
        source: 'designer.capturePreview',
        capturedAt: new Date().toISOString(),
        previewDataUrl,
        width: Math.round(gridEl.getBoundingClientRect().width || gridEl.clientWidth || 0),
        height: Math.round(gridEl.getBoundingClientRect().height || gridEl.clientHeight || 0),
        activeSceneId: document.body.dataset.activeScene || '',
        activeSceneTitle: document.body.dataset.activeSceneTitle || ''
    };
    lastVisualSnapshotAt = now;
    return lastVisualSnapshot;
}
export async function buildDesignerAgentSnapshot(context = { reason: 'manual' }) {
    const sections = sectionNodes();
    const layers = layerNodes();
    const activeSceneId = document.body.dataset.activeScene || '';
    const activeSceneTitle = document.body.dataset.activeSceneTitle || '';
    const behaviorMap = stageBehaviorMap(activeSceneId);
    const visual = await captureStageVisual(context.reason);
    const feedback = buildDesignerAgentFeedback(context, visual, activeSceneId, activeSceneTitle);
    const feedbackWarnings = Array.isArray(feedback.warnings) ? feedback.warnings.length : 0;
    const feedbackLayoutTree = feedback.layoutTree;
    const feedbackWidgetPlacements = Array.isArray(feedback.widgetPlacements) ? feedback.widgetPlacements : [];
    return {
        appName: APP_NAME,
        surfaceId: SURFACE_ID,
        surfaceType: 'studio-builder',
        title: 'Design Studio',
        route: window.location.pathname,
        url: window.location.href,
        summary: {
            activeScene: activeSceneTitle || activeSceneId,
            sectionCount: sections.length,
            layerCount: layers.length,
            behaviorElementCount: behaviorMap.behaviorElementCount,
            effectElementCount: behaviorMap.effectElementCount,
            hasSelection: Boolean(selectedCanvasItem()),
            feedbackStatus: feedback.status,
            feedbackWarningCount: feedbackWarnings
        },
        state: {
            activeSceneId,
            activeSceneTitle,
            designId: document.body.dataset.designId || null,
            designVersion: document.body.dataset.designVersion || null,
            mode: document.body.classList.contains('builder-mode') ? 'builder' : 'unknown',
            behaviorMap,
            feedback
        },
        selection: selectionState(),
        tree: [
            {
                id: 'sections',
                role: 'section-list',
                label: 'Sections',
                children: sections
            },
            {
                id: 'layers',
                role: 'layer-list',
                label: 'Layers',
                children: layers
            }
        ],
        controls: availableControls(),
        actions: DESIGNER_AGENT_ACTIONS,
        visual,
        feedback,
        meta: {
            agentFeedback: {
                channel: 'design-studio.agent-feedback',
                version: 1,
                status: feedback.status,
                warningCount: feedbackWarnings,
                guide: 'docs/design-studio-agent-feedback.md'
            }
        },
        metrics: {
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            visualPreviewAvailable: Boolean(visual.available),
            visualPreviewBytes: Number(visual.previewDataUrl ? String(visual.previewDataUrl).length : visual.previewBytes || 0),
            feedbackWarningCount: feedbackWarnings,
            layoutNodeCount: Number(feedbackLayoutTree.nodeCount || 0),
            widgetPlacementCount: feedbackWidgetPlacements.length
        }
    };
}
function commandAction(command) {
    return String(command.action || command.type || '').trim();
}
function commandParam(command, key) {
    const params = command.params && typeof command.params === 'object' ? command.params : {};
    return params[key];
}
function handleSceneCommand(action, command) {
    if (action === 'scene.next') {
        return { handled: clickFirst('[data-stage-scene-action="next"]') };
    }
    if (action === 'scene.prev' || action === 'scene.previous') {
        return { handled: clickFirst('[data-stage-scene-action="prev"]') };
    }
    if (action === 'scene.add') {
        return { handled: clickFirst('[data-stage-scene-action="add"]') };
    }
    if (action === 'scene.select') {
        const rawSceneId = String(commandParam(command, 'sceneId') || command.target || '').trim();
        if (!rawSceneId)
            return { handled: false, reason: 'missing-scene-id' };
        return { handled: clickFirst(`.scene-section-item[data-scene-id="${cssEscape(rawSceneId)}"]`) };
    }
    return { handled: false };
}
function handleInsertCommand(command) {
    const rawType = String(commandParam(command, 'type') || command.value || command.target || '').trim();
    const type = rawType === 'image' ? 'media' : rawType;
    if (!type)
        return { handled: false, reason: 'missing-insert-type' };
    const direct = clickFirst(`[data-empty-insert="${cssEscape(type)}"]`);
    if (direct)
        return { handled: true, via: 'empty-state' };
    return { handled: clickFirst(`[data-tool="${cssEscape(type)}"]`), via: 'topbar-tool' };
}
function handleElementCommand(action, command) {
    if (action === 'element.select') {
        const rawId = String(commandParam(command, 'id') || command.target || '').trim();
        if (!rawId)
            return { handled: false, reason: 'missing-element-id' };
        const selector = [
            `.canvas-item[data-instance-id="${cssEscape(rawId)}"]`,
            `.canvas-item#${cssEscape(rawId)}`,
            `.canvas-item[data-widget-id="${cssEscape(rawId)}"]`
        ].join(',');
        return { handled: clickFirst(selector) };
    }
    if (action === 'behavior.set') {
        const behavior = String(commandParam(command, 'behavior') || command.value || command.target || '').trim();
        if (!behavior)
            return { handled: false, reason: 'missing-behavior' };
        return { handled: clickFirst(`[data-stage-behavior="${cssEscape(behavior)}"]`) };
    }
    return { handled: false };
}
export async function handleDesignerAgentCommand(command) {
    const commandPort = window.blogposterDesignerCommands;
    if (commandPort && typeof commandPort.execute === 'function') {
        const result = await commandPort.execute(command);
        if (result && result.handled !== false)
            return result;
    }
    const action = commandAction(command);
    if (action === 'feedback.refresh')
        return { handled: true, feedback: 'refresh-requested' };
    if (action.startsWith('scene.'))
        return handleSceneCommand(action, command);
    if (action === 'insert' || action === 'insert.element')
        return handleInsertCommand(command);
    if (action.startsWith('element.') || action.startsWith('behavior.'))
        return handleElementCommand(action, command);
    return { handled: false, reason: 'unsupported-command', action };
}
export function startDesignerAgentSurface() {
    if (typeof window === 'undefined')
        return null;
    const root = document.getElementById('builderRow') || document.body;
    const client = createAgentSurfaceClient({
        appName: APP_NAME,
        surfaceId: SURFACE_ID,
        surfaceType: 'studio-builder',
        title: 'Design Studio',
        root,
        snapshotIntervalMs: 3000,
        pollIntervalMs: 1400,
        buildSnapshot: buildDesignerAgentSnapshot,
        handleCommand: handleDesignerAgentCommand
    });
    const control = createAgentControlClient({
        appName: APP_NAME,
        surfaceId: SURFACE_ID,
        surfaceType: 'studio-builder',
        title: 'Design Studio'
    });
    client.start();
    window.blogposterAgent = {
        ...(window.blogposterAgent || {}),
        designer: client,
        designerControl: control
    };
    return client;
}
