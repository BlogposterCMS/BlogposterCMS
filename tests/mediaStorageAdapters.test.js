const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createConfigStore, normalizeConfig, publicConfig } = require('../mother/modules/mediaManager/storage/config');
const { createStorageAdapter, publicDeliveryUrl } = require('../mother/modules/mediaManager/storage');

const config = { provider: 'alibaba-oss', bucket: 'test-bucket', region: 'oss-cn-hangzhou', publicBaseUrl: 'https://cdn.example.com', accessKeyId: 'private-id', accessKeySecret: 'private-secret' };

describe('Media Manager storage adapters and credential boundary', () => {
  let directory;
  beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'media-adapter-test-')); });
  afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });

  test('settings contain only ciphertext, reload decrypts, and blank credentials retain secrets', async () => {
    let stored;
    const options = { readSetting: async () => stored, writeSetting: async value => { stored = value; }, keyDirectory: directory };
    const store = createConfigStore(options);
    expect(await store.read()).toEqual({ provider: 'local' });
    const result = await store.save(config);
    expect(JSON.stringify(result)).not.toContain('private-');
    expect(JSON.stringify(stored)).not.toContain('private-');
    expect(result.credentialsConfigured).toBe(true);
    const reloaded = createConfigStore(options);
    expect((await reloaded.read()).accessKeySecret).toBe('private-secret');
    await reloaded.save({ ...config, accessKeyId: '', accessKeySecret: '' });
    expect((await reloaded.read()).accessKeySecret).toBe('private-secret');
    stored.data = Buffer.from('tampered').toString('base64');
    await expect(store.read()).rejects.toThrow('MEDIA_STORAGE_CONFIG_UNREADABLE');
  });

  test('provider switch cannot inherit another provider credentials and local drops them', () => {
    expect(() => normalizeConfig({ ...config, provider: 's3', accessKeyId: '', accessKeySecret: '' }, config)).toThrow('CREDENTIALS_REQUIRED');
    expect(normalizeConfig({ provider: 'local' }, config)).toEqual({ provider: 'local' });
    expect(publicConfig(config)).not.toHaveProperty('accessKeyId');
  });

  test('native providers derive public URLs while custom endpoints require explicit delivery configuration', () => {
    expect(normalizeConfig({ ...config, region: 'cn-hangzhou', publicBaseUrl: '' })).toMatchObject({ region: 'oss-cn-hangzhou', publicBaseUrl: 'https://test-bucket.oss-cn-hangzhou.aliyuncs.com' });
    expect(normalizeConfig({ ...config, provider: 's3', region: 'eu-central-1', publicBaseUrl: '' }).publicBaseUrl).toBe('https://test-bucket.s3.eu-central-1.amazonaws.com');
    expect(() => normalizeConfig({ ...config, endpoint: 'https://custom.example.com', publicBaseUrl: '' })).toThrow('PUBLIC_URL_REQUIRED');
  });

  test.each(['http://cdn.example.com', 'https://id:secret@cdn.example.com', 'https://cdn.example.com/?token=x', 'javascript:alert(1)'])('rejects unsafe endpoint/base URL %s', url => {
    expect(() => normalizeConfig({ ...config, endpoint: url })).toThrow('URL_INVALID');
    expect(() => normalizeConfig({ ...config, publicBaseUrl: url })).toThrow('URL_INVALID');
  });

  test('Alibaba SDK receives server credentials and implements put/head/delete/sign/test', async () => {
    const client = { put: jest.fn(), head: jest.fn(), delete: jest.fn(), getBucketInfo: jest.fn(), signatureUrl: jest.fn(() => 'signed') };
    const OSS = jest.fn(() => client);
    const adapter = createStorageAdapter(config, {}, { OSS });
    await adapter.put({ key: 'downloads/id/app.apk', filePath: 'temp.apk', mimeType: 'application/vnd.android.package-archive' });
    await adapter.head('downloads/id/app.apk');
    await adapter.test();
    await adapter.delete('downloads/id/app.apk');
    expect(await adapter.downloadUrl('downloads/id/app.apk')).toBe('signed');
    expect(OSS).toHaveBeenCalledWith(expect.objectContaining({ secure: true, accessKeySecret: 'private-secret' }));
    expect(client.put).toHaveBeenCalledWith('downloads/id/app.apk', 'temp.apk', { headers: { 'Content-Type': 'application/vnd.android.package-archive' } });
    expect(client.getBucketInfo).toHaveBeenCalledWith('test-bucket');
    client.head.mockRejectedValue(new Error('private-secret signed-url'));
    await expect(adapter.head('downloads/id/app.apk')).rejects.toThrow(/^MEDIA_STORAGE_HEAD_FAILED$/);
    await expect(adapter.delete('downloads/../secret')).rejects.toThrow('KEY_INVALID');
    expect(publicDeliveryUrl(config, 'downloads/id/app.apk')).toBe('https://cdn.example.com/downloads/id/app.apk');
  });

  test('S3 uses endpoint/path-style, streams bytes, and does not request public ACLs', async () => {
    const sdk = {};
    for (const name of ['PutObjectCommand', 'HeadObjectCommand', 'HeadBucketCommand', 'DeleteObjectCommand', 'GetObjectCommand']) {
      sdk[name] = class { constructor(input) { this.input = input; this.name = name; } };
    }
    let bytes;
    const send = jest.fn(async command => {
      if (command.input.Body) { const chunks = []; for await (const chunk of command.input.Body) chunks.push(chunk); bytes = Buffer.concat(chunks); }
    });
    sdk.S3Client = jest.fn(() => ({ send }));
    const sign = jest.fn(async () => 'signed-s3');
    const filePath = path.join(directory, 'app.apk'); fs.writeFileSync(filePath, 'apk-bytes');
    const adapter = createStorageAdapter({ ...config, provider: 's3', endpoint: 'https://objects.example.com', forcePathStyle: true }, {}, { sdk, sign });
    await adapter.put({ key: 'downloads/id/app.apk', filePath, sizeBytes: 9, mimeType: 'application/vnd.android.package-archive' });
    expect(bytes.toString()).toBe('apk-bytes');
    expect(send.mock.calls[0][0].input).not.toHaveProperty('ACL');
    expect(sdk.S3Client).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://objects.example.com', forcePathStyle: true }));
    await adapter.head('downloads/id/app.apk'); await adapter.test(); await adapter.delete('downloads/id/app.apk');
    expect(await adapter.downloadUrl('downloads/id/app.apk')).toBe('signed-s3');
  });

  test('local publication never overwrites an existing object', async () => {
    const source = path.join(directory, 'source'); fs.writeFileSync(source, 'original');
    const adapter = createStorageAdapter({ provider: 'local' }, { resolveSafePath: key => path.join(directory, key) });
    await adapter.put({ key: 'downloads/id/file.apk', filePath: source });
    await expect(adapter.put({ key: 'downloads/id/file.apk', filePath: source })).rejects.toThrow('PUT_FAILED');
    expect((await adapter.head('downloads/id/file.apk')).size).toBe(8);
    expect(await adapter.downloadUrl('downloads/id/file.apk')).toBe('/media/downloads/id/file.apk');
    await adapter.delete('downloads/id/file.apk');
  });
});
