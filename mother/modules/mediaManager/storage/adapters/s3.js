'use strict';

const fs = require('node:fs');

/** AWS and S3-compatible endpoints share one SDK adapter, including path-style addressing. */
module.exports = function createS3Adapter(config, dependencies = {}) {
  const sdk = dependencies.sdk || require('@aws-sdk/client-s3');
  const sign = dependencies.sign || require('@aws-sdk/s3-request-presigner').getSignedUrl;
  const client = new sdk.S3Client({
    region: config.region, forcePathStyle: config.forcePathStyle,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.accessKeySecret },
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    requestHandler: { connectionTimeout: 10000, requestTimeout: 60000 },
    maxAttempts: 3
  });
  const object = key => ({ Bucket: config.bucket, Key: key });
  return {
    async put({ key, filePath, mimeType, sizeBytes }) {
      const body = fs.createReadStream(filePath);
      try {
        await client.send(new sdk.PutObjectCommand({ ...object(key), Body: body, ContentLength: sizeBytes, ContentType: mimeType }));
      } finally { body.destroy(); }
    },
    async head(key) { return client.send(new sdk.HeadObjectCommand(object(key))); },
    async list(prefix = '') {
      const objects = []; const folders = new Set(); const visited = new Set(); let token;
      do {
        const page = await client.send(new sdk.ListObjectsV2Command({ Bucket: config.bucket,
          Prefix: prefix ? `${prefix}/` : '', Delimiter: '/', MaxKeys: 1000, ContinuationToken: token }));
        objects.push(...(page.Contents || []).map(item => ({ key: item.Key, size: item.Size, modifiedAt: item.LastModified?.toISOString() || '' })));
        for (const item of page.CommonPrefixes || []) folders.add(item.Prefix);
        token = page.IsTruncated ? page.NextContinuationToken : null;
        // Broken endpoints must not keep a worker in an endless pagination loop.
        if (objects.length + folders.size > 10000 || visited.size >= 100 || (page.IsTruncated && (!token || visited.has(token)))) throw new Error('MEDIA_STORAGE_LIST_LIMIT');
        if (token) visited.add(token);
      } while (token);
      return { objects, folders: [...folders] };
    },
    async delete(key) { await client.send(new sdk.DeleteObjectCommand(object(key))); },
    async test() { await client.send(new sdk.HeadBucketCommand({ Bucket: config.bucket })); },
    async downloadUrl(key, { expiresIn = 300 } = {}) {
      return sign(client, new sdk.GetObjectCommand(object(key)), { expiresIn });
    }
  };
};
module.exports.definition = { id: 's3', label: 'AWS S3 / S3-compatible', fields: [
  ...require('../objectStorageConfig').fields,
  { name: 'forcePathStyle', label: 'Use path-style addressing', type: 'checkbox' }
] };
module.exports.normalize = require('../objectStorageConfig').normalize;
