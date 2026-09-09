const { normalizeConfig, resolveConsent } = require('../mother/modules/analyticsManager/consent');
const config = normalizeConfig({ enabled: true, recognition: true, googleEnabled: true, measurementId: 'G-TEST1234' });
const cookie = values => encodeURIComponent(JSON.stringify({ version: 1, at: Date.now(), analytics: true, recognition: true, ...values }));

test('opt-in defaults, disable switches and privacy signals fail closed', () => {
  expect(resolveConsent(config, '')).toMatchObject({ analytics: false, recognition: false, google: false });
  expect(resolveConsent(config, cookie({}))).toMatchObject({ analytics: true, recognition: true, google: true });
  for (const signals of [{ dnt: true }, { gpc: true }]) expect(resolveConsent(config, cookie({}), signals).analytics).toBe(false);
  for (const flag of ['enabled', 'bannerEnabled', 'analytics']) expect(resolveConsent({ ...config, [flag]: false }, cookie({})).analytics).toBe(false);
});
test('opt-out permits anonymous first-party metrics but no inferred identity or external provider consent', () => {
  const policy = { ...config, mode: 'opt-out' };
  expect(resolveConsent(policy, '')).toMatchObject({ analytics: true, recognition: false, google: false });
  for (const saved of [cookie({ analytics: false }), cookie({ version: 2 }), cookie({ at: 0 }), cookie({ at: Date.now() + 100000 }), 'broken']) {
    expect(resolveConsent(policy, saved)).toMatchObject({ analytics: false, recognition: false, google: false });
  }
});
test('configuration only exposes supported values and validates provider and lifetime boundaries', () => {
  expect(() => normalizeConfig({ googleEnabled: true, measurementId: 'https://evil.test' }, true)).toThrow('ANALYTICS_GOOGLE_ID_INVALID');
  expect(() => normalizeConfig({ cookieDays: -1 }, true)).toThrow('ANALYTICS_CONFIG_INVALID_COOKIEDAYS');
  expect(normalizeConfig({ secret: 'password', privacyUrl: '//evil.test', googleEnabled: true })).not.toHaveProperty('secret');
  expect(normalizeConfig({ privacyUrl: '//evil.test' }).privacyUrl).toBe('');
});
