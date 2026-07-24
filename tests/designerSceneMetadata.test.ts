/**
 * @jest-environment jsdom
 */

import { getCurrentLayoutForLayer } from '../ui/designer/app/managers/gridManager';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('/ui/runtime/main/canvasGrid.js', () => ({
  init: jest.fn()
}));

describe('designer scene metadata', () => {
  it('keeps the scene inspector grouped into compact modes', () => {
    const rendererSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/builderRenderer.ts'),
      'utf8'
    );
    const sceneBuilderCss = fs.readFileSync(
      path.join(__dirname, '../apps/designer/assets/css/designer.css'),
      'utf8'
    );

    expect(rendererSource).toContain('class="scene-inspector-modebar"');
    expect(rendererSource).toContain('data-inspector-mode="content"');
    expect(rendererSource).toContain('data-inspector-mode="behavior"');
    expect(rendererSource).toContain('data-inspector-mode="style"');
    expect(rendererSource).toContain('data-inspector-panel="content"');
    expect(rendererSource).toContain('data-inspector-panel="behavior"');
    expect(rendererSource).toContain('data-inspector-panel="style"');
    expect(sceneBuilderCss).toContain('.scene-inspector[data-active-mode=content]');
  });

  it('sets the initial inspector mode on the created inspector element', () => {
    const rendererSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/builderRenderer.ts'),
      'utf8'
    );

    expect(rendererSource).toContain('function setInspectorMode(mode, inspectorEl = sceneInspector)');
    expect(rendererSource).toContain('setInspectorMode(activeInspectorMode, inspector);');
  });

  it('renders grouped insert placeholders in the builder sidebar', () => {
    const sidebarHtml = fs.readFileSync(
      path.join(__dirname, '../apps/designer/partials/sidebar-builder.html'),
      'utf8'
    );
    const presetSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/widgets/nativeElementPresets.js'),
      'utf8'
    );

    expect(sidebarHtml).toContain('class="scene-native-elements"');
    expect(sidebarHtml).toContain('class="scene-insert-panels"');
    expect(presetSource).toContain("id: 'text.heading'");
    expect(presetSource).toContain("id: 'media.gallery'");
    expect(presetSource).toContain("id: 'navigation.menu'");
    expect(presetSource).toContain("nativeType: 'background'");
  });

  it('keeps the builder sidebar as a rail-routed panel shell', () => {
    const sidebarHtml = fs.readFileSync(
      path.join(__dirname, '../apps/designer/partials/sidebar-builder.html'),
      'utf8'
    );
    const rendererSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/builderRenderer.ts'),
      'utf8'
    );
    const layoutModeSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/renderer/layoutMode.js'),
      'utf8'
    );
    const sceneBuilderCss = fs.readFileSync(
      path.join(__dirname, '../apps/designer/assets/css/designer.css'),
      'utf8'
    );

    expect(sidebarHtml).toContain('class="sidebar-nav builder-sidebar-nav scene-panel-shell"');
    expect(sidebarHtml).toContain('class="scene-sidebar-rail"');
    expect(sidebarHtml).toContain('class="scene-sidebar-tablist"');
    expect(sidebarHtml).toContain('class="scene-sidebar-tools"');
    expect(sidebarHtml).toContain('class="scene-sidebar-panels scene-sidebar-flyout"');
    expect(sidebarHtml).toContain('data-sidebar-panel-target="insert"');
    expect(sidebarHtml).not.toContain('data-sidebar-panel-target="sections"');
    expect(sidebarHtml).not.toContain('id="scenePanelSections"');
    expect(sidebarHtml).not.toContain('data-sidebar-panel="sections"');
    expect(sidebarHtml).toContain('data-sidebar-panel-target="layers"');
    expect(sidebarHtml).toContain('data-sidebar-panel-target="layout"');
    expect(sidebarHtml).toContain('data-sidebar-panel="insert"');
    expect(sidebarHtml).toContain('data-sidebar-panel="layers"');
    expect(sidebarHtml).toContain('class="layout-panel-host"');
    expect(sidebarHtml).toContain('data-designer-tool="scroll"');
    expect(sidebarHtml).toContain('data-designer-tool="action"');
    expect(rendererSource).toContain('function setSidebarPanel(panelName = \'insert\', options = {})');
    expect(rendererSource).toContain('function closeSidebarPanel(options = {})');
    expect(rendererSource).toContain('function isSidebarFlyoutOpen()');
    expect(rendererSource).toContain('function setSidebarFlyoutOpen(open)');
    expect(rendererSource).toContain('function setSidebarToolActive(toolName = \'\')');
    expect(rendererSource).toContain('async function activateSidebarPanel(panelName = \'insert\')');
    expect(rendererSource).toContain('builder-sidebar--flyout-open');
    expect(rendererSource).toContain("builder-sidebar--compact");
    expect(rendererSource).toContain('data-sidebar-panel-target');
    expect(rendererSource).toContain('setSidebarPanel(sidebarEl.dataset.activeSidebarPanel || \'insert\')');
    expect(rendererSource).toContain("const SIDEBAR_PANEL_NAMES = new Set(['insert', 'layers', 'layout', 'colors', 'fonts'])");
    expect(rendererSource).not.toContain("{ selector: 'scene-map', panel: 'sections' }");
    expect(layoutModeSource).toContain("ctx.setSidebarPanel?.('layout')");
    expect(layoutModeSource).toContain("ctx.setSidebarPanel?.('insert')");
    expect(sceneBuilderCss).toContain('.scene-sidebar-rail');
    expect(sceneBuilderCss).toContain('--scene-sidebar-flyout-width');
    expect(sceneBuilderCss).toContain('.scene-sidebar-flyout');
    expect(sceneBuilderCss).toContain('left: calc(var(--scene-sidebar-rail-width');
    expect(sceneBuilderCss).toContain('@keyframes scene-sidebar-flyout-in');
    expect(sceneBuilderCss).toContain('.scene-rail-button.active');
    expect(sceneBuilderCss).toContain('.builder-sidebar--compact');
    expect(sceneBuilderCss).toContain('.builder-sidebar--insert-expanded');
    expect(sceneBuilderCss).toContain('.scene-sidebar-panels.scene-sidebar-flyout[hidden]');
    expect(sceneBuilderCss).toContain('.scene-sidebar-panel[hidden]');
    expect(sceneBuilderCss).toContain('.element-library .drag-widget-icon');
    expect(sceneBuilderCss).toContain('.scene-insert-preset');
  });

  it('closes the sidebar flyout when the active rail button or page outside is clicked', () => {
    const rendererSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/builderRenderer.ts'),
      'utf8'
    );

    expect(rendererSource).toContain('if (isSidebarFlyoutOpen() && sidebarEl.dataset.activeSidebarPanel === panelName)');
    expect(rendererSource).toContain('closeSidebarPanel();');
    expect(rendererSource).toContain("document.addEventListener('click', event => {");
    expect(rendererSource).toContain('!isSidebarFlyoutOpen() || !(target instanceof Node) || sidebarEl.contains(target)');
    expect(rendererSource).toContain("target.closest('.builder-header, .designer-live-preview')");
    expect(rendererSource).toContain('}, true);');
    expect(rendererSource).toContain('flyout.hidden = !shouldOpen;');
    expect(rendererSource).toContain("flyout.style.display = shouldOpen ? '' : 'none';");
    expect(rendererSource).toContain("flyout.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');");
  });

  it('keeps viewport presets in the header control instead of every sidebar panel', () => {
    const sidebarHtml = fs.readFileSync(
      path.join(__dirname, '../apps/designer/partials/sidebar-builder.html'),
      'utf8'
    );
    const headerHtml = fs.readFileSync(
      path.join(__dirname, '../apps/designer/partials/builder-header.html'),
      'utf8'
    );
    const headerSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/renderer/builderHeader.ts'),
      'utf8'
    );

    expect(sidebarHtml).not.toContain('data-builder-viewport-preset');
    expect(headerHtml.match(/data-builder-viewport-preset/g)).toHaveLength(3);
    expect(headerHtml).toContain('aria-label="Viewport presets"');
    expect(headerSource).toContain("saveMenuBtn.setAttribute('aria-label', 'Save options')");
  });

  it('keeps native background as a section-level tool', () => {
    const rendererSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/builderRenderer.ts'),
      'utf8'
    );

    expect(rendererSource).toContain("'background'");
    expect(rendererSource).toContain('SCENE_BACKGROUND_PRESETS');
    expect(rendererSource).toContain('data-scene-bg-preset');
    expect(rendererSource).toContain('function insertQuickBackground()');
    expect(rendererSource).toContain("if (nativeType === 'background') return insertQuickBackground();");
  });

  it('keeps stage behavior badges available for visual behavior summaries', () => {
    const rendererSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/builderRenderer.ts'),
      'utf8'
    );
    const sceneBuilderCss = fs.readFileSync(
      path.join(__dirname, '../apps/designer/assets/css/designer.css'),
      'utf8'
    );

    expect(rendererSource).toContain('function renderBehaviorBadge');
    expect(rendererSource).toContain('scene-behavior-badge');
    expect(rendererSource).toContain("badge.dataset.effects = enabledEffects.map(effect => effect.id).join(',');");
    expect(sceneBuilderCss).toContain('.scene-behavior-badge');
    expect(sceneBuilderCss).toContain('.scene-behavior-badge small');
  });

  it('keeps scene overview metadata available in the scene list', () => {
    const rendererSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/builderRenderer.ts'),
      'utf8'
    );
    const sceneBuilderCss = fs.readFileSync(
      path.join(__dirname, '../apps/designer/assets/css/designer.css'),
      'utf8'
    );

    expect(rendererSource).toContain('function getSceneOverview');
    expect(rendererSource).toContain('function renderSceneOverviewMeta');
    expect(rendererSource).toContain('scene-section-meta');
    expect(rendererSource).toContain('scene-section-count--behavior');
    expect(sceneBuilderCss).toContain('.scene-section-meta');
    expect(sceneBuilderCss).toContain('.scene-section-bg-dot');
  });

  it('keeps layer rows behavior-aware without opening the inspector', () => {
    const rendererSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/builderRenderer.ts'),
      'utf8'
    );
    const sceneBuilderCss = fs.readFileSync(
      path.join(__dirname, '../apps/designer/assets/css/designer.css'),
      'utf8'
    );

    expect(rendererSource).toContain('function renderLayerBehaviorMeta');
    expect(rendererSource).toContain('scene-layer-copy');
    expect(rendererSource).toContain('scene-layer-behavior');
    expect(rendererSource).toContain('scene-layer-effect');
    expect(rendererSource).toContain('scene-layer-range');
    expect(rendererSource).toContain('function selectWidgetFromLayer(widget, options = {})');
    expect(rendererSource).toContain('scrollWidgetIntoStageViewport(widget)');
    expect(rendererSource).toContain('function arrangeSceneWidget(widget, direction = \'forward\')');
    expect(rendererSource).toContain('data-layer-action="forward"');
    expect(rendererSource).toContain('data-layer-action="backward"');
    expect(rendererSource).toContain('widget.style.zIndex = order;');
    expect(rendererSource).toContain('const title = `Scene ${next}`;');
    expect(sceneBuilderCss).toContain('.scene-layer-meta');
    expect(sceneBuilderCss).toContain('.scene-layer-select');
    expect(sceneBuilderCss).toContain('.scene-layer-actions');
    expect(sceneBuilderCss).toContain('.scene-layer-action');
    expect(sceneBuilderCss).toContain('.scene-layer-behavior:not([data-layer-behavior=scroll])');
    expect(sceneBuilderCss).toContain('.scene-layer-range i');
  });

  it('keeps an empty-section stage affordance with direct quick inserts', () => {
    const rendererSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/builderRenderer.ts'),
      'utf8'
    );
    const sceneBuilderCss = fs.readFileSync(
      path.join(__dirname, '../apps/designer/assets/css/designer.css'),
      'utf8'
    );

    expect(rendererSource).toContain('class="scene-empty-state"');
    expect(rendererSource).toContain('function renderSceneEmptyState');
    expect(rendererSource).toContain('data-empty-insert="text"');
    expect(rendererSource).toContain('data-empty-insert="media"');
    expect(rendererSource).toContain('data-empty-insert="shape"');
    expect(rendererSource).toContain('data-empty-insert="button"');
    expect(rendererSource).toContain('data-empty-insert="background"');
    expect(rendererSource).toContain('void insertNativeElement(insertButton.dataset.emptyInsert)');
    expect(sceneBuilderCss).toContain('.scene-empty-state');
    expect(sceneBuilderCss).toContain('.scene-empty-actions button');
  });

  it('keeps redundant topbar tools removed while sidebar behavior tools stay wired', () => {
    const rendererSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/builderRenderer.ts'),
      'utf8'
    );
    const headerHtml = fs.readFileSync(
      path.join(__dirname, '../apps/designer/partials/builder-header.html'),
      'utf8'
    );
    const sidebarHtml = fs.readFileSync(
      path.join(__dirname, '../apps/designer/partials/sidebar-builder.html'),
      'utf8'
    );

    expect(headerHtml).not.toContain('builder-tool-strip');
    expect(headerHtml).not.toContain('data-tool=');
    expect(headerHtml).toContain('id="publishLayoutBtn"');
    expect(headerHtml).toContain('aria-label="Open publishing"');
    expect(sidebarHtml).toContain('data-designer-tool="scroll"');
    expect(sidebarHtml).toContain('data-designer-tool="action"');
    expect(rendererSource).toContain("detail: { tool, source: 'sidebar' }");
    expect(rendererSource).toContain("if (tool === 'text')");
    expect(rendererSource).toContain('await insertQuickText();');
    expect(rendererSource).toContain('await insertQuickMedia();');
    expect(rendererSource).toContain('await insertQuickShape();');
    expect(rendererSource).toContain("setActiveWidgetBehavior('scroll')");
    expect(rendererSource).toContain("setActiveWidgetBehavior('pinned')");
    expect(rendererSource).toContain('await insertQuickButton();');
  });

  it('keeps publishing available as a combined publish and usage panel', () => {
    const headerSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/renderer/builderHeader.ts'),
      'utf8'
    );
    const publishSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/renderer/publishPanel.ts'),
      'utf8'
    );
    const publishMarkup = fs.readFileSync(
      path.join(__dirname, '../apps/designer/partials/builder/publish-panel.html'),
      'utf8'
    );
    const publishCss = fs.readFileSync(
      path.join(__dirname, '../apps/designer/assets/css/designer.css'),
      'utf8'
    );

    expect(headerSource).not.toContain('publishBtn.remove()');
    expect(headerSource).toContain('getDesignId: () => state.designId');
    expect(publishMarkup).toContain('<h2 class="publish-title">Publishing</h2>');
    expect(publishMarkup).toContain('class="publish-usage"');
    expect(publishMarkup).toContain('class="publish-usage-list"');
    expect(publishSource).toContain('function refreshPublicationUsage()');
    expect(publishSource).toContain("'pages', 'byLane'");
    expect(publishSource).toContain('meta.designId = savedDesignId;');
    expect(publishSource).toContain("meta.designTitle = name;");
    expect(publishCss).toContain('#publishPanel .publish-usage');
    expect(publishCss).toContain('#publishPanel .publish-usage-item');
  });

  it('keeps the app-frame back control visible in the builder header', () => {
    const headerHtml = fs.readFileSync(
      path.join(__dirname, '../apps/designer/partials/builder-header.html'),
      'utf8'
    );
    const sceneBuilderScss = fs.readFileSync(
      path.join(__dirname, '../apps/designer/assets/scss/_scene-builder.scss'),
      'utf8'
    );
    const sceneBuilderCss = fs.readFileSync(
      path.join(__dirname, '../apps/designer/assets/css/designer.css'),
      'utf8'
    );

    expect(headerHtml).toContain('class="builder-back-btn"');
    expect(headerHtml).toContain('type="button"');
    expect(headerHtml).toContain('/assets/icons/arrow-left.svg');
    expect(sceneBuilderScss).toContain('flex: 0 0 34px;');
    expect(sceneBuilderScss).toContain('visibility: visible;');
    expect(sceneBuilderScss).toContain([
      '.builder-header .builder-back-btn .icon {',
      '  opacity: 1;',
      '  filter: brightness(0) invert(1);',
      '}'
    ].join('\n'));
    expect(sceneBuilderCss).toContain([
      '.builder-header .builder-back-btn .icon {',
      '  opacity: 1;',
      '  filter: brightness(0) invert(1);',
      '}'
    ].join('\n'));
  });

  it('keeps selection handles above viewport guides and unclipped at canvas edges', () => {
    const sceneBuilderCss = fs.readFileSync(
      path.join(__dirname, '../apps/designer/assets/css/designer.css'),
      'utf8'
    );

    const layoutRootRule = sceneBuilderCss.match(/body\.builder-mode #layoutRoot\s*\{[^}]*\}/)?.[0] ?? '';
    const editableGridRule = sceneBuilderCss.match(
      /body\.builder-mode \.layout-container > \.builder-grid,\s*body\.builder-mode \.layout-container\.builder-grid,\s*body\.builder-mode #layoutRoot > \.builder-grid\s*\{[^}]*\}/
    )?.[0] ?? '';
    const selectedGuideRule = sceneBuilderCss.match(
      /body\.builder-mode:has\(\.canvas-item\.selected\) \.scene-viewport-guides,\s*body\.builder-mode:has\(\.canvas-item\.editing\) \.scene-viewport-guides\s*\{[^}]*\}/
    )?.[0] ?? '';

    expect(layoutRootRule).toContain('z-index: auto;');
    expect(layoutRootRule).toContain('overflow: visible;');
    expect(editableGridRule).toContain('overflow: visible;');
    expect(selectedGuideRule).toContain('opacity: 0.32;');
  });

  it('keeps designer stage scrollbars on the fixed viewport edge', () => {
    const sceneBuilderCss = fs.readFileSync(
      path.join(__dirname, '../apps/designer/assets/css/designer.css'),
      'utf8'
    );

    const viewportRule = Array.from(sceneBuilderCss.matchAll(
      /body\.builder-mode #builderViewport\s*\{[^}]*\}/g
    )).map(match => match[0]).find(rule => rule.includes('var(--scene-surface-soft)')) ?? '';
    const zoomSizerRule = Array.from(sceneBuilderCss.matchAll(
      /body\.builder-mode #builderViewport \.canvas-zoom-sizer\s*\{[^}]*\}/g
    )).map(match => match[0]).find(rule => rule.includes('max-width: 1040px;')) ?? '';

    expect(viewportRule).toContain('display: block;');
    expect(viewportRule).toContain('overflow: auto;');
    expect(viewportRule).toContain('scrollbar-gutter: stable;');
    expect(zoomSizerRule).toContain('margin: 0 auto;');
  });

  it('keeps insert groups in the sidebar rail instead of a legacy topbar popover', () => {
    const rendererSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/builderRenderer.ts'),
      'utf8'
    );
    const sceneBuilderCss = fs.readFileSync(
      path.join(__dirname, '../apps/designer/assets/css/designer.css'),
      'utf8'
    );
    const nativePresetSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/widgets/nativeElementPresets.js'),
      'utf8'
    );

    expect(nativePresetSource).toContain('export const INSERT_TOOL_ITEMS');
    expect(rendererSource).toContain('INSERT_TOOL_ITEMS,');
    expect(rendererSource).not.toContain('function openInsertPopover');
    expect(rendererSource).not.toContain('className = \'scene-tool-popover\'');
    expect(rendererSource).not.toContain('data-tool-insert-group');
    expect(rendererSource).toContain('setInsertGroup(insertGroupButton.dataset.insertGroup);');
    expect(sceneBuilderCss).not.toContain('.scene-tool-popover');
    expect(sceneBuilderCss).toContain('.scene-sidebar-tools');
  });

  it('keeps behavior settings visually summarized in the inspector', () => {
    const rendererSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/builderRenderer.ts'),
      'utf8'
    );
    const sceneBuilderCss = fs.readFileSync(
      path.join(__dirname, '../apps/designer/assets/css/designer.css'),
      'utf8'
    );

    expect(rendererSource).toContain('function syncInspectorBehaviorPreview');
    expect(rendererSource).toContain('class="scene-behavior-preview"');
    expect(rendererSource).toContain('scene-behavior-preview-stage');
    expect(rendererSource).toContain('scene-behavior-preview-effects');
    expect(rendererSource).toContain("--scene-range-mid");
    expect(sceneBuilderCss).toContain('.scene-behavior-preview');
    expect(sceneBuilderCss).toContain('.scene-behavior-preview-stage');
    expect(sceneBuilderCss).toContain('.scene-behavior-preview[data-behavior=pinned]');
  });

  it('keeps selected stage elements directly behavior-editable', () => {
    const rendererSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/builderRenderer.ts'),
      'utf8'
    );
    const sceneBuilderCss = fs.readFileSync(
      path.join(__dirname, '../apps/designer/assets/css/designer.css'),
      'utf8'
    );

    expect(rendererSource).toContain('function renderStageBehaviorHud');
    expect(rendererSource).toContain('className = \'scene-stage-hud\'');
    expect(rendererSource).toContain('data-stage-behavior="${escapeAttribute(def.id)}"');
    expect(rendererSource).toContain("event.target.closest?.('[data-stage-behavior]')");
    expect(rendererSource).toContain('removeStageBehaviorHuds');
    expect(sceneBuilderCss).toContain('.scene-stage-hud');
    expect(sceneBuilderCss).toContain('.scene-stage-hud__actions button.active');
    expect(sceneBuilderCss).toContain('body.builder-mode .canvas-item:not(.selected) > .scene-stage-hud');
  });

  it('keeps scenes directly navigable from the stage', () => {
    const rendererSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/builderRenderer.ts'),
      'utf8'
    );
    const sceneBuilderCss = fs.readFileSync(
      path.join(__dirname, '../apps/designer/assets/css/designer.css'),
      'utf8'
    );

    expect(rendererSource).toContain('function renderStageSceneControls');
    expect(rendererSource).toContain('class="scene-stage-nav"');
    expect(rendererSource).toContain('class="scene-stage-nav__label"');
    expect(rendererSource).toContain('class="scene-storyboard__track scene-section-list"');
    expect(rendererSource).toContain('data-scene-storyboard-item');
    expect(rendererSource).toContain('data-stage-scene-action="prev"');
    expect(rendererSource).toContain('data-stage-scene-action="next"');
    expect(rendererSource).toContain('data-stage-scene-action="add"');
    expect(rendererSource).toContain('aria-label="Previous scene"');
    expect(rendererSource).toContain('aria-label="Next scene"');
    expect(rendererSource).toContain('aria-label="Add scene"');
    expect(rendererSource).toContain('aria-label="Scene name"');
    expect(rendererSource).toContain('aria-label="Move scene left"');
    expect(rendererSource).toContain('aria-label="Move scene right"');
    expect(rendererSource).toContain('function createSceneFromUi');
    expect(rendererSource).toContain('handleSceneNavigationClick(event)');
    expect(sceneBuilderCss).toContain('.scene-stage-nav');
    expect(sceneBuilderCss).toContain('.scene-stage-nav__label');
    expect(sceneBuilderCss).toContain('.scene-stage-nav .scene-section-list');
    expect(sceneBuilderCss).toContain('.scene-stage-nav__button--add');
  });

  it('serializes scene and behavior data with widget layout entries', () => {
    const gridEl = document.createElement('div');
    const widget = document.createElement('div');
    widget.className = 'canvas-item';
    widget.dataset.instanceId = 'hero-heading';
    widget.dataset.widgetId = 'textBox';
    widget.dataset.layer = '1';
    widget.dataset.xPercent = '32';
    widget.dataset.yPercent = '18';
    widget.dataset.wPercent = '40';
    widget.dataset.hPercent = '16';
    widget.dataset.sceneId = 'hero-scene';
    widget.dataset.sceneTitle = 'Hero Scene';
    widget.dataset.sceneBackground = '#f7f8fb';
    widget.dataset.behavior = 'sticky';
    widget.dataset.scrollStart = '15';
    widget.dataset.scrollEnd = '72';
    widget.dataset.elementName = 'Hero headline';
    widget.dataset.opacity = '0.82';
    widget.dataset.radius = '18';
    widget.dataset.effects = JSON.stringify([
      { id: 'fadeIn', enabled: true, start: 15, end: 32 },
      { id: 'moveY', enabled: true, start: 20, end: 80 }
    ]);
    widget.style.zIndex = '7';
    gridEl.appendChild(widget);

    const layout = getCurrentLayoutForLayer(gridEl, 1, {
      'hero-heading': {
        html: '<h1>Headline</h1>',
        meta: {
          tone: 'premium'
        }
      }
    });

    expect(layout).toEqual([
      expect.objectContaining({
        id: 'hero-heading',
        widgetId: 'textBox',
        behavior: 'sticky',
        sceneId: 'hero-scene',
        sceneTitle: 'Hero Scene',
        sceneBackground: '#f7f8fb',
        scrollStart: '15',
        scrollEnd: '72',
        elementName: 'Hero headline',
        opacity: '0.82',
        radius: '18',
        effects: [
          { id: 'fadeIn', enabled: true, start: 15, end: 32 },
          { id: 'moveY', enabled: true, start: 20, end: 80 }
        ],
        zIndex: 7,
        code: expect.objectContaining({
          html: '<h1>Headline</h1>',
          meta: {
            tone: 'premium',
            behavior: 'sticky',
            sceneId: 'hero-scene',
            sceneTitle: 'Hero Scene',
            sceneBackground: '#f7f8fb',
            scrollStart: '15',
            scrollEnd: '72',
            elementName: 'Hero headline',
            opacity: '0.82',
            radius: '18',
            effects: [
              { id: 'fadeIn', enabled: true, start: 15, end: 32 },
              { id: 'moveY', enabled: true, start: 20, end: 80 }
            ]
          }
        })
      })
    ]);
  });

  it('keeps native quick insert metadata in widget code', () => {
    const gridEl = document.createElement('div');
    const widget = document.createElement('div');
    widget.className = 'canvas-item';
    widget.dataset.instanceId = 'shape-1';
    widget.dataset.widgetId = 'htmlBlock';
    widget.dataset.layer = '1';
    widget.dataset.sceneId = 'showcase';
    widget.dataset.sceneTitle = 'Showcase';
    widget.dataset.behavior = 'scroll';
    gridEl.appendChild(widget);

    const layout = getCurrentLayoutForLayer(gridEl, 1, {
      'shape-1': {
        html: '<div class="scene-native-shape"></div>',
        css: '.scene-native-shape { border-radius: 18px; }',
        meta: {
          kind: 'shape'
        }
      }
    });

    expect(layout[0]).toEqual(expect.objectContaining({
      widgetId: 'htmlBlock',
      sceneId: 'showcase',
      sceneTitle: 'Showcase',
      code: expect.objectContaining({
        html: '<div class="scene-native-shape"></div>',
        css: '.scene-native-shape { border-radius: 18px; }',
        meta: expect.objectContaining({
          kind: 'shape',
          sceneId: 'showcase',
          sceneTitle: 'Showcase',
          behavior: 'scroll'
        })
      })
    }));
  });

  it('keeps native text quick insert metadata in widget code', () => {
    const gridEl = document.createElement('div');
    const widget = document.createElement('div');
    widget.className = 'canvas-item';
    widget.dataset.instanceId = 'text-1';
    widget.dataset.widgetId = 'textBox';
    widget.dataset.layer = '1';
    widget.dataset.sceneId = 'hero-scene';
    widget.dataset.sceneTitle = 'Hero Scene';
    widget.dataset.behavior = 'scroll';
    widget.dataset.elementName = 'Text';
    gridEl.appendChild(widget);

    const layout = getCurrentLayoutForLayer(gridEl, 1, {
      'text-1': {
        html: '<div class="scene-native-text editable" data-text-editable><h2>New headline</h2><p>Describe this section</p></div>',
        css: '.scene-native-text { display: grid; }',
        meta: {
          kind: 'text',
          label: 'Text'
        }
      }
    });

    expect(layout[0]).toEqual(expect.objectContaining({
      widgetId: 'textBox',
      sceneId: 'hero-scene',
      sceneTitle: 'Hero Scene',
      behavior: 'scroll',
      elementName: 'Text',
      code: expect.objectContaining({
        meta: expect.objectContaining({
          kind: 'text',
          label: 'Text',
          sceneId: 'hero-scene',
          sceneTitle: 'Hero Scene',
          behavior: 'scroll',
          elementName: 'Text'
        })
      })
    }));
  });

  it('keeps native button quick insert metadata in widget code', () => {
    const gridEl = document.createElement('div');
    const widget = document.createElement('div');
    widget.className = 'canvas-item';
    widget.dataset.instanceId = 'button-1';
    widget.dataset.widgetId = 'htmlBlock';
    widget.dataset.layer = '1';
    widget.dataset.sceneId = 'hero-scene';
    widget.dataset.sceneTitle = 'Hero Scene';
    widget.dataset.sceneBackground = '#ffffff';
    widget.dataset.behavior = 'scroll';
    widget.dataset.elementName = 'Button';
    gridEl.appendChild(widget);

    const layout = getCurrentLayoutForLayer(gridEl, 1, {
      'button-1': {
        html: '<a class="scene-native-button" href="/contact" role="button">Join waitlist</a>',
        css: '.scene-native-button { border-radius: 999px; }',
        meta: {
          kind: 'button',
          label: 'Join waitlist',
          href: '/contact'
        }
      }
    });

    expect(layout[0]).toEqual(expect.objectContaining({
      widgetId: 'htmlBlock',
      sceneId: 'hero-scene',
      sceneTitle: 'Hero Scene',
      sceneBackground: '#ffffff',
      behavior: 'scroll',
      elementName: 'Button',
      code: expect.objectContaining({
        html: '<a class="scene-native-button" href="/contact" role="button">Join waitlist</a>',
        meta: expect.objectContaining({
          kind: 'button',
          label: 'Join waitlist',
          href: '/contact',
          sceneId: 'hero-scene',
          sceneTitle: 'Hero Scene',
          sceneBackground: '#ffffff',
          behavior: 'scroll',
          elementName: 'Button'
        })
      })
    }));
  });
});
