import fs from 'fs';
import os from 'os';
import path from 'path';
import { EventEmitter } from 'events';

describe('mediaManager uploadFileToFolder', () => {
  let tempDir: string;
  let originalCwd: string;
  let emitter: EventEmitter;
  let mediaManager: { initialize: Function };

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
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-manager-'));
    process.chdir(tempDir);

    emitter = new EventEmitter();
    emitter.on('createDatabase', (_payload, cb) => cb(null));
    emitter.on('dbUpdate', (_payload, cb) => cb(null));

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mediaManager = require('../mother/modules/mediaManager');
    await mediaManager.initialize({ motherEmitter: emitter, app: undefined, isCore: true, jwt: 'token' });
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('writes an empty file when fileData is an empty string', async () => {
    const result = await emitUpload({
      jwt: 'token',
      fileName: 'image.png',
      fileData: '',
      subPath: 'empty',
      mimeType: 'image/png'
    }) as { success: boolean; fileName: string; mimeType: string };

    expect(result.success).toBe(true);
    expect(result.mimeType).toBe('image/png');

    const storedFile = path.join(process.cwd(), 'library', 'empty', result.fileName);
    const stats = fs.statSync(storedFile);
    expect(stats.size).toBe(0);
  });

  it('rejects uploads when the extension is not allowed', async () => {
    await expect(emitUpload({
      jwt: 'token',
      fileName: 'notes.txt',
      fileData: '',
      subPath: 'empty',
      mimeType: 'text/plain'
    })).rejects.toThrow('[MEDIA MANAGER] uploadFileToFolder => disallowed file type.');
  });
});
