'use strict';

const fs = require('node:fs');
const { parseStringPromise, processors } = require('xml2js');

/** HTTPS WebDAV uses the existing HTTP/XML dependencies; redirects never receive credentials. */
module.exports = function createWebdavAdapter(config, dependencies = {}) {
  const axios = dependencies.axios || require('axios');
  const base = `${config.endpoint}/`;
  const address = key => base + key.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  const request = (method, key = '', options = {}) => axios.request({
    method, url: address(key), auth: { username: config.username, password: config.password },
    timeout: 60000, maxRedirects: 0, maxContentLength: 2 * 1024 * 1024,
    maxBodyLength: Infinity, responseType: 'text', ...options
  });
  async function properties(key, depth) {
    const response = await request('PROPFIND', key, {
      // Canonical collection URLs avoid the redirects that must not carry credentials.
      url: `${address(key).replace(/\/$/, '')}/`,
      headers: { Depth: String(depth), 'Content-Type': 'application/xml' },
      data: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontentlength/><d:getlastmodified/></d:prop></d:propfind>'
    });
    if (response.status !== 207 || typeof response.data !== 'string' || /<!DOCTYPE|<!ENTITY/i.test(response.data)) throw new Error('Invalid DAV response');
    const parsed = await parseStringPromise(response.data, { tagNameProcessors: [processors.stripPrefix], explicitArray: false });
    const rows = parsed.multistatus?.response;
    return Array.isArray(rows) ? rows : rows ? [rows] : [];
  }
  return {
    async test() { await properties('', 0); },
    async list(prefix = '') {
      const objects = []; const folders = [];
      for (const row of await properties(prefix, 1)) {
        const href = new URL(row.href, base);
        if (href.origin !== new URL(base).origin || !href.pathname.startsWith(new URL(base).pathname)) continue;
        const key = decodeURIComponent(href.pathname.slice(new URL(base).pathname.length)).replace(/\/$/, '');
        if (!key || key === prefix) continue;
        const stats = Array.isArray(row.propstat) ? row.propstat : [row.propstat];
        const props = stats.find(stat => /\s200\s/.test(stat?.status || ''))?.prop;
        if (!props) continue;
        if (props.resourcetype && Object.hasOwn(props.resourcetype, 'collection')) folders.push(`${key}/`);
        else objects.push({ key, size: Number(props.getcontentlength) || 0, modifiedAt: props.getlastmodified || '' });
      }
      return { objects, folders };
    },
    async put({ key, filePath, mimeType, sizeBytes }) {
      const segments = key.split('/');
      for (let index = 1; index < segments.length; index++) {
        await request('MKCOL', segments.slice(0, index).join('/'), { validateStatus: code => (code >= 200 && code < 300) || code === 405 });
      }
      const body = fs.createReadStream(filePath);
      try { await request('PUT', key, { data: body, headers: { 'Content-Type': mimeType, 'Content-Length': sizeBytes, 'If-None-Match': '*' } }); }
      finally { body.destroy(); }
    },
    async head(key) { const result = await request('HEAD', key); return result.headers; },
    async delete(key) { await request('DELETE', key); },
    async downloadUrl(key) {
      if (!config.publicBaseUrl) throw new Error('Direct download URL unavailable');
      return `${config.publicBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
    }
  };
};
module.exports.definition = { id: 'webdav', label: 'WebDAV / Nextcloud', fields: [
  { name: 'endpoint', label: 'Server address', type: 'url', required: true, hint: 'Full HTTPS WebDAV folder URL, including its path.' },
  { name: 'username', label: 'Username', secret: true, required: true },
  { name: 'password', label: 'Password / app password', secret: true, required: true },
  { name: 'publicBaseUrl', label: 'Public download base URL (optional)', type: 'url', hint: 'Needed only for direct downloads and publishing. Browsing can use a private server.' }
] };
