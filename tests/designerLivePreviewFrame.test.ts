/**
 * @jest-environment jsdom
 */

import {
  buildLivePreviewFrameUrl,
  buildLivePreviewPayload,
  createLivePreviewController,
  livePreviewFeedbackState,
  normalizeLivePreviewViewports
} from '../ui/designer/app/renderer/livePreviewFrame';
import fs from 'fs';
import path from 'path';

describe('designer live preview frame', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    delete window.ACTIVE_THEME;
    delete window.PAGE_SLUG;
  });

  function makeLayoutRoot() {
    const layoutRoot = document.createElement('div');
    layoutRoot.id = 'layoutRoot';
    layoutRoot.className = 'layout-root layout-container';
    layoutRoot.dataset.workarea = 'true';
    layoutRoot.dataset.nodeId = 'main-workarea';

    const gridEl = document.createElement('div');
    gridEl.id = 'workspaceMain';
    gridEl.dataset.bgImageUrl = '/media/hero.jpg';
    gridEl.style.backgroundColor = 'rgb(255, 255, 255)';
    layoutRoot.appendChild(gridEl);
    document.body.appendChild(layoutRoot);

    return { layoutRoot, gridEl };
  }

  it('builds a public runtime payload from the active design layer', () => {
    const { layoutRoot, gridEl } = makeLayoutRoot();
    const activePlacement = {
      id: 'hero-1',
      widgetId: 'textBox',
      xPercent: 0,
      yPercent: 0,
      wPercent: 100,
      hPercent: 40
    };

    window.ACTIVE_THEME = 'minimal';

    const payload = buildLivePreviewPayload({
      title: 'Landing Page',
      activeLayer: 1,
      hasLayoutStructure: true,
      gridEl,
      layoutRoot,
      layoutLayers: [
        { name: 'Layout', layout: [] },
        { name: 'Design', layout: [] }
      ],
      allWidgets: [{ id: 'textBox' }],
      viewport: { id: 'desktop', label: 'Desktop', width: '100%' },
      state: { designId: 'design-1', designVersion: 3 },
      getCurrentLayoutForLayer: jest.fn(() => [activePlacement]),
      ensureCodeMap: jest.fn(() => ({})),
      updateAllWidgetContents: jest.fn(),
      saveActiveLayer: jest.fn(),
      getSceneSections: jest.fn(() => [{ id: 'hero-scene', title: 'Hero Scene' }])
    });

    expect(payload.lane).toBe('public');
    expect(payload.activeTheme).toBe('minimal');
    expect(payload.design).toMatchObject({
      id: 'design-1',
      version: 3,
      bg_media_url: '/media/hero.jpg'
    });
    expect(payload.document.layoutTree).toMatchObject({
      type: 'leaf',
      workarea: true,
      nodeId: 'main-workarea',
      scenes: [{ id: 'hero-scene', title: 'Hero Scene' }]
    });
    expect(payload.document.placements).toEqual([activePlacement]);
    expect(payload.widgets).toEqual([{ id: 'textBox' }]);
  });

  it('uses the stored design layer when authors preview from the layout layer', () => {
    const { layoutRoot, gridEl } = makeLayoutRoot();
    const storedDesignPlacement = { id: 'stored-1', widgetId: 'gallery' };
    const layoutLayerPlacement = { id: 'layout-1', widgetId: 'layoutOnly' };

    const payload = buildLivePreviewPayload({
      activeLayer: 0,
      hasLayoutStructure: true,
      gridEl,
      layoutRoot,
      layoutLayers: [
        { name: 'Layout', layout: [] },
        { name: 'Design', layout: [storedDesignPlacement] }
      ],
      allWidgets: [],
      viewport: { id: 'desktop', label: 'Desktop', width: '100%' },
      getCurrentLayoutForLayer: jest.fn(() => [layoutLayerPlacement]),
      ensureCodeMap: jest.fn(() => ({}))
    });

    expect(payload.document.placements).toEqual([storedDesignPlacement]);
  });

  it('normalizes stored preview and global layout entries for the public runtime', () => {
    const { layoutRoot, gridEl } = makeLayoutRoot();

    const payload = buildLivePreviewPayload({
      activeLayer: 0,
      hasLayoutStructure: true,
      gridEl,
      layoutRoot,
      layoutLayers: [
        { name: 'Layout', layout: [] },
        {
          name: 'Design',
          layout: [{
            instance_id: 'hero-1',
            widget_id: 'textBox',
            x_percent: 12,
            y_percent: 8,
            w_percent: 64,
            h_percent: 24,
            z_index: '3',
            metadata: '{"workareaId":"main-workarea","sceneId":"hero"}',
            html: '<h1>Hello</h1>'
          }]
        }
      ],
      globalLayout: [{
        instance_id: 'nav-1',
        widget_id: 'menu',
        x_percent: 0,
        y_percent: 0,
        w_percent: 100,
        h_percent: 8
      }],
      allWidgets: [],
      viewport: { id: 'desktop', label: 'Desktop', width: '100%' },
      getCurrentLayoutForLayer: jest.fn(() => []),
      ensureCodeMap: jest.fn(() => ({}))
    });

    expect(payload.document.placements[0]).toMatchObject({
      id: 'hero-1',
      widgetId: 'textBox',
      xPercent: 12,
      yPercent: 8,
      wPercent: 64,
      hPercent: 24,
      layer: '3',
      zIndex: '3',
      workareaId: 'main-workarea',
      sceneId: 'hero',
      code: {
        html: '<h1>Hello</h1>',
        meta: {
          workareaId: 'main-workarea',
          sceneId: 'hero'
        }
      }
    });
    expect(payload.globalLayout[0]).toMatchObject({
      id: 'nav-1',
      widgetId: 'menu',
      xPercent: 0,
      yPercent: 0,
      wPercent: 100,
      hPercent: 8
    });
  });

  it('normalizes preview viewports and exposes status for agent feedback', () => {
    expect(normalizeLivePreviewViewports([
      { id: 'mobile', label: 'Phone' },
      { id: 'wide', label: 'Wide', width: '1440px' }
    ])).toEqual([
      { id: 'mobile', label: 'Phone', width: '390px' },
      { id: 'wide', label: 'Wide', width: '1440px' }
    ]);

    const panel = document.createElement('section');
    panel.id = 'designerLivePreviewPanel';
    panel.dataset.status = 'ready';
    panel.dataset.viewport = 'mobile';
    const frame = document.createElement('iframe');
    frame.id = 'designerLivePreviewFrame';
    frame.src = '/coming-soon?designer-live-preview=1';
    panel.appendChild(frame);
    document.body.dataset.livePreviewOpen = 'true';
    document.body.appendChild(panel);

    expect(livePreviewFeedbackState()).toMatchObject({
      available: true,
      open: true,
      status: 'ready',
      viewport: 'mobile',
      frameUrl: '/coming-soon?designer-live-preview=1',
      runtime: 'public'
    });
  });

  it('builds live preview frame URLs from public page slugs', () => {
    window.PAGE_SLUG = 'coming-soon';

    expect(buildLivePreviewFrameUrl()).toBe('/coming-soon?designer-live-preview=1');
    expect(buildLivePreviewFrameUrl('/Products/Big Launch/')).toBe('/products/big-launch?designer-live-preview=1');
  });

  it('boots the live preview through the public runtime route without a standalone shell', () => {
    const publicEntrySource = fs.readFileSync(
      path.join(__dirname, '../ui/runtime/publicEntry.ts'),
      'utf8'
    );
    const importerSource = fs.readFileSync(
      path.join(__dirname, '../ui/runtime/publicLoaderImporter.ts'),
      'utf8'
    );
    const runtimeSource = fs.readFileSync(
      path.join(__dirname, '../ui/designer/app/renderer/livePreviewRuntime.ts'),
      'utf8'
    );

    expect(publicEntrySource).toContain('await importDesignerLivePreviewRuntime()');
    expect(publicEntrySource).not.toContain('webpackIgnore: true');
    expect(importerSource).toContain('export async function importDesignerLivePreviewRuntime');
    expect(importerSource).toContain('import(/* webpackIgnore: true */ DESIGNER_LIVE_PREVIEW_RUNTIME_PATH)');
    expect(runtimeSource).toContain('renderPublicRuntimePageContent');
    expect(runtimeSource).toContain('previewRuntimeDataEmit');
    expect(runtimeSource).not.toContain('designerLivePreview ===');
    expect(fs.existsSync(path.join(__dirname, '../apps/designer/live-preview.html'))).toBe(false);
  });

  it('removes the live preview panel when authors click the close action', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    const controller = createLivePreviewController({
      buildPayload: jest.fn(() => ({
        version: 1,
        title: 'Preview',
        lane: 'public',
        generatedAt: '2026-07-03T00:00:00.000Z',
        activeLayer: 1,
        activeTheme: 'default',
        viewport: { id: 'desktop', label: 'Desktop', width: '100%' },
        design: { id: null, title: 'Preview', version: 0 },
        document: {
          version: 1,
          layoutTree: { type: 'leaf', workarea: true },
          placements: [],
          scenes: [],
          styles: {},
          metadata: { source: 'test' }
        },
        widgets: [],
        globalLayout: []
      }))
    });
    controller.setTrigger(trigger);

    controller.open();
    const closeButton = document.querySelector<HTMLButtonElement>('[data-live-preview-action="close"]');
    expect(closeButton).toBeTruthy();
    expect(controller.isOpen()).toBe(true);
    expect(trigger.getAttribute('aria-pressed')).toBe('true');

    closeButton?.click();

    expect(controller.isOpen()).toBe(false);
    expect(document.getElementById('designerLivePreviewPanel')).toBeNull();
    expect(document.body.dataset.livePreviewOpen).toBeUndefined();
    expect(trigger.getAttribute('aria-pressed')).toBe('false');

    controller.destroy();
  });
});
