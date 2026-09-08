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
    async delete(key) { await client.send(new sdk.DeleteObjectCommand(object(key))); },
    async test() { await client.send(new sdk.HeadBucketCommand({ Bucket: config.bucket })); },
    async downloadUrl(key, { expiresIn = 300 } = {}) {
      return sign(client, new sdk.GetObjectCommand(object(key)), { expiresIn });
    }
  };
};
