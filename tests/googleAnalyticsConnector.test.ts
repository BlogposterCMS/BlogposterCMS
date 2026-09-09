/** @jest-environment jsdom */
import { googleAnalytics } from '../ui/shared/analytics/connectors/googleAnalytics';
const { normalizeConfig } = require('../mother/modules/analyticsManager/consent');
test('UNTESTED live connector remains inert when disabled and sends only minimized explicit page-view configuration', () => {
  const config = normalizeConfig({ enabled: true, googleEnabled: true, measurementId: 'G-TEST1234' });
  googleAnalytics.start({ ...config, googleEnabled: false }, 'fixture-nonce');
  expect(document.getElementById('bp-google-analytics')).toBeNull();
  history.replaceState({}, '', '/article?token=secret#private');
  googleAnalytics.start(config, 'fixture-nonce');
  const script = document.getElementById('bp-google-analytics') as HTMLScriptElement;
  expect(script.nonce).toBe('fixture-nonce');
  const calls = (window as any).dataLayer.map((args: IArguments) => Array.from(args));
  expect(calls[0]).toEqual(['consent', 'default', expect.objectContaining({ ad_storage: 'denied', analytics_storage: 'denied' })]);
  expect(JSON.stringify(calls)).not.toContain('secret');
  googleAnalytics.stop(config);
  expect((window as any)['ga-disable-G-TEST1234']).toBe(true);
  expect(document.getElementById('bp-google-analytics')).toBeNull();
});
