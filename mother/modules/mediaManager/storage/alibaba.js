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
    async delete(key) { await client.delete(key); },
    async test() { await client.getBucketInfo(config.bucket); },
    async downloadUrl(key, { expiresIn = 300 } = {}) {
      return client.signatureUrl(key, { expires: expiresIn });
    }
  };
};
