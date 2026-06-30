const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const plainSpace = require('../mother/modules/plainSpace');
const { DEFAULT_WIDGETS } = require('../mother/modules/plainSpace/config/defaultWidgets');

const {
  buildDefaultWidgetSizeContract,
  buildRegistryMetadata,
  formatRegistryWidgets,
  resolveRegistryWidgetFilePath
} = plainSpace._internals;

function writeFixture(root, relativePath) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'export function render() {}');
  return filePath;
}

test('plainSpace widget registry resolves bundled and community widget browser URLs', () => {
  const cmsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-plainspace-registry-'));
  const bundledPath = writeFixture(
    cmsRoot,
    path.join('ui', 'widgets', 'plainspace', 'admin', 'defaultwidgets', 'contentSummaryWidget.js')
  );
  writeFixture(cmsRoot, path.join('widgets', 'weather', 'widget.js'));

  const warnings = [];
  try {
    assert.strictEqual(
      resolveRegistryWidgetFilePath(
        '/ui/widgets/plainspace/admin/defaultwidgets/contentSummaryWidget.js',
        cmsRoot
      ),
      bundledPath
    );
    assert.strictEqual(
      resolveRegistryWidgetFilePath(
        'https://example.test/ui/widgets/plainspace/admin/defaultwidgets/contentSummaryWidget.js',
        cmsRoot
      ),
      null
    );

    const widgets = formatRegistryWidgets([
      {
        widgetId: 'contentSummary',
        label: 'Content Summary',
        content: '/ui/widgets/plainspace/admin/defaultwidgets/contentSummaryWidget.js',
        category: 'core'
      },
      {
        widgetId: 'weather',
        label: 'Weather',
        content: '/widgets/weather/widget.js',
        category: 'community'
      },
      {
        widgetId: 'missing',
        label: 'Missing',
        content: '/ui/widgets/plainspace/admin/missingWidget.js',
        category: 'core'
      },
      {
        widgetId: 'badPath',
        label: 'Bad Path',
        content: '/ui/widgets/plainspace/../../app.js',
        category: 'core'
      }
    ], 'admin', {
      cmsRoot,
      warn: message => warnings.push(message)
    });

    assert.deepStrictEqual(widgets.map(widget => widget.id), [
      'contentSummary',
      'weather'
    ]);
    assert.strictEqual(
      widgets[0].codeUrl,
      '/ui/widgets/plainspace/admin/defaultwidgets/contentSummaryWidget.js'
    );
    assert.deepStrictEqual(
      widgets[0].metadata.apiActions,
      [
        { resource: 'plainSpace', action: 'layoutTemplateNames' },
        { resource: 'pages', action: 'list' },
        { resource: 'plainSpace', action: 'layoutTemplate' },
        { resource: 'plainSpace', action: 'saveLayoutTemplate' },
        { resource: 'plainSpace', action: 'setGlobalLayoutTemplate' },
        { resource: 'plainSpace', action: 'deleteLayoutTemplate' }
      ]
    );
    assert.strictEqual(widgets[0].metadata.layout.supportedSlots[0].name, 'full');
    assert.strictEqual(widgets[0].metadata.seedOptions, undefined);
    assert.strictEqual(widgets[0].metadata.layout.defaultSlot, 'full');
    assert.deepStrictEqual(widgets[0].metadata.layout.supportedSlots[0], {
      name: 'full',
      minCols: 12,
      maxCols: 12
    });
    assert.deepStrictEqual(widgets[0].metadata.designContract, {
      version: 1,
      mode: 'strict',
      tokens: 'required',
      designerRules: 'required'
    });
    assert.strictEqual(widgets[1].metadata.layout, undefined);
    assert.strictEqual(widgets[1].metadata.designContract, undefined);
    assert.match(warnings.join('\n'), /WIDGET_REGISTRY_FILE_MISSING/);
    assert.match(warnings.join('\n'), /WIDGET_REGISTRY_PATH_UNSUPPORTED/);
  } finally {
    fs.rmSync(cmsRoot, { recursive: true, force: true });
  }
});

