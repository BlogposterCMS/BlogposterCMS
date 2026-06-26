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
    throw new Error('registerCustomPlaceholder => invalid arguments.');
  }
  const { moduleName, functionName } = ref;
  if (!moduleName || !functionName) {
    throw new Error('Must provide moduleName and functionName.');
  }
  if (customPlaceholders[placeholderName]) {
    notificationEmitter.notify({
      moduleName: 'databaseManager',
      notificationType: 'system',
      priority: 'warning',
      message: `[PLACEHOLDER REGISTRY] Overwriting existing placeholder => ${placeholderName}`
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
