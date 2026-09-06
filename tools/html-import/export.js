'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { captureHtmlPage } = require('./capture');

/** Explicit local CLI only: renders the selected source in an isolated browser session, never in the CMS backend. */
function exportHtmlCapture({ url, output, widths = [390, 768, 1440] }) {
  const source = new URL(url);
  if (!['http:', 'https:', 'file:'].includes(source.protocol)) throw new Error('HTML_IMPORT_SOURCE_INVALID: Use an HTTP(S) URL or file URL.');
  if (!output) throw new Error('HTML_IMPORT_OUTPUT_REQUIRED: Choose a local output JSON file.');
  const npxPath = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npx-cli.js');
  if (!fs.existsSync(npxPath)) throw new Error('HTML_IMPORT_BROWSER_CLI_MISSING: Install Node.js with npm to run agent-browser.');
  const session = `html-capture-${process.pid}`;
  function browser(args, input) {
    const result = spawnSync(process.execPath, [npxPath, '--yes', 'agent-browser', '--session', session, ...args], {
      encoding: 'utf8', input, windowsHide: true, maxBuffer: 24 * 1024 * 1024, timeout: 60000
    });
    if (result.status !== 0) throw new Error(`HTML_IMPORT_CAPTURE_FAILED: ${result.error?.message || result.stderr || result.stdout}`);
    return result.stdout;
  }
  const snapshots = [];
  try {
    browser(['open', source.href]);
    for (const width of widths) {
      if (!Number.isInteger(width) || width < 320 || width > 3840) throw new Error('HTML_IMPORT_VIEWPORT_INVALID');
      browser(['set', 'viewport', String(width), '1000']);
      snapshots.push(JSON.parse(browser(['eval', '--stdin'], `(${captureHtmlPage.toString()})()`)));
    }
    fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
    fs.writeFileSync(output, JSON.stringify({ format: 'blogposter-html-capture', version: 1, snapshots }), 'utf8');
    return { output: path.resolve(output), widths, elements: snapshots.map(s => s.elements.length) };
  } finally { browser(['close']); }
}

if (require.main === module) {
  try {
    const [url, output] = process.argv.slice(2);
    console.log(JSON.stringify(exportHtmlCapture({ url, output }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { exportHtmlCapture };
