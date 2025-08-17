const fs = require('fs');
const path = require('path');

const registryPath = path.join(__dirname, 'integrationsRegistry.json');
const integrationsDir = path.join(__dirname, 'integrations');

function loadRegistry() {
  if (!fs.existsSync(registryPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

function saveRegistry(registry) {
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

async function loadIntegrations() {
  // Dynamisch alle .js Dateien im integrations/ Ordner laden
  const files = fs.readdirSync(integrationsDir).filter(f => f.endsWith('.js'));
  const registry = loadRegistry();

  const loaded = {};

  for (const file of files) {
    const fullPath = path.join(integrationsDir, file);
    const integrationModule = require(fullPath);
    const name = integrationModule.integrationName || file.replace('.js', '');

    // Falls in registry noch kein Eintrag => standard
    if (!registry[name]) {
      registry[name] = { active: false, config: {}, fields: [] };
    }

    // Sync optional field metadata so the admin UI can render forms
    registry[name].fields = integrationModule.fields || registry[name].fields || [];

    loaded[name] = {
      name,
      active: registry[name].active,
      config: registry[name].config,
      fields: registry[name].fields,
      module: integrationModule
    };
  }

  // Save registry in case we found new integrations
  saveRegistry(registry);

  return loaded;
}

function getRecentNotifications(limit = 10) {
  const registry = loadRegistry();
  const logPath = registry.FileLog?.config?.logPath || path.join(__dirname, 'server.log');
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  const slice = lines.slice(-Math.min(parseInt(limit, 10) || 10, 100));
  return slice.map(line => {
    const parts = line.split('|');
    const priorityMatch = line.match(/^\[(.+?)\]/);
    return {
      priority: (priorityMatch ? priorityMatch[1] : 'info').toLowerCase(),
      timestamp: parts[0].replace(/\[.+?\]\s*/, '').trim(),
      moduleName: (parts[1] || '').replace('Module:', '').trim(),
      message: (parts.slice(2).join('|') || '').trim()
    };
  });
}

module.exports = {
  loadRegistry,
  saveRegistry,
  loadIntegrations,
  getRecentNotifications
};
