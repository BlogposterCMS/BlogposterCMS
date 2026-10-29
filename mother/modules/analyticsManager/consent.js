'use strict';

const SETTING_KEY = 'WEBSITE_ANALYTICS_CONFIG';
const COOKIE_NAME = 'bp_consent';
const CATEGORIES = ['analytics', 'recognition', 'marketing', 'personalization'];
const DEFAULT_CONFIG = Object.freeze({ enabled: false, bannerEnabled: true, mode: 'opt-in',
  policyVersion: 1, cookieDays: 180, visitorDays: 30, sessionMinutes: 30,
  analytics: true, recognition: false, marketing: false, personalization: false,
  title: 'Privacy preferences', message: 'Choose which optional services this website may use. You can change your choice at any time.',
  privacyUrl: '', position: 'bottom', googleEnabled: false, measurementId: '' });

// SettingsManager owns persistence. This allowlist is also the public projection:
// no arbitrary script URLs, credentials or executable configuration are accepted.
function normalizeConfig(raw, strict = false) {
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { if (strict) throw new Error('ANALYTICS_CONFIG_INVALID'); raw = {}; }
  }
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const result = { ...DEFAULT_CONFIG };
  for (const key of Object.keys(result)) {
    if (typeof result[key] === 'boolean') result[key] = input[key] === undefined ? result[key] : input[key] === true;
  }
  for (const [key, min, max] of [['policyVersion', 1, 999999], ['cookieDays', 1, 365], ['visitorDays', 1, 365], ['sessionMinutes', 5, 240]]) {
    const value = input[key] === undefined ? result[key] : Number(input[key]);
    if (!Number.isInteger(value) || value < min || value > max) {
      if (strict) throw new Error(`ANALYTICS_CONFIG_INVALID_${key.toUpperCase()}`);
    } else result[key] = value;
  }
  result.mode = input.mode === 'opt-out' ? 'opt-out' : 'opt-in';
  result.position = input.position === 'top' ? 'top' : 'bottom';
  for (const key of ['title', 'message']) if (typeof input[key] === 'string') result[key] = input[key].slice(0, key === 'title' ? 100 : 1000);
  // A site-relative policy link cannot navigate to a caller-controlled scheme/host.
  if (typeof input.privacyUrl === 'string' && /^\/(?!\/)[^\\\s]*$/.test(input.privacyUrl)) result.privacyUrl = input.privacyUrl.slice(0, 300);
  result.measurementId = /^G-[A-Z0-9]{4,20}$/.test(input.measurementId || '') ? input.measurementId : '';
  if (strict && result.googleEnabled && !result.measurementId) throw new Error('ANALYTICS_GOOGLE_ID_INVALID');
  result.googleEnabled = result.googleEnabled && Boolean(result.measurementId);
  return result;
}

function resolveConsent(config, rawCookie, signals = {}, now = Date.now()) {
  let saved;
  try { saved = JSON.parse(decodeURIComponent(String(rawCookie || '').slice(0, 2000))); } catch { /* Invalid preferences never grant consent. */ }
  const valid = saved?.version === config.policyVersion && Number.isFinite(saved.at)
    && saved.at <= now && saved.at > now - config.cookieDays * 86400000;
  const blocked = !config.enabled || !config.bannerEnabled || signals.dnt || signals.gpc || (Boolean(rawCookie) && !valid);
  const result = { explicit: Boolean(valid), necessary: true };
  for (const category of CATEGORIES) {
    // Recognition and external providers always need an explicit choice, even in opt-out mode.
    result[category] = !blocked && config[category] && (valid ? saved[category] === true : category === 'analytics' && config.mode === 'opt-out');
  }
  result.recognition = result.recognition && result.analytics;
  result.google = result.analytics && result.explicit && config.googleEnabled;
  return result;
}

function browserId(value) { return /^[a-f0-9-]{36}$/.test(value || '') ? value : ''; }
module.exports = { SETTING_KEY, COOKIE_NAME, CATEGORIES, DEFAULT_CONFIG, normalizeConfig, resolveConsent, browserId };
