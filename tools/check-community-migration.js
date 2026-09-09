'use strict';

const fs = require('fs');
const path = require('path');

/** Read-only inventory. Never rewrite manifests, grant permissions or execute package code. */
function migrationReport(root = path.resolve(__dirname, '..')) {
  const extensions = [];
  for (const kind of ['modules', 'widgets']) {
    const directory = path.join(root, kind);
    if (!fs.existsSync(directory)) continue;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const issues = [];
      try {
        const info = JSON.parse(fs.readFileSync(path.join(directory, entry.name, kind === 'modules' ? 'moduleInfo.json' : 'widgetInfo.json'), 'utf8'));
        if (kind === 'widgets' && info.uiContractVersion !== 2) issues.push('WIDGET_SANDBOX_MIGRATION_REQUIRED');
        if (kind === 'widgets' && info.uiContractVersion === 2) require('../mother/modules/widgetManager/widgetSandboxSource').validateWidgetSandboxSource(fs.readFileSync(path.join(directory, entry.name, 'widget.js'), 'utf8'));
        if (kind === 'modules' && info.staticFrontend === true) issues.push('E_MODULE_UI_DENIED');
        if (kind === 'modules') {
          const apiPath = path.join(directory, entry.name, 'apiDefinition.json');
          if (fs.existsSync(apiPath) && JSON.parse(fs.readFileSync(apiPath, 'utf8')).services?.length) issues.push('E_MODULE_SERVICE_ENV_REMOVED');
        }
      } catch { issues.push('EXTENSION_MIGRATION_INSPECTION_FAILED'); }
      extensions.push({ kind, id: entry.name, issues, status: issues.length ? 'adaptation-required' : 'runtime-check-required' });
    }
  }
  return { policy: 'isolated-community-v2', writesPerformed: false, extensions,
    next: 'Back up all persistent volumes; verify the Linux sandbox; review module grants in Modules; replace incompatible widgets through the reviewed installer.' };
}

if (require.main === module) console.log(JSON.stringify(migrationReport(), null, 2));
module.exports = { migrationReport };
