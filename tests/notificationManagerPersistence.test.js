const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  ensureRuntimeRegistry,
  loadIntegrations,
  loadRegistry,
  resolveStatePaths,
  _internals
} = require('../mother/modules/notificationManager/notificationManagerService');

function createStateDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'notification-state-'));
}

test('first start copies signed defaults to writable persistent notification state', async () => {
  const stateDir = createStateDir();
  const releaseBefore = fs.readFileSync(_internals.releaseRegistryPath, 'utf8');
  try {
    const paths = ensureRuntimeRegistry({ stateDir });
    expect(paths).toEqual(resolveStatePaths({ stateDir }));
    expect(fs.existsSync(paths.registryPath)).toBe(true);

    const integrations = await loadIntegrations({ stateDir });
    expect(integrations.FileLog.active).toBe(true);
    expect(integrations.FileLog.config.logPath).toBe(paths.logPath);
    await integrations.FileLog.module.verify(integrations.FileLog.config);
    expect(fs.existsSync(paths.logPath)).toBe(true);
    expect(fs.readFileSync(_internals.releaseRegistryPath, 'utf8')).toBe(releaseBefore);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('existing user configuration is preserved while release field metadata is refreshed', async () => {
  const stateDir = createStateDir();
  const paths = resolveStatePaths({ stateDir });
  const customLogPath = path.join(stateDir, 'custom.log');
  const existing = {
    FileLog: { active: false, config: { logPath: customLogPath }, fields: [] },
    Slack: { active: false, config: { webhookUrl: 'https://hooks.slack.com/services/user/value' }, fields: [] },
    CustomUserEntry: { active: true, config: { keep: 'yes' }, fields: [] }
  };
  fs.writeFileSync(paths.registryPath, JSON.stringify(existing));

  try {
    await loadIntegrations({ stateDir });
    const persisted = loadRegistry({ stateDir });
    expect(persisted.FileLog.active).toBe(false);
    expect(persisted.FileLog.config.logPath).toBe(customLogPath);
    expect(persisted.Slack.config.webhookUrl).toBe(existing.Slack.config.webhookUrl);
    expect(persisted.CustomUserEntry.config.keep).toBe('yes');
    expect(persisted.FileLog.fields.length).toBeGreaterThan(0);
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('legacy shipped log path migrates inside data without replacing other user config', async () => {
  const stateDir = createStateDir();
  const paths = resolveStatePaths({ stateDir });
  fs.writeFileSync(paths.registryPath, JSON.stringify({
    FileLog: {
      active: true,
      config: { logPath: _internals.LEGACY_FILE_LOG_PATH, retained: 'value' },
      fields: []
    }
  }));
  try {
    await loadIntegrations({ stateDir });
    const persisted = loadRegistry({ stateDir });
    expect(persisted.FileLog.config.logPath).toBe(paths.logPath);
    expect(persisted.FileLog.config.retained).toBe('value');
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});

test('invalid persistent registry fails closed and is not overwritten', () => {
  const stateDir = createStateDir();
  const paths = resolveStatePaths({ stateDir });
  fs.writeFileSync(paths.registryPath, '{invalid');
  try {
    expect(() => loadRegistry({ stateDir })).toThrow(
      expect.objectContaining({ code: 'NOTIFICATION_REGISTRY_INVALID' })
    );
    expect(fs.readFileSync(paths.registryPath, 'utf8')).toBe('{invalid');
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
  }
});
