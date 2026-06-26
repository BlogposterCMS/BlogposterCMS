const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const plainSpace = require('../mother/modules/plainSpace');

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

test('plainSpace widget registry resolves bundled, community, and legacy widget browser URLs', () => {
  const cmsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-plainspace-registry-'));
  const bundledPath = writeFixture(
    cmsRoot,
    path.join('ui', 'widgets', 'plainspace', 'admin', 'defaultwidgets', 'contentSummaryWidget.js')
  );
  writeFixture(cmsRoot, path.join('widgets', 'weather', 'widget.js'));
  writeFixture(cmsRoot, path.join('public', 'plainspace', 'widgets', 'admin', 'legacyWidget.js'));

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
        widgetId: 'legacy',
        label: 'Legacy',
        content: '/plainspace/widgets/admin/legacyWidget.js',
        category: 'legacy'
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
      'weather',
      'legacy'
    ]);
    assert.strictEqual(
      widgets[0].codeUrl,
      '/ui/widgets/plainspace/admin/defaultwidgets/contentSummaryWidget.js'
    );
    assert.deepStrictEqual(
      widgets[0].metadata.apiEvents,
      [
        'getLayoutTemplateNames',
        'getAllPages',
        'getLayoutTemplate',
        'saveLayoutTemplate',
        'setGlobalLayoutTemplate',
        'deleteLayoutTemplate'
      ]
    );
    assert.strictEqual(widgets[0].metadata.layout.supportedSlots[0].name, 'full');
    assert.deepStrictEqual(widgets[0].metadata.seedOptions, {
      height: 150,
      maxWidth: true,
      debug: true
    });
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

test('plainSpace registry metadata carries widget size contracts from seed options', () => {
  assert.deepStrictEqual(
    buildDefaultWidgetSizeContract({ options: { halfWidth: true, overflow: true } }),
    {
      supportedSlots: [
        { name: 'full', minCols: 12, maxCols: 12 },
        { name: 'wide', minCols: 6 }
      ],
      breakpoints: {
        mobile: ['full'],
        tablet: ['full', 'wide'],
        desktop: ['full', 'wide']
      },
      heightMode: 'scroll'
    }
  );

  assert.deepStrictEqual(
    buildRegistryMetadata({
      widgetId: 'dragbarDemo',
      label: 'Drag Demo',
      category: 'core'
    }).layout.supportedSlots,
    [
      { name: 'full', minCols: 12, maxCols: 12 },
      { name: 'wide', minCols: 6 },
      { name: 'compact', minCols: 4 }
    ]
  );
  assert.deepStrictEqual(
    buildRegistryMetadata({
      widgetId: 'pageStats',
      label: 'Page Stats',
      category: 'core'
    }).seedOptions,
    {
      halfWidth: true,
      height: 160,
      overflow: true
    }
  );

  assert.strictEqual(
    buildDefaultWidgetSizeContract({ options: { width: 100, overflow: true } }).heightMode,
    'auto'
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
