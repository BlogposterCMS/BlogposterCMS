/**
 * mother/modules/databaseManager/placeholders/placeholderRegistry.js
 */
const fs = require('fs');
const path = require('path');

// NEW: typed notifications
const notificationEmitter = require('../../../emitters/notificationEmitter');

const STORE_FILE = path.join(__dirname, 'placeholderData.json');
let customPlaceholders = {};

function loadCustomPlaceholders() {
  if (!fs.existsSync(STORE_FILE)) {
    notificationEmitter.notify({
      moduleName: 'databaseManager',
      notificationType: 'debug',
      priority: 'debug',
      message: '[PLACEHOLDER REGISTRY] No existing JSON => skipping load.'
    });
    return;
  }
  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    customPlaceholders = JSON.parse(raw);
    notificationEmitter.notify({
      moduleName: 'databaseManager',
      notificationType: 'info',
      priority: 'info',
      message: `[PLACEHOLDER REGISTRY] Loaded placeholders from: ${STORE_FILE}`
    });
  } catch (err) {
    notificationEmitter.notify({
      moduleName: 'databaseManager',
      notificationType: 'system',
      priority: 'critical',
      message: `Error reading JSON => ${err.message}`
    });
  }
}

function saveCustomPlaceholders() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(customPlaceholders, null, 2), 'utf8');
    notificationEmitter.notify({
      moduleName: 'databaseManager',
      notificationType: 'info',
      priority: 'info',
      message: `[PLACEHOLDER REGISTRY] Saved placeholders to => ${STORE_FILE}`
    });
  } catch (err) {
    notificationEmitter.notify({
      moduleName: 'databaseManager',
      notificationType: 'system',
      priority: 'critical',
      message: `Error saving to JSON => ${err.message}`
    });
  }
}

function registerCustomPlaceholder(placeholderName, ref) {
  if (!placeholderName || typeof ref !== 'object') {
    throw new Error('[PLACEHOLDER_REGISTRY_INVALID_ARGUMENTS] Placeholder name and reference are required.');
  }
  const { moduleName, functionName } = ref;
  if (!moduleName || !functionName) {
    throw new Error('[PLACEHOLDER_REGISTRY_INVALID_REFERENCE] moduleName and functionName are required.');
  }

  const existing = customPlaceholders[placeholderName];
  if (
    existing &&
    existing.moduleName === moduleName &&
    existing.functionName === functionName
  ) {
    // Core modules register their handlers on every boot. Re-registering the
    // same owner and function is an idempotent startup operation, not a
    // replacement that needs another disk write or warning.
    return {
      changed: false,
      placeholderName,
      moduleName,
      functionName
    };
  }

  if (existing) {
    notificationEmitter.notify({
      moduleName: 'databaseManager',
      notificationType: 'system',
      priority: 'warning',
      message: `[PLACEHOLDER_REGISTRY_REPLACED] Replacing placeholder "${placeholderName}" from module="${existing.moduleName}", fn="${existing.functionName}" with module="${moduleName}", fn="${functionName}".`
    });
  }

  customPlaceholders[placeholderName] = { moduleName, functionName };
  notificationEmitter.notify({
    moduleName: 'databaseManager',
    notificationType: 'info',
    priority: 'info',
    message: `[PLACEHOLDER REGISTRY] Registered placeholder "${placeholderName}" => module="${moduleName}", fn="${functionName}"`
  });
  saveCustomPlaceholders();

  return {
    changed: true,
    placeholderName,
    moduleName,
    functionName
  };
}

function getCustomPlaceholder(placeholderName) {
  return customPlaceholders[placeholderName] || null;
}

function listCustomPlaceholders() {
  return Object.keys(customPlaceholders);
}

loadCustomPlaceholders();

module.exports = {
  registerCustomPlaceholder,
  getCustomPlaceholder,
  listCustomPlaceholders
};
