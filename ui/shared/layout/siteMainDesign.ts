import { emitRuntimeAdmin } from '../api-client/runtimeFacade.js';
import { mainDesignId, SITE_MAIN_DESIGN_SETTING } from './pagePresentation.js';

function emitter(): NonNullable<Window['meltdownEmit']> {
  if (!window.meltdownEmit) throw new Error('PAGE_MAIN_DESIGN_EMITTER_MISSING: Reload the workspace.');
  return window.meltdownEmit;
}

/** Thin Settings adapter. No local persistence or separate site-design authority. */
export async function loadSiteMainDesign(): Promise<string> {
  const settings = await emitRuntimeAdmin<Record<string, unknown>>(emitter(), window.ADMIN_TOKEN, 'settings', 'public', {
    keys: [SITE_MAIN_DESIGN_SETTING]
  });
  return mainDesignId(settings?.[SITE_MAIN_DESIGN_SETTING]);
}

export async function saveSiteMainDesign(id: string): Promise<void> {
  await emitRuntimeAdmin(emitter(), window.ADMIN_TOKEN, 'settings', 'set', {
    key: SITE_MAIN_DESIGN_SETTING, value: mainDesignId(id)
  });
}
