'use strict';

// Asset ownership is host policy. Release metadata cannot publish another
// module's browser code or change the application's permission manifest.
const BROWSER_PREFIX = '__browser__/';
const { WIDGET_POLICY } = require('./coreWidgetPackages');
function ownsBrowserFile(moduleName, filename) {
  const widget = WIDGET_POLICY[moduleName];
  if (widget) return filename === widget.entry || filename === widget.entry.replace(/\.js$/, '.ts');
  if (moduleName !== 'designerManager') return false;
  return filename.startsWith('ui/designer/') ||
    (filename.startsWith('apps/designer/') && filename !== 'apps/designer/app.json') ||
    /^public\/build\/designer(?:Editor|-app-[a-f0-9]+)?\.js(?:\.map)?$/.test(filename);
}

function browserRecords(moduleName, files) {
  return files.filter(file => ownsBrowserFile(moduleName, file.path))
    .map(file => ({ ...file, path: BROWSER_PREFIX + file.path }));
}

module.exports = { BROWSER_PREFIX, ownsBrowserFile, browserRecords };
