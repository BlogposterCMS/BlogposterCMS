'use strict';

const fs = require('fs');
const path = require('path');
const { widgetSandboxSource, assertWidgetSandboxContract, validateWidgetSandboxSource } = require('../../modules/widgetManager/widgetSandboxSource');

/** All community code is data for the isolated UI worker, never executable same-origin script. */
function widgetSandboxAssets(root) {
  return (req, res) => {
    try {
      const match = /^\/([A-Za-z0-9_-]{1,80})\/widget\.js$/.exec(req.path);
      if (!match) return res.status(403).json({ code: 'WIDGET_SANDBOX_ASSET_DENIED' });
      const directory = fs.realpathSync(path.join(root, match[1]));
      const realRoot = fs.realpathSync(root);
      if (path.dirname(directory) !== realRoot) throw new Error('WIDGET_SANDBOX_PATH_DENIED');
      const manifest = path.join(directory, 'widgetInfo.json'), file = path.join(directory, 'widget.js');
      for (const candidate of [manifest, file]) {
        if (fs.realpathSync(candidate) !== candidate || fs.statSync(candidate).size > 262144) throw new Error('WIDGET_SANDBOX_FILE_DENIED');
      }
      const info = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      assertWidgetSandboxContract(info);
      if (info.widgetId !== match[1]) throw new Error('WIDGET_SANDBOX_ID_INVALID');
      res.set({ 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store', 'X-Blogposter-Widget-Contract': '2',
        'Content-Security-Policy': "default-src 'none'; sandbox", 'Cross-Origin-Resource-Policy': 'cross-origin',
        'Access-Control-Allow-Origin': '*' });
      const source = fs.readFileSync(file, 'utf8');
      validateWidgetSandboxSource(source);
      res.set('X-Blogposter-Widget-Code-Hash', require('crypto').createHash('sha256').update(source).digest('hex'));
      res.set('Access-Control-Expose-Headers', 'X-Blogposter-Widget-Contract, X-Blogposter-Widget-Code-Hash');
      return res.send(widgetSandboxSource(source));
    } catch (err) { return res.status(409).json({ code: err.code || 'WIDGET_SANDBOX_ASSET_INVALID' }); }
  };
}

module.exports = { widgetSandboxAssets };
