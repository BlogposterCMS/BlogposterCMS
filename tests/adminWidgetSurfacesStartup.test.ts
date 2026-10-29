/** @jest-environment jsdom */
import { renderAdminSettingsSurface } from '../ui/runtime/main/adminWidgetSurfaces';

test.each(['home', 'pages', 'analytics', 'mysettings', ''])('does not import Settings for %s', async slug => {
  // The absolute browser import cannot resolve in Jest: reaching it fails.
  await expect(renderAdminSettingsSurface(document.createElement('main'), { slug })).resolves.toBe(false);
});
