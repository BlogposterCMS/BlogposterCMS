'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const versions = new Map();
const VERSIONED_TYPE = /\.(?:js|css|woff2?|ttf|otf|svg)$/i;

function assetVersion(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) return null;
  const fingerprint = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
  const cached = versions.get(filePath);
  if (cached?.fingerprint === fingerprint) return cached.version;
  const version = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, 16);
  if (versions.size >= 512) versions.delete(versions.keys().next().value);
  versions.set(filePath, { fingerprint, version });
  return version;
}

/** Only trusted shell assets, before page content/token injection, are rewritten. */
function versionShellAssets(html, publicPath) {
  const root = path.resolve(publicPath);
  return html.replace(/\b(src|href)="(\/(?:build|assets|fonts)\/[^"?#]+)"/g, (match, attr, url) => {
    if (!VERSIONED_TYPE.test(url)) return match;
    const filePath = path.resolve(root, `.${url}`);
    if (!filePath.startsWith(`${root}${path.sep}`)) return match;
    try {
      const version = assetVersion(filePath);
      return version ? `${attr}="${url}?v=${version}"` : match;
    } catch (error) {
      // Missing optional assets retain their original 404, never a fake version.
      if (error.code !== 'ENOENT') console.warn('STATIC_ASSET_VERSION_FAILED', error.code);
      return match;
    }
  });
}

function setVersionedAssetHeaders(res, filePath) {
  if (!VERSIONED_TYPE.test(filePath)) return;
  const requested = res.req.query?.v;
  if (typeof requested !== 'string' || !/^[a-f0-9]{16}$/.test(requested)) return;
  try {
    // Arbitrary query strings must not make mutable entrypoints immutable.
    if (requested === assetVersion(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  } catch (error) {
    console.warn('STATIC_ASSET_VERSION_FAILED', error.code);
  }
}

module.exports = { versionShellAssets, setVersionedAssetHeaders };
