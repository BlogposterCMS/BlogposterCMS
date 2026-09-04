'use strict';

const content = require('./domains/content');
const presentation = require('./domains/presentation');
const access = require('./domains/access');
const platform = require('./domains/platform');

const domains = Object.freeze([content, presentation, access, platform]);
const DOMAIN_RESOURCE_PROPERTIES = Object.freeze([
  'adminActions',
  'publicActions',
  'appContextReadActions'
]);

function normalizeFacadeKey(value = '') {
  return String(value || '').trim().replace(/[^A-Za-z0-9_-]/g, '');
}

function buildResourceIndex(propertyName) {
  const index = {};
  for (const domain of domains) {
    for (const [resource, actions] of Object.entries(domain[propertyName] || {})) {
      if (index[resource]) {
        throw new Error(
          `[runtimeManager:FACADE_RESOURCE_DOMAIN_CONFLICT] Resource "${resource}" is declared by multiple ${propertyName} domains.`
        );
      }
      index[resource] = Object.freeze({ domain, actions });
    }
  }
  return Object.freeze(index);
}

function buildResourceDomainIndex() {
  const index = {};
  for (const domain of domains) {
    for (const propertyName of DOMAIN_RESOURCE_PROPERTIES) {
      for (const resource of Object.keys(domain[propertyName] || {})) {
        if (index[resource] && index[resource] !== domain) {
          throw new Error(
            `[runtimeManager:FACADE_RESOURCE_DOMAIN_CONFLICT] Resource "${resource}" is declared by multiple facade domains.`
          );
        }
        index[resource] = domain;
      }
    }
  }
  return Object.freeze(index);
}

const resourceDomainIndex = buildResourceDomainIndex();
const adminResourceIndex = buildResourceIndex('adminActions');
const publicResourceIndex = buildResourceIndex('publicActions');
const appContextReadIndex = buildResourceIndex('appContextReadActions');

function resolveDefinition(index, resource, action) {
  const normalizedResource = normalizeFacadeKey(resource);
  const normalizedAction = normalizeFacadeKey(action);
  const entry = index[normalizedResource] || null;
  return {
    resource: normalizedResource,
    action: normalizedAction,
    definition: entry?.actions?.[normalizedAction] || null,
    domain: entry?.domain || null
  };
}

function adminApiDefinition(resource, action) {
  const resolved = resolveDefinition(adminResourceIndex, resource, action);
  return {
    resource: resolved.resource,
    action: resolved.action,
    definition: resolved.definition
  };
}

function adminApiEventDefinition(eventName) {
  const normalizedEventName = String(eventName || '').trim();
  for (const domain of domains) {
    for (const [resource, actions] of Object.entries(domain.adminActions || {})) {
      for (const [action, definition] of Object.entries(actions)) {
        if (definition?.eventName === normalizedEventName) {
          return { event: normalizedEventName, resource, action, definition };
        }
      }
    }
  }
  return { event: normalizedEventName, resource: '', action: '', definition: null };
}

function publicRuntimeDefinition(resource, action) {
  const resolved = resolveDefinition(publicResourceIndex, resource, action);
  return {
    resource: resolved.resource,
    action: resolved.action,
    definition: resolved.definition
  };
}

function resolveAdminDomain(resource, action) {
  return resolveDefinition(adminResourceIndex, resource, action);
}

function resolvePublicDomain(resource, action) {
  return resolveDefinition(publicResourceIndex, resource, action);
}

function isAppContextReadAction(resource, action) {
  const normalizedResource = normalizeFacadeKey(resource);
  const normalizedAction = normalizeFacadeKey(action);
  return appContextReadIndex[normalizedResource]?.actions?.has(normalizedAction) === true;
}

module.exports = Object.freeze({
  adminApiDefinition,
  adminApiEventDefinition,
  publicRuntimeDefinition,
  resolveAdminDomain,
  resolvePublicDomain,
  isAppContextReadAction,
  _internals: Object.freeze({
    domains,
    resourceDomainIndex,
    adminResourceIndex,
    publicResourceIndex,
    appContextReadIndex,
    normalizeFacadeKey
  })
});
