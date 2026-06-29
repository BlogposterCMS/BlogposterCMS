import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';

const originalPrivateKey = process.env.APP_FRAME_ORIGIN_TOKEN_PRIVATE_KEY;
const originalPublicKey = process.env.APP_FRAME_ORIGIN_TOKEN_PUBLIC_KEY;

function setAppFrameTestKeys() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  process.env.APP_FRAME_ORIGIN_TOKEN_PRIVATE_KEY = privateKey
    .export({ type: 'pkcs8', format: 'pem' })
    .toString();
  process.env.APP_FRAME_ORIGIN_TOKEN_PUBLIC_KEY = publicKey
    .export({ type: 'spki', format: 'pem' })
    .toString();
}

describe('mediaManager uploadFileToFolder', () => {
  let tempDir: string;
  let originalCwd: string;
  let emitter: EventEmitter;
  let mediaManager: {
    initialize: (args: {
      motherEmitter: EventEmitter;
      app?: unknown;
      isCore: boolean;
      jwt: string;
    }) => Promise<void>;
  };

  const mediaPayload = (payload: Record<string, unknown> = {}) => ({
    jwt: 'token',
    moduleName: 'mediaManager',
    moduleType: 'core',
    decodedJWT: {
      permissions: {
        media: { manage: true },
        builder: { publish: true },
        content: { update: true }
      }
    },
    ...payload
  });

  const emitEvent = (eventName: string, payload: Record<string, unknown>) => new Promise((resolve, reject) => {
    emitter.emit(eventName, payload, (err: Error | null, result: unknown) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });

  const emitUpload = (payload: Record<string, unknown>) => new Promise((resolve, reject) => {
    emitter.emit('uploadFileToFolder', payload, (err: Error | null, result: unknown) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });

  beforeEach(async () => {
    jest.resetModules();
    setAppFrameTestKeys();
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-manager-'));
    process.chdir(tempDir);

    emitter = new EventEmitter();
    emitter.on('createDatabase', (_payload, cb) => cb(null));
    emitter.on('dbUpdate', (_payload, cb) => cb(null));

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mediaManager = require('../mother/modules/mediaManager');
    await mediaManager.initialize({ motherEmitter: emitter, app: undefined, isCore: true, jwt: 'token' });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (originalPrivateKey === undefined) {
      delete process.env.APP_FRAME_ORIGIN_TOKEN_PRIVATE_KEY;
    } else {
      process.env.APP_FRAME_ORIGIN_TOKEN_PRIVATE_KEY = originalPrivateKey;
    }
    if (originalPublicKey === undefined) {
      delete process.env.APP_FRAME_ORIGIN_TOKEN_PUBLIC_KEY;
    } else {
      process.env.APP_FRAME_ORIGIN_TOKEN_PUBLIC_KEY = originalPublicKey;
    }
  });

  it('writes an empty file when fileData is an empty string', async () => {
    const result = await emitUpload(mediaPayload({
      fileName: 'image.png',
      fileData: '',
      subPath: 'empty',
      mimeType: 'image/png'
    })) as { success: boolean; fileName: string; mimeType: string };

    expect(result.success).toBe(true);
    expect(result.mimeType).toBe('image/png');

    const storedFile = path.join(process.cwd(), 'library', 'empty', result.fileName);
    const stats = fs.statSync(storedFile);
    expect(stats.size).toBe(0);
  });

  it('allows packaged webfont assets by extension', async () => {
    const result = await emitUpload(mediaPayload({
      fileName: 'brand.woff2',
      fileData: Buffer.from([0, 1, 0, 2]).toString('base64'),
      subPath: 'builder/imports/wordpressSitePackage/fonts'
    })) as { success: boolean; fileName: string; mimeType: string };

    expect(result.success).toBe(true);
    expect(result.mimeType).toBe('font/woff2');
    expect(fs.existsSync(path.join(process.cwd(), 'library', 'builder', 'imports', 'wordpressSitePackage', 'fonts', result.fileName))).toBe(true);
  });

  it('rejects uploads when the extension is not allowed', async () => {
    await expect(emitUpload(mediaPayload({
      fileName: 'notes.txt',
      fileData: '',
      subPath: 'empty',
      mimeType: 'text/plain'
    }))).rejects.toThrow('[MEDIA MANAGER] uploadFileToFolder => disallowed file type.');
  });

  it('rejects local file events without a mediaManager core payload', async () => {
    await expect(emitUpload({
      jwt: 'token',
      fileName: 'image.png',
      fileData: '',
      subPath: 'empty',
      mimeType: 'image/png'
    })).rejects.toThrow('[MEDIA MANAGER] uploadFileToFolder => invalid meltdown payload.');
  });

  it('rejects local file paths that try to leave the library root', async () => {
    await expect(emitUpload(mediaPayload({
      fileName: 'image.png',
      fileData: '',
      subPath: '../escape',
      mimeType: 'image/png'
    }))).rejects.toThrow('[MEDIA MANAGER] Invalid library path.');
    expect(fs.existsSync(path.join(tempDir, 'escape'))).toBe(false);
  });

  it('rejects library paths that pass through a linked directory', async () => {
    const outsideDir = path.join(tempDir, 'outside');
    const linkDir = path.join(process.cwd(), 'library', 'linked');
    fs.mkdirSync(outsideDir, { recursive: true });
    try {
      fs.symlinkSync(outsideDir, linkDir, process.platform === 'win32' ? 'junction' : 'dir');
    } catch {
      return;
    }

    await expect(emitUpload(mediaPayload({
      fileName: 'image.png',
      fileData: '',
      subPath: 'linked',
      mimeType: 'image/png'
    }))).rejects.toThrow('cannot be a symlink or junction');
    expect(fs.existsSync(path.join(outsideDir, 'image.png'))).toBe(false);
  });

  it('keeps deleteLocalItem behind explicit media or builder permissions', async () => {
    const builderDir = path.join(process.cwd(), 'library', 'builder');
    fs.mkdirSync(builderDir, { recursive: true });
    const keptFile = path.join(builderDir, 'keep.png');
    fs.writeFileSync(keptFile, 'keep');

    await expect(emitEvent('deleteLocalItem', mediaPayload({
      decodedJWT: { permissions: {} },
      currentPath: 'builder',
      itemName: 'keep.png'
    }))).rejects.toThrow('Forbidden - missing permission: media.manage');
    expect(fs.existsSync(keptFile)).toBe(true);
  });

  it('does not trust caller supplied isAdmin when publishing files', async () => {
    const privateDir = path.join(process.cwd(), 'library', 'private');
    fs.mkdirSync(privateDir, { recursive: true });
    fs.writeFileSync(path.join(privateDir, 'asset.png'), 'asset');

    await expect(emitEvent('makeFilePublic', mediaPayload({
      decodedJWT: { permissions: { builder: { publish: true } } },
      filePath: 'private/asset.png',
      userId: 'user-1',
      isAdmin: true
    }))).rejects.toThrow('[MEDIA MANAGER] makeFilePublic => path must reside under "builder/"');
  });
});
