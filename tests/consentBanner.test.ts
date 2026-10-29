/** @jest-environment jsdom */
jest.mock('../ui/shared/analytics/connectors/index.js', () => ({ analyticsConnectors: [{ start: jest.fn(), stop: jest.fn() }] }));
import { mountConsent } from '../ui/shared/analytics/consent';
import { analyticsConnectors } from '../ui/shared/analytics/connectors/index.js';
const { normalizeConfig } = require('../mother/modules/analyticsManager/consent');
const base = normalizeConfig({ enabled: true, recognition: true });
beforeEach(() => {
  document.body.replaceChildren(); jest.clearAllMocks();
  for (const part of document.cookie.split(';')) document.cookie = `${part.split('=')[0]?.trim()}=; Max-Age=0; Path=/`;
});
const click = (label: string) => [...document.querySelectorAll('button')].find(button => button.textContent === label)!.click();
test('does not load providers before choice; rejection persists and survives remount', () => {
  const reload = jest.fn(); mountConsent(base, reload);
  expect(analyticsConnectors[0]!.start).not.toHaveBeenCalled();
  expect(document.querySelector('input:checked')).toBeNull();
  click('Reject optional'); expect(reload).toHaveBeenCalledTimes(1);
  document.body.replaceChildren(); mountConsent(base, reload);
  expect(document.querySelector<HTMLElement>('[role=region]')!.hidden).toBe(true);
  click('Privacy preferences'); expect(document.querySelector<HTMLElement>('[role=region]')!.hidden).toBe(false);
});
test('explicit analytics choice starts providers and withdrawal clears browser identifiers', () => {
  document.cookie = `bp_consent=${encodeURIComponent(JSON.stringify({ version: 1, at: Date.now(), analytics: true, recognition: true }))}; Path=/`;
  document.cookie = 'bp_visitor=11111111-1111-4111-8111-111111111111; Path=/';
  document.cookie = 'bp_session=22222222-2222-4222-8222-222222222222; Path=/';
  const reload = jest.fn(); mountConsent(base, reload);
  expect(analyticsConnectors[0]!.start).toHaveBeenCalled();
  click('Privacy preferences'); click('Reject optional');
  expect(document.cookie).not.toContain('bp_visitor='); expect(document.cookie).not.toContain('bp_session=');
  expect(analyticsConnectors[0]!.stop).toHaveBeenCalled();
});
test('policy changes reopen preferences without starting providers and metadata remains text', () => {
  document.cookie = `bp_consent=${encodeURIComponent(JSON.stringify({ version: 1, at: Date.now(), analytics: true }))}; Path=/`;
  mountConsent({ ...base, policyVersion: 2, title: '<img src=x onerror=bad()>' }, jest.fn());
  expect(analyticsConnectors[0]!.start).not.toHaveBeenCalled();
  expect(document.querySelector('img')).toBeNull();
  expect(document.querySelector<HTMLElement>('[role=region]')!.hidden).toBe(false);
});
