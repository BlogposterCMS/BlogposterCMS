'use strict';

// Shared field descriptors keep Alibaba and S3 conventions consistent without coupling SDKs.
const fields = [
  { name: 'bucket', label: 'Bucket', required: true },
  { name: 'region', label: 'Region', required: true },
  { name: 'endpoint', label: 'Server endpoint (optional)', type: 'url', hint: 'HTTPS endpoint; leave empty for the provider default.' },
  { name: 'publicBaseUrl', label: 'Download / CDN base URL (optional)', type: 'url', hint: 'Optional for browsing. Needed to publish downloads through a custom endpoint.' },
  { name: 'accessKeyId', label: 'Access key ID', secret: true, required: true },
  { name: 'accessKeySecret', label: 'Access key secret', secret: true, required: true }
];

function normalize(config, { fail }) {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(config.bucket)) fail('BUCKET_INVALID');
  if (!/^[a-z0-9-]{1,80}$/.test(config.region)) fail('REGION_REQUIRED');
  if (config.provider === 'alibaba-oss' && !config.region.startsWith('oss-')) config.region = `oss-${config.region}`;
  if (!config.publicBaseUrl && !config.endpoint) {
    const domain = config.region.startsWith('cn-') ? 'amazonaws.com.cn' : 'amazonaws.com';
    config.publicBaseUrl = config.provider === 'alibaba-oss'
      ? `https://${config.bucket}.${config.region}.aliyuncs.com`
      : config.forcePathStyle || config.bucket.includes('.')
        ? `https://s3.${config.region}.${domain}/${config.bucket}`
        : `https://${config.bucket}.s3.${config.region}.${domain}`;
  }
  return config;
}
module.exports = { fields, normalize };
