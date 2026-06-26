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

  it('exposes native element chips in the builder sidebar', () => {
    const sidebarHtml = fs.readFileSync(
      path.join(__dirname, '../apps/designer/partials/sidebar-builder.html'),
      'utf8'
    );

    expect(sidebarHtml).toContain('class="scene-native-elements"');
    expect(sidebarHtml).toContain('data-native-element="text"');
    expect(sidebarHtml).toContain('data-native-element="media"');
    expect(sidebarHtml).toContain('data-native-element="shape"');
    expect(sidebarHtml).toContain('data-native-element="button"');
    expect(sidebarHtml).toContain('data-native-element="background"');
    expect(sidebarHtml).toContain('wallpaper.svg');
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

  it('keeps section overview metadata available in the scene list', () => {
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
    expect(sceneBuilderCss).toContain('.scene-layer-meta');
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

  it('keeps topbar tools wired to direct scene actions', () => {
    const rendererSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/builderRenderer.ts'),
      'utf8'
    );
    const headerHtml = fs.readFileSync(
      path.join(__dirname, '../apps/designer/partials/builder-header.html'),
      'utf8'
    );

    expect(headerHtml).toContain('data-tool="text"');
    expect(headerHtml).toContain('data-tool="media"');
    expect(headerHtml).toContain('data-tool="shape"');
    expect(headerHtml).toContain('data-tool="scroll"');
    expect(headerHtml).toContain('data-tool="action"');
    expect(rendererSource).toContain("if (tool === 'text')");
    expect(rendererSource).toContain('await insertQuickText();');
    expect(rendererSource).toContain('await insertQuickMedia();');
    expect(rendererSource).toContain('await insertQuickShape();');
    expect(rendererSource).toContain("setActiveWidgetBehavior('scroll')");
    expect(rendererSource).toContain("setActiveWidgetBehavior('pinned')");
    expect(rendererSource).toContain('await insertQuickButton();');
  });

  it('keeps the Insert topbar tool as a compact direct-insert palette', () => {
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
    expect(rendererSource).toContain('function openInsertPopover');
    expect(rendererSource).toContain('className = \'scene-tool-popover\'');
    expect(rendererSource).toContain('data-tool-insert="${escapeAttribute(item.id)}"');
    expect(rendererSource).toContain('await insertNativeElement(type);');
    expect(sceneBuilderCss).toContain('.scene-tool-popover');
    expect(sceneBuilderCss).toContain('.scene-tool-popover button');
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

  it('keeps sections directly navigable from the stage', () => {
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
    expect(rendererSource).toContain('data-stage-scene-action="prev"');
    expect(rendererSource).toContain('data-stage-scene-action="next"');
    expect(rendererSource).toContain('data-stage-scene-action="add"');
    expect(rendererSource).toContain('function createSceneFromUi');
    expect(sceneBuilderCss).toContain('.scene-stage-nav');
    expect(sceneBuilderCss).toContain('.scene-stage-nav__current');
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