test('plainSpace registry metadata carries explicit widget size contracts', () => {
  assert.deepStrictEqual(
    buildDefaultWidgetSizeContract({ options: { halfWidth: true, overflow: true } }),
    {
      defaultSlot: 'full',
      supportedSlots: [
        { name: 'full', minCols: 12, maxCols: 12 }
      ],
      breakpoints: {
        mobile: ['full'],
        tablet: ['full'],
        desktop: ['full']
      },
      heightMode: 'dynamic',
      height: {
        mode: 'dynamic',
        minHeight: {
          mobile: 120,
          tablet: 140,
          desktop: 160
        }
      }
    }
  );

  assert.deepStrictEqual(
    buildRegistryMetadata({
      widgetId: 'dragbarDemo',
      label: 'Drag Demo',
      category: 'core'
    }).layout.supportedSlots,
    [
      { name: 'third', minCols: 4, maxCols: 4 },
      { name: 'half', minCols: 6, maxCols: 6 },
      { name: 'full', minCols: 12, maxCols: 12 }
    ]
  );
  assert.strictEqual(
    buildRegistryMetadata({
      widgetId: 'pageStats',
      label: 'Page Stats',
      category: 'core'
    }).seedOptions,
    undefined
  );

  assert.strictEqual(
    buildDefaultWidgetSizeContract({ options: { width: 100, overflow: true } }).heightMode,
    'dynamic'
  );

  assert.deepStrictEqual(
    buildRegistryMetadata({
      widgetId: 'custom',
      label: 'Custom',
      category: 'core',
      metadata: JSON.stringify({
        layout: {
          supportedSlots: [{ name: 'tiny', minCols: 2 }],
          heightMode: 'fixed'
        }
      })
    }).layout,
    {
      supportedSlots: [{ name: 'tiny', minCols: 2 }],
      heightMode: 'fixed'
    }
  );
  assert.deepStrictEqual(
    buildRegistryMetadata({
      widgetId: 'custom',
      label: 'Custom',
      category: 'core',
      metadata: JSON.stringify({
        designContract: {
          version: 1,
          mode: 'advisory'
        }
      })
    }).designContract,
    {
      version: 1,
      mode: 'advisory'
    }
  );
});

test('plainSpace default public widget metadata exposes Design Studio essentials except page lists', () => {
  const publicWidgets = [
    ['textBox', 'Rich Text', '/ui/widgets/plainspace/public/basicwidgets/textBoxWidget.js'],
    ['mediaBlock', 'Media', '/ui/widgets/plainspace/public/basicwidgets/mediaWidget.js'],
    ['buttonLink', 'Button / Link', '/ui/widgets/plainspace/public/basicwidgets/buttonWidget.js'],
    ['navigationMenu', 'Menu', '/ui/widgets/plainspace/public/basicwidgets/navigationMenuWidget.js'],
    ['breadcrumb', 'Breadcrumb', '/ui/widgets/plainspace/public/basicwidgets/breadcrumbWidget.js'],
    ['gallery', 'Gallery', '/ui/widgets/plainspace/public/basicwidgets/galleryWidget.js']
  ];

  for (const [widgetId, label, content] of publicWidgets) {
    const metadata = buildRegistryMetadata({ widgetId, label, content, category: 'public' });
    assert.strictEqual(metadata.label, label);
    assert.deepStrictEqual(metadata.designContract, {
      version: 1,
      mode: 'strict',
      tokens: 'required',
      designerRules: 'required'
    });
    assert(Array.isArray(metadata.layout.supportedSlots), `${widgetId} should publish a size contract`);
  }

  const publicIds = DEFAULT_WIDGETS
    .filter(widget => widget.widgetType === 'public')
    .map(widget => widget.widgetId);
  assert(!publicIds.includes('pageList'));
  assert(!publicIds.includes('collectionsList'));

  const htmlBlock = DEFAULT_WIDGETS.find(widget => widget.widgetId === 'htmlBlock');
  assert.strictEqual(htmlBlock.metadata.hiddenFromCatalog, true);
  assert.strictEqual(htmlBlock.metadata.advanced, true);
});

test('plainSpace default admin widgets include Navigation Studio contracts', () => {
  const widget = DEFAULT_WIDGETS.find(item => item.widgetId === 'navigationStudio');

  assert(widget);
  assert.strictEqual(widget.content, '/ui/widgets/plainspace/admin/navigationStudioWidget.js');
  assert(widget.metadata.apiActions.some(action => action.resource === 'navigation' && action.action === 'menus'));
  assert(widget.metadata.apiActions.some(action => action.resource === 'navigation' && action.action === 'tree'));
  assert(widget.metadata.apiActions.some(action => action.resource === 'designer' && action.action === 'save'));
  assert.strictEqual(widget.metadata.seedOptions, undefined);
  assert.strictEqual(widget.metadata.layout.defaultSlot, 'page');
  assert.strictEqual(widget.metadata.layout.heightMode, 'scroll');
  assert.deepStrictEqual(widget.metadata.layout.height.minHeight, {
    mobile: 'calc(100dvh - 120px)',
    tablet: 'calc(100dvh - 140px)',
    desktop: 'calc(100dvh - 160px)'
  });
  assert.deepStrictEqual(widget.metadata.layout.supportedSlots, [
    { name: 'page', minCols: 12, maxCols: 12, exclusive: true }
  ]);
});

test('plainSpace default widgets no longer seed the retired page editor alias', () => {
  const alias = DEFAULT_WIDGETS.find(item => item.widgetId === 'pageEditor');
  const active = DEFAULT_WIDGETS.find(item => item.widgetId === 'pageEditorWidget');

  assert(active);
  assert.strictEqual(alias, undefined);
});
