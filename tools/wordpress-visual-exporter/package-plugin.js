'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const PLUGIN_SLUG = 'blogposter-visual-exporter';
const SOURCE_FILES = [
  'blogposter-visual-exporter.php',
  'README.md'
];

function assertReadableFile(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`[wordpress-visual-exporter] Expected file: ${filePath}`);
  }
}

function assertPluginHeader(pluginSource) {
  if (!/Plugin Name:\s*Blogposter Visual Exporter/i.test(pluginSource)) {
    throw new Error('[wordpress-visual-exporter] Missing WordPress plugin header.');
  }
}

function buildPluginPackage(options = {}) {
  const sourceDir = path.resolve(options.sourceDir || __dirname);
  const outputPath = path.resolve(options.outputPath || path.join(sourceDir, 'dist', `${PLUGIN_SLUG}.zip`));
  const zip = new AdmZip();

  for (const fileName of SOURCE_FILES) {
    const filePath = path.join(sourceDir, fileName);
    assertReadableFile(filePath);
    if (fileName.endsWith('.php')) {
      assertPluginHeader(fs.readFileSync(filePath, 'utf8'));
    }
    zip.addLocalFile(filePath, PLUGIN_SLUG);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  zip.writeZip(outputPath);
  return {
    outputPath,
    entries: zip.getEntries().map(entry => entry.entryName)
  };
}

if (require.main === module) {
  const outputArgIndex = process.argv.indexOf('--output');
  const outputPath = outputArgIndex >= 0 ? process.argv[outputArgIndex + 1] : '';
  const result = buildPluginPackage(outputPath ? { outputPath } : {});
  console.log(`[wordpress-visual-exporter] Wrote ${result.outputPath}`);
}

module.exports = {
  PLUGIN_SLUG,
  SOURCE_FILES,
  buildPluginPackage
};
