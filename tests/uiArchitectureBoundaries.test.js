const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

function toRepoPath(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function walk(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(fullPath, predicate);
    return predicate(fullPath) ? [fullPath] : [];
  });
}

function sourceFiles(...segments) {
  return walk(
    path.join(rootDir, ...segments),
    filePath => /\.(j|t)sx?$/.test(filePath) && !toRepoPath(filePath).startsWith('public/build/')
  );
}

function docsFiles() {
  return walk(
    path.join(rootDir, '..', 'docs'),
    filePath => /\.md$/.test(filePath)
  );
}

function htmlFiles(...segments) {
  return walk(
    path.join(rootDir, ...segments),
    filePath => /\.html$/.test(filePath)
  );
}

function modulePublicLoaderFiles() {
  return walk(
    path.join(rootDir, 'mother', 'modules'),
    filePath => /publicLoader\.(j|t)s$/.test(filePath)
  );
}

function modulePublicLoaderTsFiles() {
  return walk(
    path.join(rootDir, 'mother', 'modules'),
    filePath => /publicLoader\.ts$/.test(filePath)
  );
}

function meaningfulCodeLines(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('//'));
}

function isThinForwarder(filePath) {
  const lines = meaningfulCodeLines(filePath);
  return (
    lines.length > 0 &&
    lines.length <= 2 &&
    lines.every(line => /^(?:import|export)\b/.test(line))
  );
}

function importSpecifiers(source) {
  const specs = [];
  const importExport = /\b(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  const dynamicImport = /\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)?['"]([^'"]+)['"]\s*\)/g;
  for (const matcher of [importExport, dynamicImport]) {
    let match;
    while ((match = matcher.exec(source)) !== null) {
      specs.push(match[1]);
    }
  }
  return specs;
}

function dynamicImportSpecifiers(source) {
  const specs = [];
  const dynamicImport = /\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)?['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = dynamicImport.exec(source)) !== null) {
    specs.push(match[1]);
  }
  return specs;
}

function isForbiddenRetiredBrowserSpecifier(specifier) {
  return (
    specifier.startsWith('/assets/js/') ||
    specifier.includes('public/assets/js') ||
    specifier.includes('public/plainspace') ||
    /^\/plainspace\/(?:dashboard|grid-core|widgets|sanitizer)(?:\/|\.js|$)/.test(specifier)
  );
}

function resolvesToCanonicalShimTarget(filePath, specifier) {
  if (specifier.startsWith('/ui/') || specifier.startsWith('/build/')) {
    return true;
  }
  if (!specifier.startsWith('.')) {
    return false;
  }

  const resolved = path.resolve(path.dirname(filePath), specifier);
  return (
    resolved.startsWith(path.join(rootDir, 'ui') + path.sep) ||
    resolved.startsWith(path.join(rootDir, 'public', 'build') + path.sep)
  );
}

function resolvesToUiZone(filePath, specifier, ...zoneSegments) {
  if (!specifier.startsWith('.')) return false;
  const resolved = path.resolve(path.dirname(filePath), specifier);
  const zoneRoot = path.join(rootDir, 'ui', ...zoneSegments);
  return resolved === zoneRoot || resolved.startsWith(zoneRoot + path.sep);
}

function specifierTargetsUiZone(filePath, specifier, zone) {
  if (specifier.startsWith(`/ui/${zone}/`) || specifier.startsWith(`@ui/${zone}/`)) {
    return true;
  }
  if (!specifier.startsWith('.')) return false;
  const resolved = path.resolve(path.dirname(filePath), specifier);
  const zoneRoot = path.join(rootDir, 'ui', zone);
  return resolved === zoneRoot || resolved.startsWith(zoneRoot + path.sep);
}

