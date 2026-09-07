/**
 * @jest-environment jsdom
 */

import {
  applySitePreset,
  configureSitePresetsClient,
  getSitePresetsSnapshot,
  refreshSitePresets,
  sitePresetsAgentState,
  exportSitePresetJson, importSitePresetJson, parseSitePresetJson,
  sitePresetJsonParts, sitePresetJsonFromParts
} from '../ui/shared/presets/sitePresets';
import { TextEncoder, TextDecoder } from 'util';
Object.assign(globalThis, { TextEncoder, TextDecoder });

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

test('UI kit JSON round-trips through the existing create action without applying shared styles', async () => {
  const original = preset();
  const created = { ...original, id: 'new-kit', name: 'Docs kit', source: 'user' };
  const emit = jest.fn(async (_event: string, payload: Record<string, any>) => payload.action === 'list'
    ? { version: 1, lastAppliedId: original.id, presets: [original] }
    : { preset: created, library: { version: 1, presets: [original, created] } });
  configureSitePresetsClient({ emit: emit as NonNullable<Window['meltdownEmit']>, token: 'admin-token' });
  await refreshSitePresets();
  const portable = JSON.parse(exportSitePresetJson(original.id));
  expect(portable).toMatchObject({ schemaVersion: 1, name: original.name, colorScheme: original.colorScheme });
  expect(portable).not.toHaveProperty('id');
  expect(portable).not.toHaveProperty('source');
  await expect(importSitePresetJson(JSON.stringify({ ...portable, name: 'Docs kit' }))).resolves.toEqual(created);
  expect(emit.mock.calls.map(call => call[1].action)).toEqual(['list', 'create']);
  expect(emit.mock.calls[1][1]).toMatchObject({ resource: 'sitePresets', params: { preset: { name: 'Docs kit' } } });
  expect(getSitePresetsSnapshot().lastAppliedId).toBe(original.id);
});

test('UI kit JSON reports malformed, unsupported and oversized input before transport', async () => {
  expect(() => parseSitePresetJson('{')).toThrow('SITE_PRESETS_JSON_INVALID');
  for (const value of [null, [], { schemaVersion: 2 }]) {
    expect(() => parseSitePresetJson(JSON.stringify(value))).toThrow('SITE_PRESETS_JSON_VERSION');
  }
  expect(() => parseSitePresetJson('ü'.repeat(262145))).toThrow('SITE_PRESETS_JSON_SIZE');
});

test('agent JSON parts survive bounded transport with Unicode and significant whitespace intact', () => {
  const json = JSON.stringify({ schemaVersion: 1, name: 'Docs  中文', text: ' ü\n '.repeat(4000) }, null, 2);
  const parts = sitePresetJsonParts(json);
  expect(parts.length).toBeGreaterThan(1);
  expect(parts.every(part => part.length <= 3000)).toBe(true);
  expect(sitePresetJsonFromParts(parts.map(part => part.trim().slice(0, 4000)))).toBe(json);
  expect(() => sitePresetJsonFromParts(['broken%'])).toThrow('SITE_PRESETS_AGENT_JSON_INVALID');
  expect(() => sitePresetJsonParts('a'.repeat(180001))).toThrow('SITE_PRESETS_AGENT_JSON_SIZE');
});
