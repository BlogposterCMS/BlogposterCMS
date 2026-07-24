/**
 * @jest-environment jsdom
 */

import {
  applySitePreset,
  configureSitePresetsClient,
  getSitePresetsSnapshot,
  refreshSitePresets,
  sitePresetsAgentState
} from '../ui/shared/presets/sitePresets';

function preset() {
  return {
    schemaVersion: 1,
    id: 'site-preset-default',
    name: 'Default',
    version: '1.0.0',
    developer: 'Blogposter Team',
    source: 'installed' as const,
    builderSettings: {
      layoutMode: 'free' as const,
      gap: 0,
      padding: 0,
      sceneBackground: '#FFFFFF'
    },
    colorScheme: {
      id: 'color-scheme-default',
      name: 'Default',
      colors: [{ id: 'default-1', name: 'Primary', value: '#00C4CC' }]
    },
    fontPackage: {
      id: 'font-package-default',
      name: 'Default',
      roles: {}
    },
    pageDemos: [{
      id: 'starter',
      name: 'Starter',
      scene: { title: 'Hero', background: '#FFFFFF' },
      elements: [{ presetId: 'text.heading', x: 1, y: 120, w: 7, h: 96 }]
    }]
  };
}

test('Site Preset client lists and applies declarative packages without adding a public runtime dependency', async () => {
  const defaultPreset = preset();
  let lastAppliedId = '';
  const emit = jest.fn(async (_event: string, payload: Record<string, any>) => {
    if (payload.action === 'list') {
      return { version: 1, lastAppliedId, presets: [defaultPreset] };
    }
    if (payload.action === 'apply') {
      lastAppliedId = defaultPreset.id;
      return {
        applied: true,
        preset: defaultPreset,
        builderSettings: defaultPreset.builderSettings,
        pageDemos: defaultPreset.pageDemos
      };
    }
    return null;
  });

  configureSitePresetsClient({
    emit: emit as NonNullable<Window['meltdownEmit']>,
    token: 'admin-token'
  });
  await refreshSitePresets();
  expect(getSitePresetsSnapshot().presets[0].source).toBe('installed');

  const result = await applySitePreset(defaultPreset.id);
  expect(result.pageDemos[0].elements[0].presetId).toBe('text.heading');
  expect(getSitePresetsSnapshot().lastAppliedId).toBe(defaultPreset.id);
  expect(sitePresetsAgentState()).toMatchObject({
    status: 'ready',
    presetCount: 1,
    lastAppliedId: defaultPreset.id
  });
  expect(emit).toHaveBeenCalledWith('cmsAdminApiRequest', expect.objectContaining({
    resource: 'sitePresets',
    action: 'apply',
    params: { id: defaultPreset.id }
  }));
});