describe('UI architecture boundaries', () => {
  test('ui and designer code do not import retired public implementation paths', () => {
    const files = [
      ...sourceFiles('ui'),
      ...sourceFiles('apps', 'designer')
    ];
    const violations = [];

    files.forEach(filePath => {
      const source = fs.readFileSync(filePath, 'utf8');
      importSpecifiers(source).forEach(specifier => {
        if (isForbiddenRetiredBrowserSpecifier(specifier)) {
          violations.push(`${toRepoPath(filePath)} -> ${specifier}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  test('designer app shell keeps JavaScript and TypeScript under ui/designer', () => {
    const files = sourceFiles('apps', 'designer');

    expect(files.map(toRepoPath)).toEqual([]);
  });

  test('PlainSpace public shell has no retired browser implementation scripts', () => {
    const files = sourceFiles('public', 'plainspace');

    expect(files.map(toRepoPath)).toEqual([]);
  });

  test('public asset entry scripts stay thin', () => {
    const files = sourceFiles('public', 'assets', 'js');
    const violations = files
      .filter(filePath => !isThinForwarder(filePath))
      .map(toRepoPath);

    expect(violations).toEqual([]);
  });

  test('public asset entry scripts forward only to ui sources or build bundles', () => {
    const files = [
      ...sourceFiles('public', 'assets', 'js')
    ];
    const violations = [];

    files.forEach(filePath => {
      const specs = importSpecifiers(fs.readFileSync(filePath, 'utf8'));
      if (!specs.length) {
        violations.push(`${toRepoPath(filePath)} -> no import/export specifier`);
        return;
      }

      specs.forEach(specifier => {
        if (!resolvesToCanonicalShimTarget(filePath, specifier)) {
          violations.push(`${toRepoPath(filePath)} -> ${specifier}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  test('module public loaders import canonical UI paths', () => {
    const violations = [];

    modulePublicLoaderFiles().forEach(filePath => {
      const source = fs.readFileSync(filePath, 'utf8');
      importSpecifiers(source).forEach(specifier => {
        if (isForbiddenRetiredBrowserSpecifier(specifier)) {
          violations.push(`${toRepoPath(filePath)} -> ${specifier}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  test('module public loaders are TypeScript-authored', () => {
    const violations = modulePublicLoaderFiles()
      .filter(filePath => /\.js$/.test(filePath))
      .filter(filePath => !fs.existsSync(filePath.replace(/\.js$/, '.ts')))
      .map(toRepoPath);

    expect(violations).toEqual([]);
  });

  test('module public loaders are served through an explicit app allowlist', () => {
    const source = fs.readFileSync(path.join(rootDir, 'mother/server/http/staticAssets.js'), 'utf8');
    const moduleNames = modulePublicLoaderTsFiles()
      .map(filePath => path.basename(path.dirname(filePath)));

    expect(source).toContain('corePublicLoaderPaths');
    expect(source).toContain('/mother/modules/${moduleName}/publicLoader.js');
    expect(source).not.toMatch(/app\.use\(\s*['"]\/mother/);
    expect(moduleNames.length).toBeGreaterThan(0);
    moduleNames.forEach(moduleName => {
      expect(source).toContain(`${moduleName}: path.join(rootDir, 'mother', 'modules', '${moduleName}', 'publicLoader.ts')`);
    });
  });

  test('PlainSpace default widget registry uses canonical UI widget modules', () => {
    const source = fs.readFileSync(
      path.join(rootDir, 'mother', 'modules', 'plainSpace', 'config', 'defaultWidgets.js'),
      'utf8'
    );
    const contentPaths = [];
    const contentPattern = /\bcontent:\s*['"]([^'"]+)['"]/g;
    let match;

    while ((match = contentPattern.exec(source)) !== null) {
      contentPaths.push(match[1]);
    }

    const violations = contentPaths.filter(
      contentPath => !contentPath.startsWith('/ui/widgets/plainspace/')
    );

    expect(contentPaths.length).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  test('runtime UI does not import shell modules', () => {
    const violations = [];

    sourceFiles('ui', 'runtime').forEach(filePath => {
      const source = fs.readFileSync(filePath, 'utf8');
      importSpecifiers(source).forEach(specifier => {
        if (specifierTargetsUiZone(filePath, specifier, 'shell')) {
          violations.push(`${toRepoPath(filePath)} -> ${specifier}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  test('runtime widget dependencies stay behind approved gateways', () => {
    const allowedImports = new Map([
      ['ui/runtime/main/widgetRuntimeGateway.ts', new Set([
        '../../widgets/options/widgetOptions.js',
        '../../widgets/rendering/widgetModuleLoader.js'
      ])],
      ['ui/runtime/main/widgetRuntimeGateway.js', new Set([
        '../../widgets/options/widgetOptions.js',
        '../../widgets/rendering/widgetModuleLoader.js'
      ])],
      ['ui/runtime/main/runtimeWidgetEvents.ts', new Set([
        '../../widgets/rendering/widgetEvents.js'
      ])],
      ['ui/runtime/main/runtimeWidgetEvents.js', new Set([
        '../../widgets/rendering/widgetEvents.js'
      ])]
    ]);
    const violations = [];

    sourceFiles('ui', 'runtime').forEach(filePath => {
      const repoPath = toRepoPath(filePath);
      const allowedForFile = allowedImports.get(repoPath) || new Set();
      importSpecifiers(fs.readFileSync(filePath, 'utf8')).forEach(specifier => {
        if (
          specifierTargetsUiZone(filePath, specifier, 'widgets') &&
          !allowedForFile.has(specifier)
        ) {
          violations.push(`${repoPath} -> ${specifier}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  test('runtime widget option forwarder delegates through the runtime gateway', () => {
    const source = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'widgetOptions.ts'),
      'utf8'
    );

    expect(source).toContain("export { applyWidgetOptions } from './widgetRuntimeGateway.js';");
    expect(source).not.toContain('../../widgets/options/widgetOptions.js');
  });

  test('page renderer lazy-loads admin-only surfaces and controls', () => {
    const pageRendererSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'pageRenderer.ts'),
      'utf8'
    );
    const adminGridSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeAdminGrid.ts'),
      'utf8'
    );
    const adminMountingSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeAdminGridMounting.ts'),
      'utf8'
    );
    const widgetGatewaySource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'widgetRuntimeGateway.ts'),
      'utf8'
    );
    const gatewaySource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'adminWidgetSurfaces.ts'),
      'utf8'
    );

    expect(pageRendererSource).toContain("from './widgetRuntimeGateway.js'");
    expect(pageRendererSource).not.toContain("from './adminWidgetSurfaces.js'");
    expect(pageRendererSource).not.toContain('../../widgets/options/widgetOptions.js');
    expect(pageRendererSource).not.toContain('../../widgets/rendering/widgetModuleLoader.js');
    expect(pageRendererSource).not.toContain('/ui/widgets/plainspace/admin/settings/settingsPanels.js');
    expect(pageRendererSource).not.toContain('/ui/widgets/panel/widgetControls.js');
    expect(pageRendererSource).toContain('renderAdminSettingsSurface(contentEl, page)');
    expect(adminGridSource).not.toContain("from './widgetRuntimeGateway.js'");
    expect(adminGridSource).not.toContain('afterRender: attachAdminDashboardControls');
    expect(adminGridSource).not.toContain("from './adminWidgetSurfaces.js'");
    expect(adminMountingSource).toContain("from './widgetRuntimeGateway.js'");
    expect(adminMountingSource).toContain('afterRender: attachAdminDashboardControls');
    expect(widgetGatewaySource).toContain("from '../../widgets/options/widgetOptions.js'");
    expect(widgetGatewaySource).toContain("from '../../widgets/rendering/widgetModuleLoader.js'");
    expect(widgetGatewaySource).toContain("from './adminWidgetSurfaces.js'");
    expect(gatewaySource).toContain("ADMIN_SETTINGS_SURFACE_PATH = '/ui/widgets/plainspace/admin/settings/settingsPanels.js'");
    expect(gatewaySource).toContain("ADMIN_DASHBOARD_CONTROLS_PATH = '/ui/widgets/panel/widgetControls.js'");
    expect(gatewaySource).toContain('/* webpackIgnore: true */ ADMIN_SETTINGS_SURFACE_PATH');
    expect(gatewaySource).toContain('/* webpackIgnore: true */ ADMIN_DASHBOARD_CONTROLS_PATH');
  });

  test('settings surface embeds admin widgets through a canonical allowlist', () => {
    const source = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'settings', 'settingsPanels.ts'),
      'utf8'
    );

    expect(source).toContain('EMBEDDED_WIDGET_PANEL_PATHS');
    expect(source).toContain("modules: '/ui/widgets/plainspace/admin/modulesListWidget.js'");
    expect(source).toContain("providers: '/ui/widgets/plainspace/admin/loginStrategiesWidget.js'");
    expect(source).toContain("users: '/ui/widgets/plainspace/admin/usersListWidget.js'");
    expect(source).toContain("access: '/ui/widgets/plainspace/admin/accessSettingsWidget.js'");
    expect(source).not.toContain(['/plainspace', 'widgets/'].join('/'));
  });

  test('widget renderers resolve dynamic widget modules through the canonical guard', () => {
    const dynamicModuleSources = [
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetModuleRenderer.ts'),
      path.join(rootDir, 'ui', 'widgets', 'rendering', 'widgetModuleRenderer.ts')
    ];
    const guardSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'rendering', 'widgetModulePaths.ts'),
      'utf8'
    );
    const loaderSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'rendering', 'widgetModuleLoader.ts'),
      'utf8'
    );

    expect(guardSource).toContain("'/ui/widgets/plainspace/'");
    expect(guardSource).toContain('COMMUNITY_WIDGET_PATTERN');
    expect(guardSource).toContain('url.origin !== baseUrl.origin');
    expect(guardSource).toContain('resolveWidgetModuleUrl');
    expect(loaderSource).toContain('resolveWidgetModuleUrl(input, base)');
    expect(loaderSource).toContain('import(/* webpackIgnore: true */ codeUrl)');

    dynamicModuleSources.forEach(filePath => {
      const source = fs.readFileSync(filePath, 'utf8');
      expect(source).toContain('loadWidgetModule');
      expect(source).not.toMatch(/import\s*\(\s*\/\* webpackIgnore: true \*\/\s*(?:def|widgetDef)\.codeUrl\s*\)/);
      expect(source).not.toMatch(/import\s*\(\s*\/\* webpackIgnore: true \*\/\s*codeUrl\s*\)/);
    });
  });

  test('widgets renderer delegates API event registration to a rendering helper', () => {
    const rendererSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'rendering', 'widgetRenderer.ts'),
      'utf8'
    );
    const eventsSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'rendering', 'widgetEvents.ts'),
      'utf8'
    );

    expect(rendererSource).toContain("from './widgetEvents.js'");
    expect(rendererSource).not.toContain('async function registerWidgetEvents');
    expect(rendererSource).not.toContain('registerWidgetUsage failed for');
    expect(rendererSource).not.toContain('window.meltdownEmit');
    expect(eventsSource).toContain('export async function registerWidgetEvents');
    expect(eventsSource).toContain('window.meltdownEmit');
    expect(eventsSource).toContain('registerWidgetUsage');
  });

  test('widgets renderer delegates inline code rendering to a rendering helper', () => {
    const rendererSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'rendering', 'widgetRenderer.ts'),
      'utf8'
    );
    const inlineSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'rendering', 'widgetInlineCode.ts'),
      'utf8'
    );

    expect(rendererSource).toContain("from './widgetInlineCode.js'");
    expect(rendererSource).not.toContain("from '../../shared/sanitize/sanitizer.js'");
    expect(rendererSource).not.toContain("from '../../shared/scripts/executeJs.js'");
    expect(rendererSource).not.toContain('sanitizeHtml(');
    expect(rendererSource).not.toContain('executeJs(');
    expect(rendererSource).not.toContain('custom js error');
    expect(inlineSource).toContain('export function renderWidgetInlineCode');
    expect(inlineSource).toContain("from '../../shared/sanitize/sanitizer.js'");
    expect(inlineSource).toContain("from '../../shared/scripts/executeJs.js'");
    expect(inlineSource).toContain('sanitizeHtml(');
    expect(inlineSource).toContain('executeJs(');
    expect(inlineSource).toContain('custom js error');
  });

  test('widgets renderer delegates DOM shell setup to a rendering helper', () => {
    const rendererSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'rendering', 'widgetRenderer.ts'),
      'utf8'
    );
    const shellSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'rendering', 'widgetShell.ts'),
      'utf8'
    );

    expect(rendererSource).toContain("from './widgetShell.js'");
    expect(rendererSource).not.toContain('function stopFormControlDrag');
    expect(rendererSource).not.toContain('content.replaceChildren()');
    expect(rendererSource).not.toContain("document.createElement('div')");
    expect(rendererSource).not.toContain('widget-container admin-widget');
    expect(shellSource).toContain('export function createWidgetRenderShell');
    expect(shellSource).toContain('function stopFormControlDrag');
    expect(shellSource).toContain('content.replaceChildren()');
    expect(shellSource).toContain('widget-container admin-widget');
  });

  test('widgets renderer delegates dynamic module rendering to a rendering helper', () => {
    const rendererSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'rendering', 'widgetRenderer.ts'),
      'utf8'
    );
    const moduleRendererSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'rendering', 'widgetModuleRenderer.ts'),
      'utf8'
    );

    expect(rendererSource).toContain("from './widgetModuleRenderer.js'");
    expect(rendererSource).not.toContain("from './widgetModuleLoader.js'");
    expect(rendererSource).not.toContain('loadWidgetModule');
    expect(rendererSource).not.toContain('window.ADMIN_TOKEN');
    expect(rendererSource).not.toContain('blocked widget import path');
    expect(rendererSource).not.toContain('widget import error');
    expect(moduleRendererSource).toContain('export async function renderWidgetModule');
    expect(moduleRendererSource).toContain("from './widgetModuleLoader.js'");
    expect(moduleRendererSource).toContain('loadWidgetModule');
    expect(moduleRendererSource).toContain('window.ADMIN_TOKEN');
    expect(moduleRendererSource).toContain('blocked widget import path');
    expect(moduleRendererSource).toContain('widget import error');
  });

  test('plainspace public widgets use editable bridge instead of build bundle imports', () => {
    const source = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'public', 'basicwidgets', 'textBoxWidget.ts'),
      'utf8'
    );
    const bridgeSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'rendering', 'editableRegistration.ts'),
      'utf8'
    );

    expect(source).toContain("../../../rendering/editableRegistration.js");
    expect(source).toContain('registerEditableElement(editable,');
    expect(source).not.toContain('/build/designerEditor.js');
    expect(bridgeSource).toContain('ui:widget-editable-mounted');
    expect(bridgeSource).toContain('/build/designerEditor.js');
  });

  test('widget options delegate percent sizing to a dedicated helper', () => {
    const optionsSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'options', 'widgetOptions.ts'),
      'utf8'
    );
    const percentSizingSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'options', 'widgetPercentSizing.ts'),
      'utf8'
    );

    expect(optionsSource).toContain("from './widgetPercentSizing.js'");
    expect(optionsSource).toContain('export function applyWidgetOptions');
    expect(optionsSource).not.toContain('function percentToUnits');
    expect(optionsSource).not.toContain('function getGridDimension');
    expect(optionsSource).not.toContain('function replayPercentSizing');
    expect(optionsSource).not.toContain('const pendingPercentReplays');
    expect(percentSizingSource).toContain('export function coercePercent');
    expect(percentSizingSource).toContain('export function percentToUnits');
    expect(percentSizingSource).toContain('export function computePercentUpdate');
    expect(percentSizingSource).toContain('export function schedulePercentReplay');
    expect(percentSizingSource).toContain('const pendingPercentReplays');
  });

  test('widget options delegate DOM metadata application to a dedicated helper', () => {
    const optionsSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'options', 'widgetOptions.ts'),
      'utf8'
    );
    const domSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'options', 'widgetOptionDom.ts'),
      'utf8'
    );

    expect(optionsSource).toContain("from './widgetOptionDom.js'");
    expect(optionsSource).toContain('applyWidgetDomOptions(wrapper, opts)');
    expect(optionsSource).not.toContain("wrapper.classList.add('max')");
    expect(optionsSource).not.toContain("wrapper.classList.add('half-width')");
    expect(optionsSource).not.toContain('wrapper.dataset.wPercent');
    expect(optionsSource).not.toContain("querySelector<HTMLElement>('.canvas-item-content')");
    expect(domSource).toContain('export function applyWidgetDomOptions');
    expect(domSource).toContain("wrapper.classList.add('max')");
    expect(domSource).toContain("wrapper.classList.add('half-width')");
    expect(domSource).toContain('wrapper.dataset.wPercent');
    expect(domSource).toContain("querySelector<HTMLElement>('.canvas-item-content')");
  });

  test('widgets panel delegates add-widget pipeline to a panel helper', () => {
    const panelSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'panel', 'widgetsPanel.ts'),
      'utf8'
    );
    const addSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'panel', 'widgetPanelAddWidget.ts'),
      'utf8'
    );

    expect(panelSource).toContain("from './widgetPanelAddWidget.js'");
    expect(panelSource).not.toContain("from '../options/widgetOptions.js'");
    expect(panelSource).not.toContain("from '../rendering/widgetRenderer.js'");
    expect(panelSource).not.toContain("from './widgetControls.js'");
    expect(panelSource).not.toContain('window.meltdownEmit');
    expect(panelSource).not.toContain('grid.addWidget');
    expect(panelSource).not.toContain('DEFAULT_ADMIN_ROWS');
    expect(addSource).toContain('export async function addDashboardWidget');
    expect(addSource).toContain("from '../../shared/layout/dashboardSlots.js'");
    expect(addSource).toContain("from '../rendering/widgetRenderer.js'");
    expect(addSource).toContain("from './widgetControls.js'");
    expect(addSource).not.toContain('grid.addWidget');
    expect(addSource).toContain('registerWidget?.(wrapper)');
    expect(addSource).toContain('getWidgetInstance');
    expect(addSource).toContain('ui:widget:add');
  });

  test('widgets panel delegates catalog rendering to a panel helper', () => {
    const panelSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'panel', 'widgetsPanel.ts'),
      'utf8'
    );
    const catalogSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'panel', 'widgetPanelCatalog.ts'),
      'utf8'
    );

    expect(panelSource).toContain("from './widgetPanelCatalog.js'");
    expect(panelSource).toContain('bindWidgetPanelCatalog(panel)');
    expect(panelSource).not.toContain('window.availableWidgets');
    expect(panelSource).not.toContain('widgets-category');
    expect(panelSource).not.toContain('widget-card');
    expect(panelSource).not.toContain('dataTransfer');
    expect(catalogSource).toContain('export function getAvailableWidgetDefinitions');
    expect(catalogSource).toContain('export function groupWidgetsByCategory');
    expect(catalogSource).toContain('export function bindWidgetPanelCatalog');
    expect(catalogSource).toContain('window.availableWidgets');
    expect(catalogSource).toContain('widgets-category');
    expect(catalogSource).toContain('widget-card');
    expect(catalogSource).toContain('dataTransfer');
  });

  test('plainspace widget list delegates data loading to a data helper', () => {
    const widgetSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'widgetListWidget.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'widgetListData.ts'),
      'utf8'
    );

    expect(widgetSource).toContain("from './widgetListData.js'");
    expect(widgetSource).not.toContain('function toWidgets');
    expect(widgetSource).not.toContain('function toPages');
    expect(widgetSource).not.toContain('function toLayoutItems');
    expect(widgetSource).not.toContain('widget.registry.request.v1');
    expect(widgetSource).not.toContain('getPagesByLane');
    expect(widgetSource).not.toContain('getLayoutForViewport');
    expect(widgetSource).not.toContain('localStorage.getItem');
    expect(dataSource).toContain('export function toWidgets');
    expect(dataSource).toContain('export function toPages');
    expect(dataSource).toContain('export function toLayoutItems');
    expect(dataSource).toContain('export async function fetchWidgetRegistry');
    expect(dataSource).toContain('export async function fetchGlobalWidgetIds');
    expect(dataSource).toContain('export function getWidgetTemplates');
    expect(dataSource).toContain('emitRuntimeAdmin');
    expect(dataSource).toContain("'plainSpace', 'widgetRegistry'");
    expect(dataSource).toContain("'pages', 'byLane'");
    expect(dataSource).toContain("'plainSpace', 'layoutForViewport'");
  });

  test('plainspace module list delegates registry data and actions to a data helper', () => {
    const widgetSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'modulesListWidget.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'modulesListData.ts'),
      'utf8'
    );

    expect(widgetSource).toContain("from './modulesListData.js'");
    expect(widgetSource).not.toContain('function toArray');
    expect(widgetSource).not.toContain('function toModules');
    expect(widgetSource).not.toContain('function errorMessage');
    expect(widgetSource).not.toContain('function renderModuleMeta');
    expect(widgetSource).not.toContain('getModuleRegistry');
    expect(widgetSource).not.toContain('listSystemModules');
    expect(widgetSource).not.toContain('activateModuleInRegistry');
    expect(widgetSource).not.toContain('deactivateModuleInRegistry');
    expect(widgetSource).not.toContain('installModuleFromZip');
    expect(widgetSource).not.toContain('moduleType');
    expect(dataSource).toContain('export function toModules');
    expect(dataSource).toContain('export function errorMessage');
    expect(dataSource).toContain('export function renderModuleMeta');
    expect(dataSource).toContain('export function zipDataFromDataUrl');
    expect(dataSource).toContain('export async function fetchModuleLists');
    expect(dataSource).toContain('export async function toggleModuleRegistryActivation');
    expect(dataSource).toContain('export async function installModuleZip');
    expect(dataSource).toContain('PLAINSPACE_MODULES_EMITTER_UNAVAILABLE');
    expect(dataSource).toContain('emitRuntimeAdmin');
    expect(dataSource).toContain("'modules', 'registry'");
    expect(dataSource).toContain("'modules', 'system'");
    expect(dataSource).toContain("moduleRecord.is_active ? 'deactivate' : 'activate'");
    expect(dataSource).toContain("'modules', 'installZip'");
  });

  test('plainspace user list delegates user-management data and actions to a data helper', () => {
    const widgetSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'usersListWidget.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'usersListData.ts'),
      'utf8'
    );

    expect(widgetSource).toContain("from './usersListData.js'");
    expect(widgetSource).not.toContain('function toArray');
    expect(widgetSource).not.toContain('function toUsers');
    expect(widgetSource).not.toContain('function toRoles');
    expect(widgetSource).not.toContain('function errorMessage');
    expect(widgetSource).not.toContain('function permissionsPromptDefault');
    expect(widgetSource).not.toContain('getAllUsers');
    expect(widgetSource).not.toContain('getAllRoles');
    expect(widgetSource).not.toContain("'createUser'");
    expect(widgetSource).not.toContain("'createRole'");
    expect(widgetSource).not.toContain("'updateRole'");
    expect(widgetSource).not.toContain("'deleteRole'");
    expect(dataSource).toContain('export function toUsers');
    expect(dataSource).toContain('export function toRoles');
    expect(dataSource).toContain('export function errorMessage');
    expect(dataSource).toContain('export function permissionsPromptDefault');
    expect(dataSource).toContain('export async function fetchUsers');
    expect(dataSource).toContain('export async function fetchRoles');
    expect(dataSource).toContain('export async function createUserRecord');
    expect(dataSource).toContain('export async function createRoleRecord');
    expect(dataSource).toContain('export async function updateRoleRecord');
    expect(dataSource).toContain('export async function deleteRoleRecord');
    expect(dataSource).toContain('emitRuntimeAdmin');
    expect(dataSource).toContain("'users', 'list'");
    expect(dataSource).toContain("'roles', 'list'");
    expect(dataSource).toContain("'users', 'create'");
    expect(dataSource).toContain("'roles', 'create'");
    expect(dataSource).toContain("'roles', 'update'");
    expect(dataSource).toContain("'roles', 'delete'");
  });

  test('plainspace permissions delegates permission data and role actions to data helpers', () => {
    const widgetSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'permissionsWidget.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'permissionsData.ts'),
      'utf8'
    );
    const usersDataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'usersListData.ts'),
      'utf8'
    );

    expect(widgetSource).toContain("from './permissionsData.js'");
    expect(widgetSource).not.toContain('function toArray');
    expect(widgetSource).not.toContain('function errorMessage');
    expect(widgetSource).not.toContain('function permissionsPromptDefault');
    expect(widgetSource).not.toContain('getAllPermissions');
    expect(widgetSource).not.toContain('getAllRoles');
    expect(widgetSource).not.toContain("'createPermission'");
    expect(widgetSource).not.toContain("'createRole'");
    expect(widgetSource).not.toContain("'updateRole'");
    expect(widgetSource).not.toContain("'deleteRole'");
    expect(dataSource).toContain("from './usersListData.js'");
    expect(dataSource).toContain('export function toPermissions');
    expect(dataSource).toContain('export async function fetchPermissions');
    expect(dataSource).toContain('export async function fetchPermissionsState');
    expect(dataSource).toContain('export async function createPermissionRecord');
    expect(dataSource).toContain("'permissions', 'list'");
    expect(dataSource).toContain("'permissions', 'create'");
    expect(dataSource).toContain('createRoleRecord');
    expect(dataSource).toContain('updateRoleRecord');
    expect(dataSource).toContain('deleteRoleRecord');
    expect(usersDataSource).toContain("'roles', 'list'");
    expect(usersDataSource).toContain("'roles', 'create'");
    expect(usersDataSource).toContain("'roles', 'update'");
    expect(usersDataSource).toContain("'roles', 'delete'");
  });

  test('plainspace designer layouts delegates designer data to a data helper', () => {
    const widgetSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'designerLayoutsWidget.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'designerLayoutsData.ts'),
      'utf8'
    );

    expect(widgetSource).toContain("from './designerLayoutsData.js'");
    expect(widgetSource).not.toContain('function toDesigns');
    expect(widgetSource).not.toContain('function designUrl');
    expect(widgetSource).not.toContain('designer.listDesigns');
    expect(widgetSource).not.toContain('moduleName');
    expect(widgetSource).not.toContain('moduleType');
    expect(dataSource).toContain('export function toDesigns');
    expect(dataSource).toContain('export function designUrl');
    expect(dataSource).toContain('export function sortDesignsByRecent');
    expect(dataSource).toContain('export async function fetchDesignerLayouts');
    expect(dataSource).toContain('PLAINSPACE_DESIGNER_LAYOUTS_EMITTER_UNAVAILABLE');
    expect(dataSource).toContain('emitRuntimeAdmin');
    expect(dataSource).toContain("'designer', 'list'");
    expect(dataSource).not.toContain('designer.listDesigns');
    expect(dataSource).not.toContain('moduleName');
    expect(dataSource).not.toContain('moduleType');
  });

  test('plainspace user edit delegates profile data and actions to a data helper', () => {
    const widgetSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'userEditWidget.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'userEditData.ts'),
      'utf8'
    );

    expect(widgetSource).toContain("from './userEditData.js'");
    expect(widgetSource).not.toContain('function toUser');
    expect(widgetSource).not.toContain('function userValue');
    expect(widgetSource).not.toContain('function errorMessage');
    expect(widgetSource).not.toContain('getUserDetailsById');
    expect(widgetSource).not.toContain("'updateUserProfile'");
    expect(widgetSource).not.toContain("'deleteUser'");
    expect(widgetSource).not.toContain('moduleName');
    expect(widgetSource).not.toContain('moduleType');
    expect(dataSource).toContain('export function toUser');
    expect(dataSource).toContain('export function userValue');
    expect(dataSource).toContain('export function errorMessage');
    expect(dataSource).toContain('export function buildUserProfilePayload');
    expect(dataSource).toContain('export async function fetchUserDetails');
    expect(dataSource).toContain('export async function updateUserProfile');
    expect(dataSource).toContain('export async function deleteUserRecord');
    expect(dataSource).toContain('PLAINSPACE_USER_EDIT_EMITTER_UNAVAILABLE');
    expect(dataSource).toContain('emitRuntimeAdmin');
    expect(dataSource).toContain('runtimeAdminPayload');
    expect(dataSource).toContain("'users', 'get'");
    expect(dataSource).toContain("'users', 'update'");
    expect(dataSource).toContain("'users', 'delete'");
    expect(dataSource).not.toContain('getUserDetailsById');
    expect(dataSource).not.toContain('moduleName');
    expect(dataSource).not.toContain('moduleType');
  });

  test('plainspace system settings delegates settings data and actions to a data helper', () => {
    const widgetSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'systemSettingsWidget.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'systemSettingsData.ts'),
      'utf8'
    );

    expect(widgetSource).toContain("from './systemSettingsData.js'");
    expect(widgetSource).not.toContain('function toArray');
    expect(widgetSource).not.toContain('function toPages');
    expect(widgetSource).not.toContain('function asSetting');
    expect(widgetSource).not.toContain('function errorMessage');
    expect(widgetSource).not.toContain("'getSetting'");
    expect(widgetSource).not.toContain("'setSetting'");
    expect(widgetSource).not.toContain('getAllPages');
    expect(widgetSource).not.toContain('openMediaExplorer');
    expect(dataSource).toContain('export function toPages');
    expect(dataSource).toContain('export function asSetting');
    expect(dataSource).toContain('export function errorMessage');
    expect(dataSource).toContain('export async function fetchSystemSettings');
    expect(dataSource).toContain('export async function setSystemSetting');
    expect(dataSource).toContain('export async function pickFaviconUrl');
    expect(dataSource).toContain("'settings', 'get'");
    expect(dataSource).toContain("'settings', 'set'");
    expect(dataSource).toContain("'pages', 'list'");
    expect(dataSource).toContain('openMediaExplorer');
  });

  test('plainspace settings panels delegate settings routes to a data helper', () => {
    const panelSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'settings', 'settingsPanels.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'settings', 'settingsPanelsData.ts'),
      'utf8'
    );

    expect(panelSource).toContain("from './settingsPanelsData.js'");
    expect(panelSource).not.toContain('SETTINGS_MODULE');
    expect(panelSource).not.toContain("'getSetting'");
    expect(panelSource).not.toContain("'setSetting'");
    expect(panelSource).not.toContain('getAllPages');
    expect(panelSource).not.toContain('openMediaExplorer');
    expect(panelSource).not.toContain('moduleName');
    expect(panelSource).not.toContain('moduleType');
    expect(panelSource).not.toContain('SEO_META_DESCRIPTION');
    expect(panelSource).not.toContain('ALLOW_REGISTRATION');
    expect(dataSource).toContain('export function boolToString');
    expect(dataSource).toContain('export function stringToBool');
    expect(dataSource).toContain('export function toPages');
    expect(dataSource).toContain('export function publicPages');
    expect(dataSource).toContain('export async function fetchGeneralSettings');
    expect(dataSource).toContain('export async function saveGeneralSettings');
    expect(dataSource).toContain('export async function fetchDesignSettings');
    expect(dataSource).toContain('export async function pickMediaShareUrl');
    expect(dataSource).toContain('export async function fetchSeoSettings');
    expect(dataSource).toContain('export async function saveSeoSettings');
    expect(dataSource).toContain('export async function fetchSecuritySettings');
    expect(dataSource).toContain('export async function saveMaintenanceSettings');
    expect(dataSource).toContain('PLAINSPACE_SETTINGS_PANELS_EMITTER_UNAVAILABLE');
    expect(dataSource).toContain("'settings', 'get'");
    expect(dataSource).toContain("'settings', 'set'");
    expect(dataSource).toContain("'pages', 'list'");
    expect(dataSource).toContain('openMediaExplorer');
    expect(dataSource).not.toContain('settingsManager');
    expect(dataSource).not.toContain('pagesManager');
  });

  test('plainspace fonts list delegates provider data and actions to a data helper', () => {
    const widgetSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'fontsListWidget.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'fontsListData.ts'),
      'utf8'
    );

    expect(widgetSource).toContain("from './fontsListData.js'");
    expect(widgetSource).not.toContain('function toProviders');
    expect(widgetSource).not.toContain('function errorMessage');
    expect(widgetSource).not.toContain('listFontProviders');
    expect(widgetSource).not.toContain("'getSetting'");
    expect(widgetSource).not.toContain("'setSetting'");
    expect(widgetSource).not.toContain("'setFontProviderEnabled'");
    expect(widgetSource).not.toContain('fontsManager');
    expect(widgetSource).not.toContain('settingsManager');
    expect(dataSource).toContain('export function toProviders');
    expect(dataSource).toContain('export function errorMessage');
    expect(dataSource).toContain('export async function fetchFontProviders');
    expect(dataSource).toContain('export async function fetchGoogleFontsKey');
    expect(dataSource).toContain('export async function fetchFontProvidersState');
    expect(dataSource).toContain('export async function setFontProviderEnabled');
    expect(dataSource).toContain('export async function saveGoogleFontsKey');
    expect(dataSource).toContain('export async function refreshFontProviderCatalog');
    expect(dataSource).toContain("'fonts', 'listProviders'");
    expect(dataSource).toContain("'settings', 'get'");
    expect(dataSource).toContain("'settings', 'set'");
    expect(dataSource).toContain("'fonts', 'setProviderEnabled'");
    expect(dataSource).not.toContain('fontsManager');
    expect(dataSource).not.toContain('settingsManager');
  });

  test('plainspace login strategies delegates auth data and actions to a data helper', () => {
    const widgetSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'loginStrategiesWidget.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'loginStrategiesData.ts'),
      'utf8'
    );

    expect(widgetSource).toContain("from './loginStrategiesData.js'");
    expect(widgetSource).not.toContain('function toStrategies');
    expect(widgetSource).not.toContain('function errorMessage');
    expect(widgetSource).not.toContain('listLoginStrategies');
    expect(widgetSource).not.toContain("'setLoginStrategyEnabled'");
    expect(widgetSource).not.toContain('moduleName');
    expect(widgetSource).not.toContain('moduleType');
    expect(widgetSource).not.toContain('adminLocal');
    expect(dataSource).toContain('export function toStrategies');
    expect(dataSource).toContain('export function visibleLoginStrategies');
    expect(dataSource).toContain('export function errorMessage');
    expect(dataSource).toContain('export async function fetchLoginStrategies');
    expect(dataSource).toContain('export async function setLoginStrategyEnabled');
    expect(dataSource).toContain("'auth', 'loginStrategies'");
    expect(dataSource).toContain("'auth', 'setStrategyEnabled'");
    expect(dataSource).not.toContain('listLoginStrategies');
    expect(dataSource).not.toContain('moduleName');
    expect(dataSource).not.toContain('moduleType');
    expect(dataSource).toContain('adminLocal');
  });

  test('plainspace login strategy edit delegates settings data and actions to a data helper', () => {
    const widgetSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'loginStrategyEditWidget.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'loginStrategyEditData.ts'),
      'utf8'
    );

    expect(widgetSource).toContain("from './loginStrategyEditData.js'");
    expect(widgetSource).not.toContain('function asSetting');
    expect(widgetSource).not.toContain('function errorMessage');
    expect(widgetSource).not.toContain("'getSetting'");
    expect(widgetSource).not.toContain("'setSetting'");
    expect(widgetSource).not.toContain('settingsManager');
    expect(widgetSource).not.toContain('_CLIENT_ID');
    expect(widgetSource).not.toContain('_CLIENT_SECRET');
    expect(widgetSource).not.toContain('_SCOPE');
    expect(dataSource).toContain('export function asSetting');
    expect(dataSource).toContain('export function normalizeScope');
    expect(dataSource).toContain('export function errorMessage');
    expect(dataSource).toContain('export function strategySettingKey');
    expect(dataSource).toContain('export function buildLoginStrategySettingPayloads');
    expect(dataSource).toContain('export async function fetchLoginStrategySettings');
    expect(dataSource).toContain('export async function saveLoginStrategySettings');
    expect(dataSource).toContain('PLAINSPACE_LOGIN_STRATEGY_EDIT_EMITTER_UNAVAILABLE');
    expect(dataSource).toContain('runtimeAdminPayload');
    expect(dataSource).toContain("'settings', 'get'");
    expect(dataSource).toContain("'settings', 'set'");
    expect(dataSource).not.toContain('settingsManager');
    expect(dataSource).toContain('CLIENT_ID');
    expect(dataSource).toContain('CLIENT_SECRET');
    expect(dataSource).toContain('SCOPE');
  });

  test('plainspace media explorer delegates media data and actions to a data helper', () => {
    const widgetSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'mediaExplorerWidget.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'mediaExplorerData.ts'),
      'utf8'
    );
    const sharedDataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shared', 'media', 'mediaLibraryData.ts'),
      'utf8'
    );
    const surfaceSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shared', 'media', 'mediaExplorerSurface.ts'),
      'utf8'
    );

    expect(widgetSource).toContain("from '../../../shared/media/mediaExplorerSurface.js'");
    expect(widgetSource).not.toContain('function toListing');
    expect(widgetSource).not.toContain('function errorMessage');
    expect(widgetSource).not.toContain('new FormData');
    expect(widgetSource).not.toContain('/admin/api/upload');
    expect(widgetSource).not.toContain('listLocalFolder');
    expect(widgetSource).not.toContain('createLocalFolder');
    expect(widgetSource).not.toContain('createShareLink');
    expect(widgetSource).not.toContain('moduleName');
    expect(widgetSource).not.toContain('moduleType');
    expect(dataSource).toContain("from '../../../shared/media/mediaLibraryData.js'");
    expect(dataSource).toContain('export function toListing');
    expect(dataSource).toContain('mediaItemPath');
    expect(dataSource).toContain('mediaUploadUrl');
    expect(dataSource).toContain('uploadMediaFile');
    expect(dataSource).toContain('renameMediaItem');
    expect(dataSource).toContain('deleteMediaItem');
    expect(dataSource).toContain('export async function createMediaFolder');
    expect(dataSource).toContain('export async function listMediaFolder');
    expect(dataSource).toContain('export async function createMediaShareLink');
    expect(dataSource).not.toContain('moduleName');
    expect(dataSource).not.toContain('moduleType');
    expect(surfaceSource).toContain('export function createMediaExplorerSurface');
    expect(surfaceSource).toContain('renameMediaItem');
    expect(surfaceSource).toContain('deleteMediaItem');
    expect(surfaceSource).toContain("from '../dialogs/bpDialog.js'");
    expect(surfaceSource).not.toContain('window.alert');
    expect(surfaceSource).not.toContain('window.confirm');
    expect(surfaceSource).not.toContain('window.prompt');
    expect(sharedDataSource).toContain('MEDIA_LIBRARY_EMITTER_UNAVAILABLE');
    expect(sharedDataSource).toContain('MEDIA_LIBRARY_FETCH_UNAVAILABLE');
    expect(sharedDataSource).toContain('/admin/api/upload');
    expect(sharedDataSource).toContain("'media', 'listLocalFolder'");
    expect(sharedDataSource).toContain("'media', 'createLocalFolder'");
    expect(sharedDataSource).toContain("'media', 'renameLocalItem'");
    expect(sharedDataSource).toContain("'media', 'deleteLocalItem'");
    expect(sharedDataSource).toContain("'shares', 'create'");
    expect(sharedDataSource).toContain('runtimeManager');
    expect(sharedDataSource).not.toContain('mediaManager');
    expect(sharedDataSource).not.toContain('shareManager');
  });

  test('plainspace page editor delegates page data and actions to a data helper', () => {
    const widgetSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'pageEditorWidgets', 'pageEditorWidget.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'pageEditorWidgets', 'pageEditorData.ts'),
      'utf8'
    );

    expect(widgetSource).toContain("from './pageEditorData.js'");
    expect(widgetSource).not.toContain('function toPage');
    expect(widgetSource).not.toContain('function toTemplates');
    expect(widgetSource).not.toContain('function errorMessage');
    expect(widgetSource).not.toContain('function asString');
    expect(widgetSource).not.toContain('getLayoutTemplateNames');
    expect(widgetSource).not.toContain('updatePage');
    expect(widgetSource).not.toContain('moduleName');
    expect(widgetSource).not.toContain('moduleType');
    expect(dataSource).toContain('export function toPage');
    expect(dataSource).toContain('export function toTemplates');
    expect(dataSource).toContain('export function visibleTemplates');
    expect(dataSource).toContain('export function errorMessage');
    expect(dataSource).toContain('export function asString');
    expect(dataSource).toContain('export function buildPageUpdatePayload');
    expect(dataSource).toContain('export function clearPageEditorCache');
    expect(dataSource).toContain('export async function fetchPageEditorTemplates');
    expect(dataSource).toContain('export async function savePageEditorPage');
    expect(dataSource).toContain('PLAINSPACE_PAGE_EDITOR_EMITTER_UNAVAILABLE');
    expect(dataSource).toContain("'plainSpace', 'layoutTemplateNames'");
    expect(dataSource).toContain("'pages', 'update'");
    expect(dataSource).toContain('cmsAdminApiRequest');
    expect(dataSource).not.toContain('pagesManager');
    expect(dataSource).not.toContain("moduleName: 'plainspace'");
  });

  test('plainspace page content delegates content data and actions to a data helper', () => {
    const widgetSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'pageEditorWidgets', 'pageContentWidget.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'pageEditorWidgets', 'pageContentData.ts'),
      'utf8'
    );

    expect(widgetSource).toContain("from './pageContentData.js'");
    expect(widgetSource).not.toContain('function toPage');
    expect(widgetSource).not.toContain('function toDesigns');
    expect(widgetSource).not.toContain('function toFiles');
    expect(widgetSource).not.toContain('function toBuilderApps');
    expect(widgetSource).not.toContain('function errorMessage');
    expect(widgetSource).not.toContain('listBuilderApps');
    expect(widgetSource).not.toContain('designer.listDesigns');
    expect(widgetSource).not.toContain('createLocalFolder');
    expect(widgetSource).not.toContain('listLocalFolder');
    expect(widgetSource).not.toContain('uploadFileToFolder');
    expect(widgetSource).not.toContain('updatePage');
    expect(widgetSource).not.toContain('moduleName');
    expect(widgetSource).not.toContain('moduleType');
    expect(dataSource).toContain('export function toPage');
    expect(dataSource).toContain('export function toDesigns');
    expect(dataSource).toContain('export function toFiles');
    expect(dataSource).toContain('export function toBuilderApps');
    expect(dataSource).toContain('export function buildPageContentUpdatePayload');
    expect(dataSource).toContain('export function clearPageContentCache');
    expect(dataSource).toContain('export function attachDesignMeta');
    expect(dataSource).toContain('export function attachHtmlMeta');
    expect(dataSource).toContain('export async function fetchBuilderApps');
    expect(dataSource).toContain('export async function fetchPublishedDesigns');
    expect(dataSource).toContain('export async function listHtmlFiles');
    expect(dataSource).toContain('export async function uploadHtmlFile');
    expect(dataSource).toContain('export async function savePageContent');
    expect(dataSource).toContain('PLAINSPACE_PAGE_CONTENT_EMITTER_UNAVAILABLE');
    expect(dataSource).toContain("'apps', 'builderList'");
    expect(dataSource).toContain("'designer', 'list'");
    expect(dataSource).toContain("'media', 'createLocalFolder'");
    expect(dataSource).toContain("'media', 'listLocalFolder'");
    expect(dataSource).toContain("'media', 'uploadToFolder'");
    expect(dataSource).toContain("'pages', 'update'");
  });

  test('plainspace page stats delegates lane data and summaries to a data helper', () => {
    const widgetSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'defaultwidgets', 'pageStats.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'defaultwidgets', 'pageStatsData.ts'),
      'utf8'
    );

    expect(widgetSource).toContain("from './pageStatsData.js'");
    expect(widgetSource).not.toContain('function toPages');
    expect(widgetSource).not.toContain('function errorMessage');
    expect(widgetSource).not.toContain('getPagesByLane');
    expect(widgetSource).not.toContain('moduleName');
    expect(widgetSource).not.toContain('moduleType');
    expect(dataSource).toContain('export function toPages');
    expect(dataSource).toContain('export function errorMessage');
    expect(dataSource).toContain('export function buildPageLanePayload');
    expect(dataSource).toContain('export function summarizePageStats');
    expect(dataSource).toContain('export async function fetchPageStats');
    expect(dataSource).toContain('PLAINSPACE_PAGE_STATS_EMITTER_UNAVAILABLE');
    expect(dataSource).toContain('runtimeAdminPayload');
    expect(dataSource).toContain("'pages', 'byLane'");
    expect(dataSource).not.toContain('getPagesByLane');
    expect(dataSource).not.toContain('moduleName');
    expect(dataSource).not.toContain('moduleType');
  });

  test('plainspace content summary delegates content data and draft creation to a data helper', () => {
    const widgetSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'defaultwidgets', 'contentSummaryWidget.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'defaultwidgets', 'contentSummaryData.ts'),
      'utf8'
    );

    expect(widgetSource).toContain("from './contentSummaryData.js'");
    expect(widgetSource).not.toContain('function toDesigns');
    expect(widgetSource).not.toContain('function toPages');
    expect(widgetSource).not.toContain('function decodeAdminId');
    expect(widgetSource).not.toContain('designer.listDesigns');
    expect(widgetSource).not.toContain('designer.saveDesign');
    expect(widgetSource).not.toContain('getAllPages');
    expect(widgetSource).not.toContain('moduleName');
    expect(widgetSource).not.toContain('moduleType');
    expect(dataSource).toContain('export function toDesigns');
    expect(dataSource).toContain('export function toPages');
    expect(dataSource).toContain('export function uploadedContentPages');
    expect(dataSource).toContain('export function decodeAdminId');
    expect(dataSource).toContain('export function buildDraftDesignRecord');
    expect(dataSource).toContain('export async function fetchContentDesigns');
    expect(dataSource).toContain('export async function fetchUploadedContentPages');
    expect(dataSource).toContain('export async function createDraftDesign');
    expect(dataSource).toContain('PLAINSPACE_CONTENT_SUMMARY_EMITTER_UNAVAILABLE');
    expect(dataSource).toContain("'designer', 'list'");
    expect(dataSource).toContain("'designer', 'save'");
    expect(dataSource).toContain("'pages', 'list'");
    expect(dataSource).not.toContain('designer.listDesigns');
    expect(dataSource).not.toContain('moduleName');
    expect(dataSource).not.toContain('moduleType');
  });

  test('plainspace access settings delegates settings data and actions to a data helper', () => {
    const widgetSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'accessSettingsWidget.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'accessSettingsData.ts'),
      'utf8'
    );

    expect(widgetSource).toContain("from './accessSettingsData.js'");
    expect(widgetSource).not.toContain('function errorMessage');
    expect(widgetSource).not.toContain('function asBooleanSetting');
    expect(widgetSource).not.toContain("'getSetting'");
    expect(widgetSource).not.toContain("'setSetting'");
    expect(widgetSource).not.toContain('settingsManager');
    expect(widgetSource).not.toContain('ALLOW_REGISTRATION');
    expect(widgetSource).not.toContain('FIRST_INSTALL_DONE');
    expect(dataSource).toContain('export function errorMessage');
    expect(dataSource).toContain('export function asBooleanSetting');
    expect(dataSource).toContain('export async function fetchAccessSettings');
    expect(dataSource).toContain('export async function setAllowRegistration');
    expect(dataSource).toContain("'settings', 'get'");
    expect(dataSource).toContain("'settings', 'set'");
    expect(dataSource).not.toContain('settingsManager');
    expect(dataSource).toContain('ALLOW_REGISTRATION');
    expect(dataSource).toContain('FIRST_INSTALL_DONE');
  });

  test('plainspace layout templates delegates template data and actions to a data helper', () => {
    const widgetSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'layoutTemplatesWidget.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'layoutTemplatesData.ts'),
      'utf8'
    );

    expect(widgetSource).toContain("from './layoutTemplatesData.js'");
    expect(widgetSource).not.toContain('function toTemplateNames');
    expect(widgetSource).not.toContain('function toPages');
    expect(widgetSource).not.toContain('function errorMessage');
    expect(widgetSource).not.toContain('getLayoutTemplateNames');
    expect(widgetSource).not.toContain('getPagesByLane');
    expect(widgetSource).not.toContain('saveLayoutTemplate');
    expect(widgetSource).not.toContain('moduleName');
    expect(widgetSource).not.toContain('moduleType');
    expect(widgetSource).not.toContain('usedMap');
    expect(dataSource).toContain('export function toTemplateNames');
    expect(dataSource).toContain('export function toPages');
    expect(dataSource).toContain('export function errorMessage');
    expect(dataSource).toContain('export function buildTemplateViews');
    expect(dataSource).toContain('export async function fetchLayoutTemplateNames');
    expect(dataSource).toContain('export async function fetchPublicPages');
    expect(dataSource).toContain('export async function createBlankLayoutTemplate');
    expect(dataSource).toContain("'plainSpace', 'layoutTemplateNames'");
    expect(dataSource).toContain("'pages', 'byLane'");
    expect(dataSource).toContain("'plainSpace', 'saveLayoutTemplate'");
    expect(dataSource).not.toContain('getPagesByLane');
    expect(dataSource).not.toContain('moduleName');
    expect(dataSource).not.toContain('moduleType');
    expect(dataSource).toContain('usedMap');
  });

  test('widget sources do not import build bundles outside explicit bridges', () => {
    const allowedBridgeFiles = new Set([
      'ui/widgets/rendering/editableRegistration.ts',
      'ui/widgets/rendering/editableRegistration.js'
    ]);
    const violations = [];

    sourceFiles('ui', 'widgets').forEach(filePath => {
      const repoPath = toRepoPath(filePath);
      if (allowedBridgeFiles.has(repoPath)) return;

      importSpecifiers(fs.readFileSync(filePath, 'utf8')).forEach(specifier => {
        if (specifier.startsWith('/build/')) {
          violations.push(`${repoPath} -> ${specifier}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  test('widget sources do not dynamically import shared UI dependencies by absolute path', () => {
    const violations = [];

    sourceFiles('ui', 'widgets').forEach(filePath => {
      dynamicImportSpecifiers(fs.readFileSync(filePath, 'utf8')).forEach(specifier => {
        if (specifier.startsWith('/ui/shared/')) {
          violations.push(`${toRepoPath(filePath)} -> ${specifier}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  test('runtime sources do not dynamically import shared UI dependencies by absolute path', () => {
    const violations = [];

    sourceFiles('ui', 'runtime').forEach(filePath => {
      dynamicImportSpecifiers(fs.readFileSync(filePath, 'utf8')).forEach(specifier => {
        if (specifier.startsWith('/ui/shared/')) {
          violations.push(`${toRepoPath(filePath)} -> ${specifier}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  test('webpack ignored imports are limited to explicit dynamic gateways', () => {
    const allowedFiles = new Set([
      'ui/runtime/main/adminWidgetSurfaces.ts',
      'ui/runtime/main/adminWidgetSurfaces.js',
      'ui/runtime/publicLoaderImporter.ts',
      'ui/runtime/publicLoaderImporter.js',
      'ui/shared/scripts/executeJs.ts',
      'ui/shared/scripts/executeJs.js',
      'ui/widgets/plainspace/admin/settings/settingsPanels.ts',
      'ui/widgets/plainspace/admin/settings/settingsPanels.js',
      'ui/widgets/rendering/editableRegistration.ts',
      'ui/widgets/rendering/editableRegistration.js',
      'ui/widgets/rendering/widgetModuleLoader.ts',
      'ui/widgets/rendering/widgetModuleLoader.js'
    ]);
    const violations = [];

    sourceFiles('ui').forEach(filePath => {
      const repoPath = toRepoPath(filePath);
      if (repoPath.startsWith('ui/designer/')) return;
      if (!fs.readFileSync(filePath, 'utf8').includes('webpackIgnore: true')) return;
      if (!allowedFiles.has(repoPath)) {
        violations.push(repoPath);
      }
    });

    expect(violations).toEqual([]);
  });

  test('widgets UI does not import shell, runtime, or designer modules', () => {
    const forbiddenZones = ['shell', 'runtime', 'designer'];
    const violations = [];

    sourceFiles('ui', 'widgets').forEach(filePath => {
      const source = fs.readFileSync(filePath, 'utf8');
      importSpecifiers(source).forEach(specifier => {
        if (forbiddenZones.some(zone => specifierTargetsUiZone(filePath, specifier, zone))) {
          violations.push(`${toRepoPath(filePath)} -> ${specifier}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  test('shell UI does not import runtime, designer, or widgets modules', () => {
    const forbiddenZones = ['runtime', 'designer', 'widgets'];
    const violations = [];

    sourceFiles('ui', 'shell').forEach(filePath => {
      const source = fs.readFileSync(filePath, 'utf8');
      importSpecifiers(source).forEach(specifier => {
        if (forbiddenZones.some(zone => specifierTargetsUiZone(filePath, specifier, zone))) {
          violations.push(`${toRepoPath(filePath)} -> ${specifier}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  test('shell admin search, notifications, and user color delegate event data to helpers', () => {
    const adminSearchSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'search', 'adminSearch.ts'),
      'utf8'
    );
    const adminSearchDataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'search', 'adminSearchData.ts'),
      'utf8'
    );
    const notificationSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'notifications', 'notificationHub.ts'),
      'utf8'
    );
    const notificationDataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'notifications', 'notificationHubData.ts'),
      'utf8'
    );
    const userColorSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'theme', 'userColor.ts'),
      'utf8'
    );
    const userColorDataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'theme', 'userColorData.ts'),
      'utf8'
    );

    expect(adminSearchSource).toContain("from './adminSearchData.js'");
    expect(adminSearchSource).not.toContain('searchPages');
    expect(adminSearchSource).not.toContain('moduleName');
    expect(adminSearchSource).not.toContain('moduleType');
    expect(adminSearchDataSource).toContain('export async function fetchAdminSearchPages');
    expect(adminSearchDataSource).toContain('SHELL_ADMIN_SEARCH_EMITTER_UNAVAILABLE');
    expect(adminSearchDataSource).toContain("'pages', 'search'");
    expect(adminSearchDataSource).not.toContain('searchPages');
    expect(adminSearchDataSource).not.toContain('pagesManager');

    expect(notificationSource).toContain("from './notificationHubData.js'");
    expect(notificationSource).not.toContain('getRecentNotifications');
    expect(notificationSource).not.toContain('notificationManager');
    expect(notificationDataSource).toContain('export async function fetchRecentNotifications');
    expect(notificationDataSource).toContain('SHELL_NOTIFICATION_HUB_EMITTER_UNAVAILABLE');
    expect(notificationDataSource).toContain("'notifications', 'recent'");
    expect(notificationDataSource).not.toContain('getRecentNotifications');
    expect(notificationDataSource).not.toContain('notificationManager');

    expect(userColorSource).toContain("from './userColorData.js'");
    expect(userColorSource).not.toContain('validateToken');
    expect(userColorSource).not.toContain('getUserDetailsById');
    expect(userColorSource).not.toContain('moduleName');
    expect(userColorSource).not.toContain('moduleType');
    expect(userColorDataSource).toContain('export async function fetchUserColor');
    expect(userColorDataSource).toContain('SHELL_USER_COLOR_EMITTER_UNAVAILABLE');
    expect(userColorDataSource).toContain("'users', 'me'");
    expect(userColorDataSource).not.toContain('validateToken');
    expect(userColorDataSource).not.toContain('getUserDetailsById');
  });

  test('shell media explorer delegates media and share payloads to a data helper', () => {
    const explorerSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'media', 'openExplorer.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'media', 'openExplorerData.ts'),
      'utf8'
    );
    const sharedDataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shared', 'media', 'mediaLibraryData.ts'),
      'utf8'
    );

    expect(explorerSource).toContain("from '../../shared/media/mediaExplorerSurface.js'");
    expect(explorerSource).not.toContain('listLocalFolder');
    expect(explorerSource).not.toContain('createShareLink');
    expect(explorerSource).not.toContain('moduleName');
    expect(explorerSource).not.toContain('moduleType');
    expect(dataSource).toContain("from '../../shared/media/mediaLibraryData.js'");
    expect(dataSource).toContain('export async function listExplorerFolder');
    expect(dataSource).toContain('export async function createExplorerShareLink');
    expect(dataSource).not.toContain('moduleName');
    expect(dataSource).not.toContain('moduleType');
    expect(sharedDataSource).toContain('MEDIA_LIBRARY_EMITTER_UNAVAILABLE');
    expect(sharedDataSource).toContain("'media', 'listLocalFolder'");
    expect(sharedDataSource).toContain("'shares', 'create'");
    expect(sharedDataSource).toContain('runtimeManager');
    expect(sharedDataSource).not.toContain('mediaManager');
    expect(sharedDataSource).not.toContain('shareManager');
  });

  test('shell page data loader delegates bootstrap payload and normalization to a data helper', () => {
    const loaderSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'data', 'pageDataLoader.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'data', 'pageDataLoaderData.ts'),
      'utf8'
    );

    expect(loaderSource).toContain("from './pageDataLoaderData.js'");
    expect(loaderSource).not.toContain('getPageById');
    expect(loaderSource).not.toContain('moduleName');
    expect(loaderSource).not.toContain('moduleType');
    expect(loaderSource).not.toContain('function sanitize');
    expect(dataSource).toContain('export function buildInitialPageDataRequest');
    expect(dataSource).toContain('export function sanitizePageData');
    expect(dataSource).toContain('export function unwrapMeltdownResult');
    expect(dataSource).toContain('cmsAdminApiRequest');
    expect(dataSource).toContain("resource: 'pages'");
    expect(dataSource).toContain("action: 'get'");
    expect(dataSource).toContain("moduleName: 'runtimeManager'");
    expect(dataSource).not.toContain('getPageById');
    expect(dataSource).not.toContain('pagesManager');
  });

  test('shell app frame loader delegates appLoader payloads to a data helper', () => {
    const loaderSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'apps', 'appFrameLoader.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'apps', 'appFrameLoaderData.ts'),
      'utf8'
    );

    expect(loaderSource).toContain("from './appFrameLoaderData.js'");
    expect(loaderSource).not.toContain("'dispatchAppEvent'");
    expect(loaderSource).not.toContain('moduleName');
    expect(loaderSource).not.toContain('moduleType');
    expect(dataSource).toContain('export async function dispatchAppRuntimeRequest');
    expect(dataSource).toContain('export async function dispatchAppRuntimeBatch');
    expect(dataSource).toContain('export async function dispatchAppLifecycleMessage');
    expect(dataSource).toContain('SHELL_APP_FRAME_EMITTER_UNAVAILABLE');
    expect(dataSource).toContain('dispatchAppEvent');
    expect(dataSource).toContain('appLoader');
  });

  test('shell public login strategies delegate auth payloads to a data helper', () => {
    const source = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'auth', 'loginStrategiesPublic.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'auth', 'loginStrategiesPublicData.ts'),
      'utf8'
    );

    expect(source).toContain("from './loginStrategiesPublicData.js'");
    expect(source).not.toContain('issuePublicToken');
    expect(source).not.toContain('listActiveLoginStrategies');
    expect(source).not.toContain('moduleName');
    expect(source).not.toContain('moduleType');
    expect(source).not.toContain('function strategyList');
    expect(dataSource).toContain('export async function fetchPublicLoginStrategies');
    expect(dataSource).toContain('SHELL_LOGIN_STRATEGIES_EMITTER_UNAVAILABLE');
    expect(dataSource).toContain('issuePublicToken');
    expect(dataSource).toContain('emitRuntimePublic');
    expect(dataSource).toContain('activeLoginStrategies');
    expect(dataSource).not.toContain('listActiveLoginStrategies');
    expect(dataSource).toContain("moduleName: 'auth'");
    expect(dataSource).not.toContain('moduleType');
  });

  test('shell public registration delegates token, setting, and register payloads to data helpers', () => {
    const source = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'auth', 'register.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'auth', 'registerData.ts'),
      'utf8'
    );
    const clientSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'data', 'publicMeltdownClient.ts'),
      'utf8'
    );

    expect(source).toContain("from './registerData.js'");
    expect(source).toContain("from '../data/publicMeltdownClient.js'");
    expect(source).not.toContain('issuePublicToken');
    expect(source).not.toContain('getPublicSetting');
    expect(source).not.toContain('publicRegister');
    expect(source).not.toContain('FIRST_INSTALL_DONE');
    expect(source).not.toContain('ALLOW_REGISTRATION');
    expect(source).not.toContain('moduleName');
    expect(source).not.toContain('moduleType');
    expect(dataSource).toContain('export async function fetchRegistrationAvailability');
    expect(dataSource).toContain('export async function registerPublicUser');
    expect(dataSource).toContain('cmsPublicRuntimeRequest');
    expect(dataSource).toContain("'users'");
    expect(dataSource).toContain("'register'");
    expect(dataSource).not.toContain('publicRegister');
    expect(dataSource).not.toContain('userManagement');
    expect(dataSource).not.toContain('moduleName');
    expect(dataSource).not.toContain('moduleType');
    expect(clientSource).toContain('export function resolveShellPublicClient');
    expect(clientSource).toContain('export async function issueShellPublicToken');
    expect(clientSource).toContain('export async function fetchShellPublicSetting');
    expect(clientSource).toContain('issuePublicToken');
    expect(clientSource).toContain('cmsPublicRuntimeRequest');
    expect(clientSource).toContain("'settings'");
    expect(clientSource).toContain("'public'");
    expect(clientSource).not.toContain('getPublicSetting');
    expect(clientSource).not.toContain('settingsManager');
  });

  test('shell install and first-install checks delegate setup payloads to data helpers', () => {
    const firstCheckSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'install', 'firstInstallCheck.ts'),
      'utf8'
    );
    const installSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'install', 'install.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'install', 'installData.ts'),
      'utf8'
    );

    expect(firstCheckSource).toContain("from './installData.js'");
    expect(firstCheckSource).toContain("from '../data/publicMeltdownClient.js'");
    expect(firstCheckSource).not.toContain('issuePublicToken');
    expect(firstCheckSource).not.toContain('getPublicSetting');
    expect(firstCheckSource).not.toContain('getUserCount');
    expect(firstCheckSource).not.toContain('moduleName');
    expect(firstCheckSource).not.toContain('moduleType');
    expect(installSource).toContain("from './installData.js'");
    expect(installSource).toContain("from '../data/publicMeltdownClient.js'");
    expect(installSource).toContain("from '../theme/userColor.js'");
    expect(installSource).toContain('applyThemeMode();');
    expect(installSource).not.toContain('/api/meltdown');
    expect(installSource).not.toContain("'/install'");
    expect(installSource).not.toContain('FIRST_INSTALL_DONE');
    expect(installSource).not.toContain('moduleName');
    expect(installSource).not.toContain('moduleType');
    expect(dataSource).toContain('export async function fetchFirstInstallState');
    expect(dataSource).toContain('export async function fetchPublicUserCount');
    expect(dataSource).toContain('export async function submitInstallRequest');
    expect(dataSource).toContain('FIRST_INSTALL_DONE');
    expect(dataSource).toContain('cmsPublicRuntimeRequest');
    expect(dataSource).toContain("'users'");
    expect(dataSource).toContain("'count'");
    expect(dataSource).not.toContain('getUserCount');
    expect(dataSource).not.toContain('userManagement');
    expect(dataSource).toContain("'/install'");
    expect(dataSource).toContain('SHELL_INSTALL_SUBMIT_FAILED');
  });

  test('shell dashboard page actions delegate event payloads to a data helper', () => {
    const actionsSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'dashboard', 'pageActions.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'dashboard', 'pageActionsData.ts'),
      'utf8'
    );

    expect(actionsSource).toContain("from './pageActionsData.js'");
    expect(actionsSource).not.toContain('createPage');
    expect(actionsSource).not.toContain('saveLayoutTemplate');
    expect(actionsSource).not.toContain('moduleName');
    expect(actionsSource).not.toContain('moduleType');
    expect(dataSource).toContain('export async function createPublicPage');
    expect(dataSource).toContain('export async function savePublicLayoutTemplate');
    expect(dataSource).toContain('SHELL_PAGE_ACTIONS_EMITTER_UNAVAILABLE');
    expect(dataSource).toContain("'pages', 'create'");
    expect(dataSource).toContain("'plainSpace', 'saveLayoutTemplate'");
    expect(dataSource).not.toContain('createPage');
    expect(dataSource).not.toContain('pagesManager');
    expect(dataSource).not.toContain("moduleName: 'plainspace'");
  });

  test('shell content header delegates admin page deletion data to a helper', () => {
    const headerSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'dashboard', 'contentHeaderActions.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'dashboard', 'contentHeaderActionsData.ts'),
      'utf8'
    );

    expect(headerSource).toContain("from './contentHeaderActionsData.js'");
    expect(headerSource).not.toContain('getPageBySlug');
    expect(headerSource).not.toContain('deletePage');
    expect(headerSource).not.toContain('moduleName');
    expect(headerSource).not.toContain('moduleType');
    expect(headerSource).not.toContain('function toAdminPage');
    expect(dataSource).toContain('export async function fetchAdminPageBySlug');
    expect(dataSource).toContain('export async function deleteAdminPage');
    expect(dataSource).toContain('export function isProtectedAdminWorkspace');
    expect(dataSource).toContain('SHELL_CONTENT_HEADER_EMITTER_UNAVAILABLE');
    expect(dataSource).toContain("'pages', 'getBySlug'");
    expect(dataSource).toContain("'pages', 'delete'");
    expect(dataSource).not.toContain('getPageBySlug');
    expect(dataSource).not.toContain('deletePage');
    expect(dataSource).not.toContain('pagesManager');
  });

  test('shell page picker delegates page event payloads to a data helper', () => {
    const pickerSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'dashboard', 'pagePicker.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'dashboard', 'pagePickerData.ts'),
      'utf8'
    );

    expect(pickerSource).toContain("from './pagePickerData.js'");
    expect(pickerSource).not.toContain('getPagesByLane');
    expect(pickerSource).not.toContain('updatePage');
    expect(pickerSource).not.toContain('getPageById');
    expect(pickerSource).not.toContain('moduleName');
    expect(pickerSource).not.toContain('moduleType');
    expect(dataSource).toContain('export async function fetchPublicPages');
    expect(dataSource).toContain('export async function savePageOrder');
    expect(dataSource).toContain('export async function createPublicPageForPicker');
    expect(dataSource).toContain('export async function fetchPageSlugById');
    expect(dataSource).toContain('SHELL_PAGE_PICKER_EMITTER_UNAVAILABLE');
    expect(dataSource).toContain("'pages', 'byLane'");
    expect(dataSource).toContain("'pages', 'update'");
    expect(dataSource).toContain("'pages', 'create'");
    expect(dataSource).toContain("'pages', 'get'");
    expect(dataSource).not.toContain('getPagesByLane');
    expect(dataSource).not.toContain('pagesManager');
  });

  test('shell top header delegates maintenance setting payloads to a data helper', () => {
    const headerSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'dashboard', 'topHeaderActions.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'dashboard', 'topHeaderActionsData.ts'),
      'utf8'
    );

    expect(headerSource).toContain("from './topHeaderActionsData.js'");
    expect(headerSource).not.toContain('getSetting');
    expect(headerSource).not.toContain('setSetting');
    expect(headerSource).not.toContain('moduleName');
    expect(headerSource).not.toContain('moduleType');
    expect(headerSource).not.toContain('function parseMaintenanceValue');
    expect(dataSource).toContain('export async function fetchMaintenanceMode');
    expect(dataSource).toContain('export async function disableMaintenanceMode');
    expect(dataSource).toContain('export function parseMaintenanceValue');
    expect(dataSource).toContain('SHELL_TOP_HEADER_EMITTER_UNAVAILABLE');
    expect(dataSource).toContain('runtimeAdminPayload');
    expect(dataSource).toContain("'settings', 'get'");
    expect(dataSource).toContain("'settings', 'set'");
    expect(dataSource).not.toContain('settingsManager');
  });

  test('shell workspaces delegate page event payloads to a data helper', () => {
    const workspacesSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'dashboard', 'workspaces.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'shell', 'dashboard', 'workspacesData.ts'),
      'utf8'
    );

    expect(workspacesSource).toContain("from './workspacesData.js'");
    expect(workspacesSource).not.toContain('getPagesByLane');
    expect(workspacesSource).not.toContain('getPageBySlug');
    expect(workspacesSource).not.toContain("'createPage'");
    expect(workspacesSource).not.toContain('moduleName');
    expect(workspacesSource).not.toContain('moduleType');
    expect(workspacesSource).not.toContain('function asArray');
    expect(dataSource).toContain('export async function fetchAdminPagesByLane');
    expect(dataSource).toContain('export async function fetchAdminPageBySlug');
    expect(dataSource).toContain('export async function createWorkspacePage');
    expect(dataSource).toContain('export async function createWorkspaceSubpage');
    expect(dataSource).toContain('SHELL_WORKSPACES_EMITTER_UNAVAILABLE');
    expect(dataSource).toContain("'pages', 'byLane'");
    expect(dataSource).toContain("'pages', 'getBySlug'");
    expect(dataSource).toContain("'pages', 'create'");
    expect(dataSource).not.toContain('getPagesByLane');
    expect(dataSource).not.toContain('pagesManager');
  });

  test('shared UI does not import feature zones', () => {
    const forbiddenZones = ['shell', 'runtime', 'designer', 'widgets'];
    const violations = [];

    sourceFiles('ui', 'shared').forEach(filePath => {
      const source = fs.readFileSync(filePath, 'utf8');
      importSpecifiers(source).forEach(specifier => {
        if (forbiddenZones.some(zone => specifierTargetsUiZone(filePath, specifier, zone))) {
          violations.push(`${toRepoPath(filePath)} -> ${specifier}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });

  test('canonical non-designer helper modules are TypeScript-authored', () => {
    const helperRoots = [
      path.join(rootDir, 'ui', 'runtime', 'envelope'),
      path.join(rootDir, 'ui', 'runtime', 'entries'),
      path.join(rootDir, 'ui', 'shared', 'agent'),
      path.join(rootDir, 'ui', 'shared', 'entries'),
      path.join(rootDir, 'ui', 'shared', 'controls'),
      path.join(rootDir, 'ui', 'shared', 'dev'),
      path.join(rootDir, 'ui', 'shared', 'dialogs'),
      path.join(rootDir, 'ui', 'shared', 'grid'),
      path.join(rootDir, 'ui', 'shared', 'icons'),
      path.join(rootDir, 'ui', 'shared', 'loaders'),
      path.join(rootDir, 'ui', 'shared', 'media'),
      path.join(rootDir, 'ui', 'shared', 'partials'),
      path.join(rootDir, 'ui', 'shared', 'sanitize'),
      path.join(rootDir, 'ui', 'shared', 'scripts'),
      path.join(rootDir, 'ui', 'shared', 'utils'),
      path.join(rootDir, 'ui', 'shell', 'entries'),
      path.join(rootDir, 'ui', 'widgets', 'entries'),
      path.join(rootDir, 'ui', 'widgets', 'options'),
      path.join(rootDir, 'ui', 'widgets', 'rendering')
    ];
    const exactJsFiles = [
      path.join(rootDir, 'ui', 'runtime', 'publicEntry.js'),
      path.join(rootDir, 'ui', 'runtime', 'publicLoaderImporter.js'),
      path.join(rootDir, 'ui', 'runtime', 'publicLoaderPaths.js'),
      path.join(rootDir, 'ui', 'runtime', 'grid-core', 'bbox', 'BoundingBoxManager.js'),
      path.join(rootDir, 'ui', 'runtime', 'grid-core', 'events.js'),
      path.join(rootDir, 'ui', 'runtime', 'grid-core', 'geometry.js'),
      path.join(rootDir, 'ui', 'runtime', 'grid-core', 'globalEvents.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'BoundingBoxManager.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'adminWidgetSurfaces.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'grid-utils.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'globalEvents.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'script-utils.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'sceneRuntime.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeAdminGrid.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeAdminGridInteractions.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeAdminGridMounting.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeCanvasItems.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeCanvasSerialization.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeContentFallbacks.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeDesignLayouts.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeGridMetrics.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeGridWidgetMounting.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeAttachedContent.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimePageComposition.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimePageContext.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimePageShell.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimePageData.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimePageDataHelpers.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeSceneEffects.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeShellPartials.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeStaticGrid.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetEvents.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetContext.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetInlineCode.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetModuleRenderer.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetShell.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetRenderer.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetTypes.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetInstances.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetMounting.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'widgetOptions.js'),
      path.join(rootDir, 'ui', 'runtime', 'main', 'widgetRuntimeGateway.js'),
      path.join(rootDir, 'ui', 'shell', 'apps', 'appFrameLoader.js'),
      path.join(rootDir, 'ui', 'shell', 'apps', 'appFrameLoaderData.js'),
      path.join(rootDir, 'ui', 'shell', 'auth', 'login.js'),
      path.join(rootDir, 'ui', 'shell', 'auth', 'loginStrategiesPublic.js'),
      path.join(rootDir, 'ui', 'shell', 'auth', 'loginStrategiesPublicData.js'),
      path.join(rootDir, 'ui', 'shell', 'auth', 'register.js'),
      path.join(rootDir, 'ui', 'shell', 'auth', 'registerData.js'),
      path.join(rootDir, 'ui', 'shell', 'dashboard', 'adminDashboard.js'),
      path.join(rootDir, 'ui', 'shell', 'dashboard', 'contentHeaderActions.js'),
      path.join(rootDir, 'ui', 'shell', 'dashboard', 'contentHeaderActionsData.js'),
      path.join(rootDir, 'ui', 'shell', 'dashboard', 'fetchPartial.js'),
      path.join(rootDir, 'ui', 'shell', 'dashboard', 'pageActions.js'),
      path.join(rootDir, 'ui', 'shell', 'dashboard', 'pageActionsData.js'),
      path.join(rootDir, 'ui', 'shell', 'dashboard', 'pagePickerData.js'),
      path.join(rootDir, 'ui', 'shell', 'dashboard', 'topHeaderActionsData.js'),
      path.join(rootDir, 'ui', 'shell', 'dashboard', 'workspacesData.js'),
      path.join(rootDir, 'ui', 'shell', 'install', 'firstInstallCheck.js'),
      path.join(rootDir, 'ui', 'shell', 'install', 'install.js'),
      path.join(rootDir, 'ui', 'shell', 'install', 'installData.js'),
      path.join(rootDir, 'ui', 'shell', 'media', 'openExplorer.js'),
      path.join(rootDir, 'ui', 'shell', 'media', 'openExplorerData.js'),
      path.join(rootDir, 'ui', 'shell', 'notifications', 'notificationHub.js'),
      path.join(rootDir, 'ui', 'shell', 'search', 'adminSearch.js'),
      path.join(rootDir, 'ui', 'shell', 'data', 'pageDataLoader.js'),
      path.join(rootDir, 'ui', 'shell', 'data', 'pageDataLoaderData.js'),
      path.join(rootDir, 'ui', 'shell', 'data', 'publicMeltdownClient.js'),
      path.join(rootDir, 'ui', 'shell', 'theme', 'userColor.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'accessSettingsWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'activityLogWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'designerLayoutsWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'dragInfoWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'fontsListWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'layoutTemplatesWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'loginStrategiesWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'loginStrategyEditWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'mediaExplorerWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'modulesListWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'permissionsWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'roadmapIntroWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'roadmapWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'systemInfoWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'systemSettingsWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'userEditWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'usersListWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'widgetListWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'defaultwidgets', 'contentSummaryWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'defaultwidgets', 'pageStats.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'defaultwidgets', 'pageList', 'pageList.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'defaultwidgets', 'pageList', 'pageService.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'pageEditorWidgets', 'pageContentWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'admin', 'pageEditorWidgets', 'pageEditorWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'panel', 'widgetControls.js'),
      path.join(rootDir, 'ui', 'widgets', 'panel', 'widgetsPanel.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'public', 'basicwidgets', 'htmlWidget.js'),
      path.join(rootDir, 'ui', 'widgets', 'plainspace', 'public', 'basicwidgets', 'textBoxWidget.js')
    ];
    const jsFiles = [
      ...helperRoots.flatMap(helperRoot => walk(helperRoot, filePath => /\.js$/.test(filePath))),
      ...exactJsFiles.filter(filePath => fs.existsSync(filePath))
    ];
    const violations = jsFiles
      .filter(filePath => {
        const tsPath = filePath.replace(/\.js$/, '.ts');
        const tsxPath = filePath.replace(/\.js$/, '.tsx');
        return !fs.existsSync(tsPath) && !fs.existsSync(tsxPath);
      })
      .map(toRepoPath);

    expect(violations).toEqual([]);
  });

  test('public browser asset trees do not contain TypeScript sources', () => {
    const files = [
      ...walk(
        path.join(rootDir, 'public', 'plainspace'),
        filePath => /\.tsx?$/.test(filePath)
      ),
      ...walk(
        path.join(rootDir, 'public', 'assets', 'js'),
        filePath => /\.tsx?$/.test(filePath)
      )
    ].map(toRepoPath);

    expect(files).toEqual([]);
  });

  test('browser tsconfig covers the UI TypeScript surface', () => {
    const tsconfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'tsconfig.browser.json'), 'utf8'));
    expect(tsconfig.include).toEqual(expect.arrayContaining([
      'ui/**/*.d.ts',
      'ui/**/*.ts',
      'ui/**/*.tsx',
      'mother/modules/**/publicLoader.ts'
    ]));
  });

  test('browser TypeScript suppressions are limited to named migration UI files', () => {
    const allowedSuppressions = new Set([
      'ui/designer/app/builderRenderer.ts',
      'ui/designer/app/index.ts',
      'ui/designer/app/main/pixelGrid.ts',
      'ui/designer/app/managers/gridManager.ts',
      'ui/designer/app/renderer/builderHeader.ts',
      'ui/designer/app/renderer/publishPanel.ts'
    ]);
    const suppressions = sourceFiles('ui')
      .filter(filePath => /\.tsx?$/.test(filePath))
      .filter(filePath => fs.readFileSync(filePath, 'utf8').includes('@ts-nocheck'))
      .map(toRepoPath)
      .sort();

    expect(suppressions).toEqual([...allowedSuppressions].sort());
  });

  test('module public loaders do not suppress TypeScript checks', () => {
    const suppressions = modulePublicLoaderTsFiles()
      .filter(filePath => fs.readFileSync(filePath, 'utf8').includes('@ts-nocheck'))
      .map(toRepoPath)
      .sort();

    expect(suppressions).toEqual([]);
  });

  test('browser static routes do not serve TypeScript source files', () => {
    const source = fs.readFileSync(path.join(rootDir, 'mother/server/http/staticAssets.js'), 'utf8');
    expect(source).toContain('blockBrowserSourceFiles');
    expect(source).toContain('(?:ts|tsx)');

    [
      '/admin/assets',
      '/ui',
      '/apps',
      '/widgets',
      '/plainspace',
      '/assets'
    ].forEach(route => {
      const escapedRoute = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(source).toMatch(
        new RegExp(
          `app\\.use\\(\\s*['"]${escapedRoute}['"]\\s*,\\s*(?:[A-Za-z0-9_$]+\\s*,\\s*)*blockBrowserSourceFiles\\s*,\\s*express\\.static`
        )
      );
    });
  });

  test('maintenance mode allows browser asset roots through unchanged', () => {
    const source = fs.readFileSync(path.join(rootDir, 'mother/server/http/maintenanceMiddleware.js'), 'utf8');
    const match = source.match(/const MAINTENANCE_ALLOWED_PREFIXES = \[([\s\S]*?)\];/);
    expect(match).not.toBeNull();
    const allowedBlock = match ? match[1] : '';

    [
      '/assets',
      '/api',
      '/build',
      '/ui',
      '/plainspace',
      '/themes',
      '/apps',
      '/widgets',
      '/fonts'
    ].forEach(route => {
      expect(allowedBlock).toContain(`'${route}'`);
    });
  });

  test('retired PlainSpace browser URLs are not runtime TypeScript routes', () => {
    const source = [
      fs.readFileSync(path.join(rootDir, 'mother/server/http/staticAssets.js'), 'utf8'),
      fs.readFileSync(path.join(rootDir, 'mother/server/http/adminShellRoutes.js'), 'utf8'),
      fs.readFileSync(path.join(rootDir, 'mother/server/http/publicPageRoutes.js'), 'utf8')
    ].join('\n');
    expect(source).not.toContain('plainspaceMainTs');
    expect(source).not.toContain('plainspaceDashboardTs');
    expect(source).not.toContain("'/plainspace/main/:moduleName.js'");
    expect(source).not.toContain("'/plainspace/dashboard/:moduleName.js'");
    expect(source).not.toContain('/assets/plainspace/main/pageRenderer.js');
    expect(source).toContain('src="\\/build\\/pageRenderer.js"');
  });

  test('public runtime boot side effect lives in the bundle entry', () => {
    const runtimeSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'publicEntry.ts'),
      'utf8'
    );
    const entrySource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'entries', 'publicEntry.ts'),
      'utf8'
    );

    expect(runtimeSource).toContain('export async function bootPublicRuntime');
    expect(runtimeSource).not.toContain('bootPublicRuntime().catch');
    expect(entrySource).toContain("import { bootPublicRuntime } from '../publicEntry.js'");
    expect(entrySource).toContain('bootPublicRuntime().catch');
    expect(fs.existsSync(path.join(rootDir, 'public', 'plainspace', 'main', 'publicEntry.js'))).toBe(false);
  });

  test('page renderer boot side effect lives in the bundle entry', () => {
    const runtimeSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'pageRenderer.ts'),
      'utf8'
    );
    const entrySource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'entries', 'pageRenderer.ts'),
      'utf8'
    );

    expect(runtimeSource).toContain('export async function bootPageRenderer');
    expect(runtimeSource).not.toMatch(/^\(async \(\) =>/m);
    expect(entrySource).toContain("import { bootPageRenderer } from '../main/pageRenderer.js'");
    expect(entrySource).toContain('bootPageRenderer().catch');
    expect(fs.existsSync(path.join(rootDir, 'public', 'plainspace', 'main', 'pageRenderer.js'))).toBe(false);
  });

  test('page renderer delegates browser page context to a runtime helper', () => {
    const rendererSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'pageRenderer.ts'),
      'utf8'
    );
    const contextSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimePageContext.ts'),
      'utf8'
    );

    expect(rendererSource).toContain("from './runtimePageContext.js'");
    expect(rendererSource).toContain('resolveRuntimePageContext()');
    expect(rendererSource).toContain('applyRuntimePageTitle(page, lane)');
    expect(rendererSource).toContain('exposeRuntimeWidgetRegistry(allWidgets)');
    expect(rendererSource).not.toContain('window.location');
    expect(rendererSource).not.toContain('window.PAGE_SLUG');
    expect(rendererSource).not.toContain('window.DEBUG_RENDERER');
    expect(rendererSource).not.toContain('document.title');
    expect(rendererSource).not.toContain('window.availableWidgets');
    expect(contextSource).toContain('export function resolveRuntimePageContext');
    expect(contextSource).toContain('export function applyRuntimePageTitle');
    expect(contextSource).toContain('export function exposeRuntimeWidgetRegistry');
  });

  test('page renderer delegates scene metadata and effects to a runtime helper', () => {
    const rendererSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'pageRenderer.ts'),
      'utf8'
    );
    const sceneSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'sceneRuntime.ts'),
      'utf8'
    );
    const sceneEffectsSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeSceneEffects.ts'),
      'utf8'
    );
    const canvasItemSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeCanvasItems.ts'),
      'utf8'
    );
    const designSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeDesignLayouts.ts'),
      'utf8'
    );
    const mountSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetMounting.ts'),
      'utf8'
    );

    expect(rendererSource).not.toContain("from './sceneRuntime.js'");
    expect(rendererSource).not.toContain('const sceneEffectItems = new Set');
    expect(rendererSource).not.toContain('function applySceneMetadata');
    expect(rendererSource).not.toContain('mergeSceneMetaIntoCode');
    expect(canvasItemSource).toContain("from './sceneRuntime.js'");
    expect(canvasItemSource).toContain("from './runtimeSceneEffects.js'");
    expect(designSource).toContain("from './sceneRuntime.js'");
    expect(mountSource).toContain("from './sceneRuntime.js'");
    expect(sceneSource).toContain('export function applySceneMetadata');
    expect(sceneSource).toContain('export function mergeSceneMetaIntoCode');
    expect(sceneSource).not.toContain('window.addEventListener');
    expect(sceneSource).not.toContain('requestAnimationFrame');
    expect(sceneSource).not.toContain('sceneEffectItems');
    expect(sceneEffectsSource).toContain('export function registerSceneEffects');
    expect(sceneEffectsSource).toContain('export function requestSceneEffectUpdate');
    expect(sceneEffectsSource).toContain('export function hasSceneMotion');
    expect(sceneEffectsSource).toContain("from './sceneRuntime.js'");
  });

  test('page renderer delegates grid metrics to a runtime helper', () => {
    const rendererSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'pageRenderer.ts'),
      'utf8'
    );
    const gridMetricsSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeGridMetrics.ts'),
      'utf8'
    );
    const adminGridSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeAdminGrid.ts'),
      'utf8'
    );
    const adminInteractionsSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeAdminGridInteractions.ts'),
      'utf8'
    );
    const adminMountingSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeAdminGridMounting.ts'),
      'utf8'
    );
    const compositionSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimePageComposition.ts'),
      'utf8'
    );
    const staticGridSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeStaticGrid.ts'),
      'utf8'
    );

    expect(rendererSource).not.toContain("from './runtimeGridMetrics.js'");
    expect(rendererSource).not.toContain('function deriveGridSize');
    expect(rendererSource).not.toContain('function measureGridMetrics');
    expect(rendererSource).not.toContain('function computeStaticGridMetrics');
    expect(adminGridSource).not.toContain("from './runtimeGridMetrics.js'");
    expect(adminGridSource).not.toContain('deriveGridSize(');
    expect(adminGridSource).not.toContain('measureGridMetrics(');
    expect(adminMountingSource).not.toContain("from './runtimeGridMetrics.js'");
    expect(adminMountingSource).not.toContain('deriveGridSize(');
    expect(adminInteractionsSource).toContain("from './runtimeGridMetrics.js'");
    expect(adminInteractionsSource).not.toContain('measureGridMetrics(');
    expect(compositionSource).not.toContain("from './runtimeGridMetrics.js'");
    expect(staticGridSource).toContain("from './runtimeGridMetrics.js'");
    expect(staticGridSource).toContain('deriveGridSize(');
    expect(staticGridSource).toContain('computeStaticGridMetrics(');
    expect(gridMetricsSource).toContain('export function deriveGridSize');
    expect(gridMetricsSource).toContain('export function measureGridMetrics');
    expect(gridMetricsSource).toContain('export function computeStaticGridMetrics');
  });

  test('page renderer delegates canvas item wrapper construction to a runtime helper', () => {
    const rendererSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'pageRenderer.ts'),
      'utf8'
    );
    const canvasItemSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeCanvasItems.ts'),
      'utf8'
    );
    const canvasSerializationSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeCanvasSerialization.ts'),
      'utf8'
    );
    const adminGridSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeAdminGrid.ts'),
      'utf8'
    );
    const adminMountingSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeAdminGridMounting.ts'),
      'utf8'
    );
    const adminInteractionsSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeAdminGridInteractions.ts'),
      'utf8'
    );
    const compositionSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimePageComposition.ts'),
      'utf8'
    );
    const staticGridSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeStaticGrid.ts'),
      'utf8'
    );
    const gridWidgetMountingSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeGridWidgetMounting.ts'),
      'utf8'
    );

    expect(rendererSource).not.toContain("from './runtimeCanvasItems.js'");
    expect(rendererSource).not.toContain('createRuntimeCanvasItem({');
    expect(rendererSource).not.toContain('mountRuntimeCanvasContent(wrapper, placeholder)');
    expect(rendererSource).not.toContain('resolveRuntimeCanvasRect(');
    expect(rendererSource).not.toContain('serializeRuntimeCanvasLayout(');
    expect(rendererSource).not.toContain("wrapper.classList.add('canvas-item', 'loading')");
    expect(rendererSource).not.toContain("ph.className = 'widget-placeholder'");
    expect(rendererSource).not.toContain("content.className = 'canvas-item-content'");
    expect(rendererSource).not.toContain('item.xPercent !== undefined');
    expect(rendererSource).not.toContain('meta.xPercent !== undefined');
    expect(rendererSource).not.toContain('const sceneMeta = getSceneMetadata(meta)');
    expect(rendererSource).not.toContain('readSceneValue(meta, sceneMeta');
    expect(adminGridSource).not.toContain("from './runtimeCanvasItems.js'");
    expect(adminGridSource).not.toContain('createRuntimeCanvasItem({');
    expect(adminGridSource).not.toContain('resolveRuntimeCanvasRect(');
    expect(adminGridSource).not.toContain('serializeRuntimeCanvasLayout(');
    expect(adminMountingSource).toContain("from './runtimeCanvasItems.js'");
    expect(adminMountingSource).toContain('createWidgetPlaceholder');
    expect(adminMountingSource).not.toContain('createRuntimeCanvasItem({');
    expect(adminMountingSource).not.toContain('resolveRuntimeCanvasRect(');
    expect(adminMountingSource).not.toContain('serializeRuntimeCanvasLayout(');
    expect(adminInteractionsSource).not.toContain("from './runtimeCanvasSerialization.js'");
    expect(adminInteractionsSource).not.toContain('serializeRuntimeCanvasLayout(');
    expect(adminInteractionsSource).toContain('serializeAdminDashboardLayout');
    expect(compositionSource).not.toContain("from './runtimeCanvasItems.js'");
    expect(compositionSource).not.toContain('createRuntimeCanvasItem({');
    expect(compositionSource).not.toContain('resolveRuntimeCanvasRect(');
    expect(staticGridSource).not.toContain("from './runtimeCanvasItems.js'");
    expect(staticGridSource).not.toContain('createRuntimeCanvasItem({');
    expect(staticGridSource).not.toContain('resolveRuntimeCanvasRect(');
    expect(staticGridSource).toContain("from './runtimeGridWidgetMounting.js'");
    expect(staticGridSource).toContain('mountRuntimeGridWidgets({');
    expect(gridWidgetMountingSource).toContain("from './runtimeCanvasItems.js'");
    expect(gridWidgetMountingSource).toContain('createRuntimeCanvasItem({');
    expect(gridWidgetMountingSource).toContain('resolveRuntimeCanvasRect(');
    expect(canvasItemSource).toContain('export function createRuntimeCanvasItem');
    expect(canvasItemSource).toContain('export function mountRuntimeCanvasContent');
    expect(canvasItemSource).toContain('export function resolveRuntimeCanvasRect');
    expect(canvasItemSource).not.toContain('export function serializeRuntimeCanvasLayout');
    expect(canvasItemSource).not.toContain('export function serializeRuntimeCanvasItem');
    expect(canvasSerializationSource).toContain("from './runtimeCanvasItems.js'");
    expect(canvasSerializationSource).toContain('export function serializeRuntimeCanvasItem');
    expect(canvasSerializationSource).toContain('export function serializeRuntimeCanvasLayout');
    expect(canvasItemSource).toContain('registerSceneEffects(wrapper)');
  });

  test('page renderer delegates design layout normalization to a runtime helper', () => {
    const rendererSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'pageRenderer.ts'),
      'utf8'
    );
    const designSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeDesignLayouts.ts'),
      'utf8'
    );
    const compositionSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimePageComposition.ts'),
      'utf8'
    );

    expect(rendererSource).toContain("from './runtimePageComposition.js'");
    expect(rendererSource).not.toContain("from './runtimeDesignLayouts.js'");
    expect(rendererSource).not.toContain('getRuntimeDesignLayout(res)');
    expect(rendererSource).not.toContain('applyRuntimeDesignStyles(');
    expect(rendererSource).not.toContain('function normalizeDesignerWidget');
    expect(rendererSource).not.toContain('res.widgets.map(normalizeDesignerWidget)');
    expect(rendererSource).not.toContain('res.design.bg_media_url');
    expect(rendererSource).not.toContain('parseMetadata(widget.metadata)');
    expect(compositionSource).toContain("from './runtimeDesignLayouts.js'");
    expect(compositionSource).toContain('getRuntimeDesignLayout(res)');
    expect(compositionSource).toContain('applyRuntimeDesignStyles(');
    expect(designSource).toContain('export function normalizeRuntimeDesignWidget');
    expect(designSource).toContain('export function getRuntimeDesignLayout');
    expect(designSource).toContain('export function applyRuntimeDesignStyles');
  });

  test('page renderer delegates DOM shell helpers to a runtime helper', () => {
    const rendererSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'pageRenderer.ts'),
      'utf8'
    );
    const pageShellSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimePageShell.ts'),
      'utf8'
    );
    const shellPartialsSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeShellPartials.ts'),
      'utf8'
    );

    expect(rendererSource).toContain("from './runtimePageShell.js'");
    expect(rendererSource).toContain("from './runtimeShellPartials.js'");
    expect(rendererSource).not.toContain('function ensureLayout');
    expect(rendererSource).not.toContain('function clearContentKeepHeader');
    expect(rendererSource).not.toContain('function fetchPartialSafe');
    expect(rendererSource).not.toContain('fetchPartialSafe(');
    expect(rendererSource).not.toContain('sanitizeHtml(');
    expect(rendererSource).not.toContain('top-header-loaded');
    expect(rendererSource).not.toContain('sidebarPartial');
    expect(rendererSource).toContain('hydrateRuntimeShellPartials(config)');
    expect(pageShellSource).toContain('export function ensureLayout');
    expect(pageShellSource).toContain('export function clearContentKeepHeader');
    expect(pageShellSource).not.toContain('export async function fetchPartialSafe');
    expect(pageShellSource).not.toContain('export async function hydrateRuntimeShellPartials');
    expect(pageShellSource).not.toContain('../../shared/partials/fetchPartial.js');
    expect(pageShellSource).not.toContain('sanitizeHtml(');
    expect(shellPartialsSource).toContain('export async function fetchPartialSafe');
    expect(shellPartialsSource).toContain('export async function hydrateRuntimeShellPartials');
    expect(shellPartialsSource).toContain('../../shared/partials/fetchPartial.js');
    expect(shellPartialsSource).toContain('sanitizeHtml(');
  });

  test('page renderer delegates runtime data event payloads to a helper', () => {
    const rendererSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'pageRenderer.ts'),
      'utf8'
    );
    const dataSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimePageData.ts'),
      'utf8'
    );
    const dataHelpersSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimePageDataHelpers.ts'),
      'utf8'
    );

    expect(rendererSource).toContain("from './runtimePageData.js'");
    expect(rendererSource).not.toContain("meltdownEmit('");
    expect(rendererSource).not.toContain('widget.registry.request.v1');
    expect(rendererSource).not.toContain('moduleName: \'plainspace\'');
    expect(rendererSource).not.toContain('moduleName: \'pagesManager\'');
    expect(rendererSource).not.toContain('moduleName: \'designer\'');
    expect(rendererSource).not.toContain('window.ADMIN_TOKEN');
    expect(rendererSource).not.toContain('window.PUBLIC_TOKEN');
    expect(dataSource).toContain("from './runtimePageDataHelpers.js'");
    expect(dataSource).toContain('export async function fetchRuntimePageBySlug');
    expect(dataSource).toContain('export async function fetchRuntimeWidgetRegistry');
    expect(dataSource).toContain('export async function loadRuntimeLayoutForViewport');
    expect(dataSource).toContain('export async function saveRuntimeLayoutForViewport');
    expect(dataSource).not.toContain('export function laneAuthPayload');
    expect(dataSource).not.toContain('export function normalizeLayoutResponse');
    expect(dataSource).not.toContain('export function resolveRuntimeWidgetLane');
    expect(dataHelpersSource).toContain('export function laneAuthPayload');
    expect(dataHelpersSource).toContain('export function adminLaneAuthPayload');
    expect(dataHelpersSource).toContain('export function normalizeLayoutResponse');
    expect(dataHelpersSource).toContain('export function normalizeDataList');
    expect(dataHelpersSource).toContain('export function unwrapData');
    expect(dataHelpersSource).toContain('export function resolveRuntimeWidgetLane');
  });

  test('page renderer delegates admin grid setup to a runtime helper', () => {
    const rendererSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'pageRenderer.ts'),
      'utf8'
    );
    const adminGridSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeAdminGrid.ts'),
      'utf8'
    );
    const adminInteractionsSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeAdminGridInteractions.ts'),
      'utf8'
    );
    const adminMountingSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeAdminGridMounting.ts'),
      'utf8'
    );

    expect(rendererSource).toContain("from './runtimeAdminGrid.js'");
    expect(rendererSource).toContain('renderAdminRuntimeGrid({');
    expect(rendererSource).not.toContain("gridEl.id = 'adminGrid'");
    expect(rendererSource).not.toContain('window.adminGrid');
    expect(rendererSource).not.toContain('window.saveAdminLayout');
    expect(rendererSource).not.toContain('dashboard-edit-mode');
    expect(rendererSource).not.toContain('DEFAULT_ADMIN_ROWS');
    expect(adminGridSource).toContain('export async function renderAdminRuntimeGrid');
    expect(adminGridSource).toContain("from './runtimeAdminGridInteractions.js'");
    expect(adminGridSource).toContain("from './runtimeAdminGridMounting.js'");
    expect(adminGridSource).toContain("gridEl.id = 'adminGrid'");
    expect(adminGridSource).toContain('mountAdminGridWidgets({');
    expect(adminGridSource).not.toContain('renderRuntimeCanvasWidget({');
    expect(adminGridSource).not.toContain('window.adminGrid');
    expect(adminGridSource).not.toContain('window.saveAdminLayout');
    expect(adminGridSource).not.toContain('dashboard-edit-mode');
    expect(adminGridSource).toContain('bindAdminLayoutPersistence({');
    expect(adminMountingSource).toContain('export async function mountAdminGridWidgets');
    expect(adminMountingSource).toContain('createWidgetPlaceholder');
    expect(adminMountingSource).not.toContain('createRuntimeCanvasItem({');
    expect(adminMountingSource).toContain('renderRuntimeCanvasWidget({');
    expect(adminInteractionsSource).toContain('window.adminGrid');
    expect(adminInteractionsSource).toContain('window.saveAdminLayout');
    expect(adminInteractionsSource).toContain('dashboard-edit-mode');
    expect(adminInteractionsSource).toContain('dashboard-drop-placeholder');
    expect(adminInteractionsSource).toContain('dashboard-drag-preview');
    expect(adminInteractionsSource).toContain('is-dashboard-snap-active');
    expect(adminInteractionsSource).toContain('beforeInstanceId');
  });

  test('page renderer delegates public page composition to a runtime helper', () => {
    const rendererSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'pageRenderer.ts'),
      'utf8'
    );
    const compositionSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimePageComposition.ts'),
      'utf8'
    );
    const attachedContentSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeAttachedContent.ts'),
      'utf8'
    );
    const contentFallbacksSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeContentFallbacks.ts'),
      'utf8'
    );
    const staticGridSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeStaticGrid.ts'),
      'utf8'
    );
    const gridWidgetMountingSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeGridWidgetMounting.ts'),
      'utf8'
    );

    expect(rendererSource).toContain("from './runtimePageComposition.js'");
    expect(rendererSource).toContain('renderPublicRuntimePageContent({');
    expect(rendererSource).not.toContain('async function renderStaticGrid');
    expect(rendererSource).not.toContain('async function renderAttachedContent');
    expect(rendererSource).not.toContain("gridEl.id = 'publicGrid'");
    expect(rendererSource).not.toContain('No widgets configured.');
    expect(compositionSource).toContain("from './runtimeStaticGrid.js'");
    expect(compositionSource).toContain("from './runtimeAttachedContent.js'");
    expect(compositionSource).toContain("from './runtimeContentFallbacks.js'");
    expect(compositionSource).not.toContain('export async function renderStaticRuntimeGrid');
    expect(compositionSource).not.toContain('renderRuntimeCanvasWidget({');
    expect(compositionSource).not.toContain('export async function renderAttachedRuntimeContent');
    expect(compositionSource).toContain('export async function renderPublicRuntimePageContent');
    expect(attachedContentSource).toContain('export async function renderAttachedRuntimeContent');
    expect(attachedContentSource).toContain("from './runtimeContentFallbacks.js'");
    expect(attachedContentSource).toContain('fetchRuntimeChildPages');
    expect(attachedContentSource).toContain('renderStaticRuntimeGrid(');
    expect(attachedContentSource).toContain('appendRuntimeHtmlContent(');
    expect(staticGridSource).toContain('export async function renderStaticRuntimeGrid');
    expect(staticGridSource).toContain('export async function renderPublicRuntimeGrid');
    expect(staticGridSource).not.toContain('export function appendRuntimeHtmlContent');
    expect(staticGridSource).not.toContain('export function appendRuntimeEmptyState');
    expect(contentFallbacksSource).toContain('export function appendRuntimeHtmlContent');
    expect(contentFallbacksSource).toContain('export function appendRuntimeEmptyState');
    expect(contentFallbacksSource).toContain("from '../../shared/sanitize/sanitizer.js'");
  });

  test('page renderer delegates widget shadow rendering to a runtime helper', () => {
    const rendererSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'pageRenderer.ts'),
      'utf8'
    );
    const mountSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetMounting.ts'),
      'utf8'
    );
    const adminGridSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeAdminGrid.ts'),
      'utf8'
    );
    const adminMountingSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeAdminGridMounting.ts'),
      'utf8'
    );
    const compositionSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimePageComposition.ts'),
      'utf8'
    );
    const staticGridSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeStaticGrid.ts'),
      'utf8'
    );
    const gridWidgetMountingSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeGridWidgetMounting.ts'),
      'utf8'
    );
    const widgetRendererSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetRenderer.ts'),
      'utf8'
    );
    const widgetContextSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetContext.ts'),
      'utf8'
    );
    const widgetInlineCodeSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetInlineCode.ts'),
      'utf8'
    );
    const widgetModuleRendererSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetModuleRenderer.ts'),
      'utf8'
    );
    const widgetShellSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetShell.ts'),
      'utf8'
    );
    const widgetEventsSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetEvents.ts'),
      'utf8'
    );

    expect(rendererSource).toContain("from './runtimeWidgetRenderer.js'");
    expect(rendererSource).toContain("from './runtimeWidgetEvents.js'");
    expect(rendererSource).not.toContain("from './runtimeWidgetMounting.js'");
    expect(rendererSource).not.toContain('renderRuntimeCanvasWidget({');
    expect(rendererSource).not.toContain('renderWidget(content');
    expect(rendererSource).not.toContain('function renderWidget');
    expect(rendererSource).not.toContain('function registerWidgetEvents');
    expect(rendererSource).not.toContain('function createDebouncedEmitter');
    expect(rendererSource).not.toContain('loadWidgetModule');
    expect(rendererSource).not.toContain('executeJs');
    expect(adminGridSource).not.toContain("from './runtimeWidgetMounting.js'");
    expect(adminMountingSource).toContain("from './runtimeWidgetMounting.js'");
    expect(compositionSource).not.toContain("from './runtimeWidgetMounting.js'");
    expect(staticGridSource).not.toContain("from './runtimeWidgetMounting.js'");
    expect(gridWidgetMountingSource).toContain("from './runtimeWidgetMounting.js'");
    expect(adminGridSource).not.toContain('renderRuntimeCanvasWidget({');
    expect(adminMountingSource).toContain('renderRuntimeCanvasWidget({');
    expect(staticGridSource).not.toContain('renderRuntimeCanvasWidget({');
    expect(gridWidgetMountingSource).toContain('renderRuntimeCanvasWidget({');
    expect(mountSource).toContain("from './runtimeWidgetRenderer.js'");
    expect(mountSource).toContain("from './runtimeWidgetHydration.js'");
    expect(mountSource).toContain('await renderWidget(content');
    expect(mountSource).toContain("markRuntimeWidgetHydrationState(wrapper, 'ready'");
    expect(mountSource).not.toContain('wrapper.classList.remove');
    expect(widgetRendererSource).toContain('export async function renderWidget');
    expect(widgetRendererSource).toContain("from './runtimeWidgetEvents.js'");
    expect(widgetRendererSource).toContain("from './runtimeWidgetInlineCode.js'");
    expect(widgetRendererSource).toContain("from './runtimeWidgetModuleRenderer.js'");
    expect(widgetRendererSource).toContain("from './runtimeWidgetShell.js'");
    expect(widgetRendererSource).not.toContain('function createWidgetContext');
    expect(widgetRendererSource).not.toContain('function renderInlineWidgetCode');
    expect(widgetRendererSource).not.toContain('function createWidgetContainer');
    expect(widgetRendererSource).not.toContain('function stopFormControlDrag');
    expect(widgetRendererSource).not.toContain('function attachResizeHandleSlot');
    expect(widgetRendererSource).not.toContain('CSSStyleSheet');
    expect(widgetRendererSource).not.toContain('getGlobalCssUrl');
    expect(widgetRendererSource).not.toContain('normalizeEffects(');
    expect(widgetRendererSource).not.toContain('executeJs');
    expect(widgetRendererSource).not.toContain('sanitizeHtml(');
    expect(widgetRendererSource).not.toContain('loadWidgetModule');
    expect(widgetRendererSource).not.toContain('createRuntimeWidgetContext(');
    expect(widgetRendererSource).not.toContain('blocked widget import path');
    expect(widgetRendererSource).not.toContain('import error:');
    expect(widgetRendererSource).not.toContain('export function createDebouncedEmitter');
    expect(widgetRendererSource).not.toContain('meltdownEmitBatch');
    expect(widgetRendererSource).not.toContain('registerWidgetUsage');
    expect(widgetContextSource).toContain('export function createRuntimeWidgetContext');
    expect(widgetContextSource).toContain("from './sceneRuntime.js'");
    expect(widgetContextSource).toContain('normalizeEffects(');
    expect(widgetContextSource).toContain('window.ADMIN_TOKEN');
    expect(widgetInlineCodeSource).toContain('export function renderInlineWidgetCode');
    expect(widgetInlineCodeSource).toContain("from '../../shared/sanitize/sanitizer.js'");
    expect(widgetInlineCodeSource).toContain("from '../../shared/scripts/executeJs.js'");
    expect(widgetInlineCodeSource).toContain('executeJs(');
    expect(widgetInlineCodeSource).toContain('sanitizeHtml(');
    expect(widgetModuleRendererSource).toContain('export async function renderRuntimeWidgetModule');
    expect(widgetModuleRendererSource).toContain("from './widgetRuntimeGateway.js'");
    expect(widgetModuleRendererSource).toContain("from './runtimeWidgetContext.js'");
    expect(widgetModuleRendererSource).toContain("from './runtimeWidgetTypes.js'");
    expect(widgetModuleRendererSource).toContain('loadWidgetModule');
    expect(widgetModuleRendererSource).toContain('createRuntimeWidgetContext(');
    expect(widgetModuleRendererSource).toContain('blocked widget import path');
    expect(widgetModuleRendererSource).toContain('import error:');
    expect(widgetShellSource).toContain('export function createRuntimeWidgetShell');
    expect(widgetShellSource).toContain("from './runtimePageShell.js'");
    expect(widgetShellSource).toContain('function createWidgetContainer');
    expect(widgetShellSource).toContain('function stopFormControlDrag');
    expect(widgetShellSource).toContain('function attachResizeHandleSlot');
    expect(widgetShellSource).toContain('CSSStyleSheet');
    expect(widgetShellSource).toContain('resize-handle');
    expect(widgetEventsSource).toContain('export function createDebouncedEmitter');
    expect(widgetEventsSource).toContain('export async function registerRuntimeWidgetEvents');
    expect(widgetEventsSource).toContain('window.meltdownEmitBatch');
    expect(widgetEventsSource).toContain('registerWidgetUsage');
  });

  test('page renderer delegates widget instance option loading to a runtime helper', () => {
    const rendererSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'pageRenderer.ts'),
      'utf8'
    );
    const instanceSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetInstances.ts'),
      'utf8'
    );
    const mountSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'main', 'runtimeWidgetMounting.ts'),
      'utf8'
    );

    expect(rendererSource).not.toContain("from './runtimeWidgetMounting.js'");
    expect(rendererSource).not.toContain("from './runtimeWidgetInstances.js'");
    expect(rendererSource).not.toContain("emitDebounced('getWidgetInstance'");
    expect(rendererSource).not.toContain('JSON.parse(res.content)');
    expect(rendererSource).not.toContain('applyWidgetOptions(wrapper');
    expect(mountSource).toContain("from './runtimeWidgetInstances.js'");
    expect(mountSource).toContain('await applyDefaultWidgetInstanceOptions');
    expect(instanceSource).toContain('export async function applyDefaultWidgetInstanceOptions');
    expect(instanceSource).toContain("emit('getWidgetInstance'");
    expect(instanceSource).toContain("lane === 'admin'");
    expect(instanceSource).toContain("from './widgetRuntimeGateway.js'");
    expect(instanceSource).not.toContain('DASHBOARD_LAYOUT_OPTION_KEYS');
    expect(instanceSource).not.toContain('stripDashboardLayoutOptions');
  });

  test('public runtime imports module public loaders through a gateway', () => {
    const runtimeSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'publicEntry.ts'),
      'utf8'
    );
    const importerSource = fs.readFileSync(
      path.join(rootDir, 'ui', 'runtime', 'publicLoaderImporter.ts'),
      'utf8'
    );

    expect(runtimeSource).toContain("import { loadPublicRuntimeLoaders } from './publicLoaderImporter.js'");
    expect(runtimeSource).toContain('await loadPublicRuntimeLoaders(envelope)');
    expect(runtimeSource).not.toContain('import(/* webpackIgnore: true */ path)');
    expect(runtimeSource).not.toContain('getPublicLoaderPaths');
    expect(importerSource).toContain("from './publicLoaderPaths.js'");
    expect(importerSource).toContain('export async function tryImportPublicLoader');
    expect(importerSource).toContain('import(/* webpackIgnore: true */ path)');
    expect(importerSource).toContain('mod.registerLoaders(LR.register)');
  });

  test('runtime main grid helpers forward to shared grid primitives', () => {
    const helpers = [
      'BoundingBoxManager',
      'canvasGrid',
      'globalEvents',
      'grid-utils'
    ];
    const violations = helpers
      .map(name => {
        const source = fs.readFileSync(
          path.join(rootDir, 'ui', 'runtime', 'main', `${name}.ts`),
          'utf8'
        ).trim();
        return { name, source };
      })
      .filter(({ source }) => (
        !source.includes('../../shared/grid/') ||
        /\b(?:import|class|function|const|let|var|interface)\b/.test(source)
      ))
      .map(({ name }) => `ui/runtime/main/${name}.ts`);

    expect(violations).toEqual([]);
  });

  test('runtime grid-core helpers forward to shared grid primitives', () => {
    const helpers = [
      path.join('ui', 'runtime', 'grid-core', 'bbox', 'BoundingBoxManager.ts'),
      path.join('ui', 'runtime', 'grid-core', 'events.ts'),
      path.join('ui', 'runtime', 'grid-core', 'geometry.ts'),
      path.join('ui', 'runtime', 'grid-core', 'globalEvents.ts')
    ];
    const violations = helpers
      .map(filePath => {
        const fullPath = path.join(rootDir, filePath);
        return {
          filePath,
          source: fs.readFileSync(fullPath, 'utf8').trim()
        };
      })
      .filter(({ source }) => (
        !source.includes('/ui/shared/grid/') ||
        /\b(?:import|class|function|const|let|var|interface)\b/.test(source)
      ))
      .map(({ filePath }) => filePath.replace(/\\/g, '/'));

    expect(violations).toEqual([]);
  });

  test('webpack aliases only expose canonical UI source roots', () => {
    const source = fs.readFileSync(path.join(rootDir, 'webpack.config.js'), 'utf8');
    expect(source).toContain("'@ui': path.resolve(__dirname, 'ui')");
    expect(source).toContain("'/ui': path.resolve(__dirname, 'ui')");
    expect(source).not.toMatch(/['"]\/plainspace['"]\s*:/);
    expect(source).not.toMatch(/['"]\/assets['"]\s*:/);
    expect(source).not.toMatch(/['"]assets['"]\s*:/);
  });

  test('jest module aliases do not resolve retired browser implementation paths', () => {
    const source = fs.readFileSync(path.join(rootDir, 'jest.config.js'), 'utf8');
    expect(source).toContain("'^/ui/(.*)$': '<rootDir>/ui/$1'");
    expect(source).toContain('controls|dev|dialogs|grid|icons|layout|loaders|media|module-access|sanitize|utils');
    expect(source).not.toMatch(/\^\/plainspace\//);
    expect(source).not.toMatch(/\^\/assets\//);
  });

  test('html shells load build bundles instead of retired browser scripts', () => {
    const files = [
      ...htmlFiles('public'),
      ...htmlFiles('apps', 'designer')
    ];
    const violations = [];
    const scriptSrcPattern = /<script\b[^>]*\bsrc=["']([^"']+)["']/gi;

    files.forEach(filePath => {
      const source = fs.readFileSync(filePath, 'utf8');
      let match;
      while ((match = scriptSrcPattern.exec(source)) !== null) {
        const scriptSrc = match[1];
        if (/^\/(?:assets\/js|plainspace|apps\/designer)(?:\/|$)/.test(scriptSrc)) {
          violations.push(`${toRepoPath(filePath)} -> ${scriptSrc}`);
        }
      }
    });

    expect(violations).toEqual([]);
  });

  test('designer bundle entry lazy-loads the designer app chunk', () => {
    const entrySource = fs.readFileSync(
      path.join(rootDir, 'ui', 'designer', 'entries', 'designer.ts'),
      'utf8'
    );
    const webpackSource = fs.readFileSync(path.join(rootDir, 'webpack.config.js'), 'utf8');

    expect(entrySource).toContain('webpackChunkName: "designer-app"');
    expect(entrySource).toContain('import(');
    expect(entrySource).toContain("'../app/designer.js'");
    expect(entrySource).toContain('DESIGNER_BOOT_CHUNK_LOAD_FAILED');
    expect(webpackSource).toContain("chunks: 'async'");
    expect(webpackSource).toContain('maxSize: 180 * 1024');
  });

  test('server-rendered UI shells load build bundles instead of retired browser scripts', () => {
    const source = [
      fs.readFileSync(path.join(rootDir, 'mother/server/http/adminShellRoutes.js'), 'utf8'),
      fs.readFileSync(path.join(rootDir, 'mother/server/http/publicPageRoutes.js'), 'utf8')
    ].join('\n');
    const violations = [];
    const scriptSrcPattern = /<script\b[^>]*\bsrc=["']([^"']+)["']/gi;
    let match;

    while ((match = scriptSrcPattern.exec(source)) !== null) {
      const scriptSrc = match[1];
      if (/^\/(?:assets\/js|plainspace|ui)(?:\/|$)/.test(scriptSrc)) {
        violations.push(scriptSrc);
      }
    }

    expect(violations).toEqual([]);
  });

  test('docs do not point new UI work at retired implementation paths', () => {
    const retiredImplementationPatterns = [
      /public\/assets\/js\//,
      /public\/plainspace\/(?:widgets|grid-core|main|dashboard)/,
      /\/assets\/js\/envelope\/(?:orchestrator|loaderRegistry)\.js/,
      /\/assets\/js\/pageRenderer\.js/,
      /\/plainspace\/main\/canvasGrid\.js/,
      /\/apps\/designer\/main\/pixelGrid\.js/,
      /apps\/designer\/(?:renderer|managers|builderRenderer)/
    ];
    const violations = [];

    docsFiles().forEach(filePath => {
      const source = fs.readFileSync(filePath, 'utf8');
      retiredImplementationPatterns.forEach(pattern => {
        if (pattern.test(source)) {
          violations.push(`${toRepoPath(filePath)} -> ${pattern}`);
        }
      });
    });

    expect(violations).toEqual([]);
  });
});
