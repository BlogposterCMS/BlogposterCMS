'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const express = require('express');
const { hasPermission } = require('../../userManagement/permissionUtils');
const { createConfigStore, publicConfig } = require('./config');
const { createStorageAdapter, publicDeliveryUrl } = require('./index');
const { receiveUpload } = require('./upload');

function requireMedia(req, res, next) {
  if (!req.user || !hasPermission(req.user, 'media.manage')) {
    return res.status(403).json({ error: 'MEDIA_STORAGE_FORBIDDEN' });
  }
  next();
}

function requireSettings(req, res, next) {
  if (!hasPermission(req.user, 'settings.unified.editSettings')) {
    return res.status(403).json({ error: 'MEDIA_STORAGE_SETTINGS_FORBIDDEN' });
  }
  next();
}

function safeError(res, error) {
  const code = /^MEDIA_STORAGE_[A-Z_]+$/.test(error?.message || '') ? error.message : 'MEDIA_STORAGE_OPERATION_FAILED';
  res.status(400).json({ error: code });
}

/** HTTP is the existing media upload boundary; metadata and settings retain their owners. */
function setupStorageRoutes(app, options) {
  const { auth, csrf, readSetting, writeSetting, saveAttachment, resolveSafePath, mimeMap } = options;
  const store = createConfigStore({ readSetting, writeSetting,
    keyDirectory: path.join(process.cwd(), 'data', 'mediaManager') });
  const adapterFor = config => createStorageAdapter(config, { resolveSafePath });
  const base = '/admin/api/media/storage';
  // Read credentials only after authorization, and never serialize the private config.
  app.get(base, auth, requireMedia, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json({ ...publicConfig(await store.read()), canConfigure: hasPermission(req.user, 'settings.unified.editSettings') }); }
    catch (error) { safeError(res, error); }
  });
  app.put(base, auth, requireMedia, requireSettings, csrf, express.json({ limit: '16kb' }), async (req, res) => {
    try { res.json(await store.save(req.body)); }
    catch (error) { safeError(res, error); }
  });
  app.post(`${base}/test`, auth, requireMedia, requireSettings, csrf, async (_req, res) => {
    try {
      await adapterFor(await store.read()).test();
      res.json({ ok: true });
    } catch (error) { safeError(res, error); }
  });
  app.post(`${base}/upload`, auth, requireMedia, csrf, async (req, res) => {
    let upload;
    try {
      const config = await store.read();
      const adapter = adapterFor(config);
      const limit = Number(process.env.MAX_UPLOAD_BYTES || 20000000);
      if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('MEDIA_STORAGE_UPLOAD_LIMIT_INVALID');
      upload = await receiveUpload(req, { ...mimeMap, '.apk': 'application/vnd.android.package-archive', '.zip': 'application/zip', '.pdf': 'application/pdf' }, limit);
      const name = upload.fileName.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(-180);
      const key = `downloads/${crypto.randomUUID()}/${name}`;
      const url = publicDeliveryUrl(config, key);
      await adapter.put({ ...upload, key });
      try {
        await saveAttachment({
          fileName: upload.fileName, mimeType: upload.mimeType,
          storagePath: config.provider === 'local' ? `public/${key}` : key,
          url, checksum: upload.checksum, sizeBytes: upload.sizeBytes,
          category: 'download', status: 'active', visibility: 'public',
          userId: req.user.user?.id || req.user.userId || req.user.id || req.user.sub,
          meta: { storage: { provider: config.provider, bucket: config.bucket || '', objectKey: key, deliveryUrl: url },
            artifact: { version: upload.appVersion, kind: 'application-package', checksumAlgorithm: 'sha256' } }
        });
      } catch {
        // Unique keys ensure compensation can never remove a pre-existing object.
        try { await adapter.delete(key); }
        catch { throw new Error('MEDIA_STORAGE_METADATA_FAILED_CLEANUP_REQUIRED'); }
        throw new Error('MEDIA_STORAGE_METADATA_FAILED');
      }
      res.json({ success: true, fileName: upload.fileName, url, checksum: upload.checksum, sizeBytes: upload.sizeBytes });
    } catch (error) { safeError(res, error); }
    finally { if (upload) await upload.cleanup().catch(() => {}); }
  });
}

module.exports = { setupStorageRoutes, requireMedia, requireSettings, safeError };
