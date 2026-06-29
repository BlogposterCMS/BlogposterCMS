'use strict';

const fs = require('fs');
const path = require('path');

const SERVICE_ENV_KEYS = Object.freeze({
  openai: ['OPENAI_API_KEY'],
  grok: ['GROK_API_KEY'],
  xai: ['XAI_API_KEY'],
  brave: ['BRAVE_API_KEY'],
  news: ['NEWS_MODEL']
});

const HOST_PROCESS_ENV_KEYS = Object.freeze([
  'SystemRoot',
  'WINDIR',
  'TEMP',
  'TMP'
]);

function normalizeServiceName(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

function readModuleApiDefinition(moduleRoot) {
  const apiDefinitionPath = path.join(moduleRoot, 'apiDefinition.json');
  if (!fs.existsSync(apiDefinitionPath)) {
    return { services: [] };
  }

  const parsed = JSON.parse(fs.readFileSync(apiDefinitionPath, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('[E_MODULE_API_DEFINITION_INVALID] apiDefinition.json must be a JSON object.');
  }
  return parsed;
}

function serviceNamesFromApiDefinition(apiDefinition = {}) {
  const services = Array.isArray(apiDefinition.services) ? apiDefinition.services : [];
  const names = new Set();
  for (const service of services) {
    let name = '';
    if (typeof service === 'string') {
      name = service;
    } else if (service && typeof service === 'object') {
      name = service.name || service.service || service.provider || '';
    }
    const normalized = normalizeServiceName(name);
    if (normalized) names.add(normalized);
  }
  return names;
}

function buildModuleRuntimeEnv(moduleRoot) {
  const apiDefinition = readModuleApiDefinition(moduleRoot);
  const env = Object.create(null);

  for (const key of HOST_PROCESS_ENV_KEYS) {
    if (process.env[key] !== undefined) {
      env[key] = process.env[key];
    }
  }

  for (const serviceName of serviceNamesFromApiDefinition(apiDefinition)) {
    const keys = SERVICE_ENV_KEYS[serviceName] || [];
    for (const key of keys) {
      if (process.env[key] !== undefined) {
        env[key] = process.env[key];
      }
    }
  }
  return Object.freeze(env);
}

module.exports = {
  HOST_PROCESS_ENV_KEYS,
  SERVICE_ENV_KEYS,
  buildModuleRuntimeEnv,
  normalizeServiceName,
  readModuleApiDefinition,
  serviceNamesFromApiDefinition
};
