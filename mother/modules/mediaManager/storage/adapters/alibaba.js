'use strict';

/** Official SDK stays server-only and is loaded only when this provider is selected. */
module.exports = function createAlibabaAdapter(config, dependencies = {}) {
  const OSS = dependencies.OSS || require('ali-oss');
  const client = new OSS({
    region: config.region, bucket: config.bucket,
    accessKeyId: config.accessKeyId, accessKeySecret: config.accessKeySecret,
    secure: true, timeout: 60000,
    ...(config.endpoint ? { endpoint: config.endpoint } : {})
  });
  return {
    async put({ key, filePath, mimeType }) {
      // Bucket/CDN policy owns anonymous delivery; do not widen object ACLs implicitly.
      await client.put(key, filePath, { headers: { 'Content-Type': mimeType } });
    },
    async head(key) { return client.head(key); },
    async list(prefix = '') {
      const objects = []; const folders = new Set(); const visited = new Set(); let marker;
      do {
        const page = await client.list({ prefix: prefix ? `${prefix}/` : '', delimiter: '/', 'max-keys': 1000, marker });
        objects.push(...(page.objects || []).map(item => ({ key: item.name, size: item.size, modifiedAt: item.lastModified })));
        for (const folder of page.prefixes || []) folders.add(folder);
        marker = page.isTruncated ? page.nextMarker : null;
        // Broken endpoints must not keep a worker in an endless pagination loop.
        if (objects.length + folders.size > 10000 || visited.size >= 100 || (page.isTruncated && (!marker || visited.has(marker)))) throw new Error('MEDIA_STORAGE_LIST_LIMIT');
        if (marker) visited.add(marker);
      } while (marker);
      return { objects, folders: [...folders] };
    },
    async delete(key) { await client.delete(key); },
    async test() { await client.getBucketInfo(config.bucket); },
    async downloadUrl(key, { expiresIn = 300 } = {}) {
      return client.signatureUrl(key, { expires: expiresIn });
    }
  };
};
module.exports.definition = { id: 'alibaba-oss', label: 'Alibaba OSS', fields: require('../objectStorageConfig').fields };
module.exports.normalize = require('../objectStorageConfig').normalize;
