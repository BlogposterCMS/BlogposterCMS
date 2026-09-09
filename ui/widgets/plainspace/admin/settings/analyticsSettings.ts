import { createFormField, createFormChoice } from '../../../../shared/forms/formField.js';
import { fetchSettingValue, saveSettingValue } from './settingsPanelsData.js';
import type { ConsentConfig } from '../../../../shared/analytics/types.js';

// One JSON setting makes consent policy and provider activation an atomic save.
export async function createAnalyticsSettings(emit: Window['meltdownEmit'], jwt: string) {
  const defaults: ConsentConfig = { enabled: false, bannerEnabled: true, mode: 'opt-in', policyVersion: 1,
    cookieDays: 180, visitorDays: 30, sessionMinutes: 30, position: 'bottom', analytics: true,
    recognition: false, marketing: false, personalization: false, title: 'Privacy preferences',
    message: 'Choose which optional services this website may use. You can change your choice at any time.',
    privacyUrl: '', googleEnabled: false, measurementId: '' };
  const raw = await fetchSettingValue(emit, jwt, 'WEBSITE_ANALYTICS_CONFIG');
  let saved = {};
  try { if (raw) saved = JSON.parse(raw); } catch { throw new Error('ANALYTICS_CONFIG_INVALID'); }
  const config = { ...defaults, ...saved };
  const root = document.createElement('div'); root.className = 'settings-section--form';
  const hint = document.createElement('p'); hint.className = 'settings-hint';
  hint.textContent = 'Website collection and cookie preferences. Disabling the banner disables optional collection. Increase the policy version to request a new choice. Opt-out applies only to anonymous first-party analytics; recognition and Google require explicit consent. Marketing/personalization expose preferences for integrations; this does not automatically block scripts inserted elsewhere.';
  root.append(hint);
  const fields: Record<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement> = {};
  for (const [key, label] of Object.entries({ enabled: 'Enable website analytics', bannerEnabled: 'Enable consent banner', analytics: 'Offer analytics category', recognition: 'Offer visitor, session and signed-in account linking', marketing: 'Offer marketing category', personalization: 'Offer personalization category', googleEnabled: 'Enable Google Analytics connector — UNTESTED' })) {
    const input = document.createElement('input'); input.type = 'checkbox'; input.checked = config[key as keyof ConsentConfig] === true;
    fields[key] = input; root.append(createFormChoice(label, input));
  }
  for (const [key, label, choices] of [['mode', 'Consent mode', ['opt-in', 'opt-out']], ['position', 'Banner position', ['bottom', 'top']]] as const) {
    const select = document.createElement('select');
    for (const value of choices) { const option = document.createElement('option'); option.value = value; option.textContent = value; select.append(option); }
    select.value = config[key]; fields[key] = select; root.append(createFormField(label, select));
  }
  for (const [key, label, min, max] of [['policyVersion', 'Policy version', 1, 999999], ['cookieDays', 'Remember consent (days)', 1, 365], ['visitorDays', 'Visitor ID lifetime (days)', 1, 365], ['sessionMinutes', 'Session inactivity timeout (minutes)', 5, 240]] as const) {
    const input = document.createElement('input'); input.type = 'number'; input.min = String(min); input.max = String(max); input.value = String(config[key]);
    fields[key] = input; root.append(createFormField(label, input));
  }
  for (const [key, label] of [['title', 'Banner title'], ['message', 'Banner explanation'], ['privacyUrl', 'Privacy policy path (for example /privacy)'], ['measurementId', 'Google Analytics measurement ID (G-…) — live connection untested']] as const) {
    const input = key === 'message' ? document.createElement('textarea') : document.createElement('input'); input.value = config[key];
    fields[key] = input; root.append(createFormField(label, input));
  }
  return { root, fields, save: async () => {
    const next: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(fields)) {
      if (field instanceof HTMLInputElement && !field.reportValidity()) throw new Error('ANALYTICS_CONFIG_INVALID');
      next[key] = field instanceof HTMLInputElement && field.type === 'checkbox' ? field.checked
        : field instanceof HTMLInputElement && field.type === 'number' ? Number(field.value) : field.value;
    }
    await saveSettingValue(emit, jwt, 'WEBSITE_ANALYTICS_CONFIG', JSON.stringify(next));
  } };
}
