'use strict';

const { packageError } = require('../../utils/extensionPackage');
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,59}$/;

// A widget requests named host services, never URLs, credentials or core events.
function normalizeWidgetAccess(info) {
  const raw = info.requestedAccess;
  if (!Array.isArray(raw) || raw.length > 24) throw packageError('WIDGET_MANIFEST_ACCESS', 'widgetInfo.requestedAccess must be an array (up to 24 services).');
  const seen = new Set();
  return raw.map(item => {
    if (!item || typeof item !== 'object' || Object.keys(item).some(key => !['service', 'name', 'reason', 'required'].includes(key))
      || !['operation', 'draft', 'preference'].includes(item.service)
      || !SAFE_NAME.test(item.name || '') || ['__proto__', 'constructor', 'prototype'].includes(item.name)
      || (item.service === 'draft' && item.name !== 'draft')
      || (item.service === 'preference' && !['locale', 'theme'].includes(item.name))
      || typeof item.reason !== 'string' || !item.reason.trim() || item.reason.length > 500
      || (item.required !== undefined && typeof item.required !== 'boolean')) {
      throw packageError('WIDGET_MANIFEST_ACCESS', 'Declare service, name, reason and optional required flag. Core events and destinations are forbidden.');
    }
    const key = `${item.service}:${item.name}`;
    if (seen.has(key)) throw packageError('WIDGET_MANIFEST_ACCESS_DUPLICATE', `Duplicate service ${key}.`);
    seen.add(key);
    return { service: item.service, name: item.name, reason: item.reason.trim(), required: item.required === true };
  });
}

function approveWidgetAccess(requested, approved) {
  if (!Array.isArray(approved)) throw packageError('WIDGET_ACCESS_REVIEW_REQUIRED', 'Select the services to allow.');
  const allowed = new Set(requested.map(item => `${item.service}:${item.name}`));
  if (approved.some(key => typeof key !== 'string' || !allowed.has(key))) throw packageError('WIDGET_ACCESS_UNDECLARED', 'Cannot grant an undeclared service.');
  return [...new Set(approved)];
}

function restrictWidgetPolicy(policy, packageAccess) {
  if (!packageAccess) return policy; // Existing operator-managed integrations retain their policy.
  if (packageAccess.policyVersion !== 1) throw packageError('WIDGET_ACCESS_POLICY_INVALID', 'Unsupported package access policy.');
  const requested = normalizeWidgetAccess({ requestedAccess: packageAccess.requestedAccess });
  const grants = new Set(approveWidgetAccess(requested, packageAccess.approvedAccess));
  return {
    operations: Object.fromEntries(Object.entries(policy.operations || {}).filter(([name]) => grants.has(`operation:${name}`))),
    preferences: Object.fromEntries(Object.entries(policy.preferences || {}).filter(([name]) => grants.has(`preference:${name}`))),
    draft: policy.draft === true && grants.has('draft:draft'),
    managed: true
  };
}

module.exports = { normalizeWidgetAccess, approveWidgetAccess, restrictWidgetPolicy };
