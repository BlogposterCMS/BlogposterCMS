import { fetchRuntimePageById, fetchRuntimePublicSettings, type RuntimeEmitter } from './runtimePageData.js';
import { inheritsPageLayout, pageLayoutMode, resolvePagePresentation, SITE_MAIN_DESIGN_SETTING, type PresentationPage, type PagePresentation } from '../../shared/layout/pagePresentation.js';

export type RuntimePresentationSource = PagePresentation & { page: PresentationPage };
export const inheritsRuntimePresentation = inheritsPageLayout;

/** Same selection contract as the page envelope; the existing facade owns visibility. */
export async function resolveRuntimePresentationCascade(
  page: PresentationPage, emit: RuntimeEmitter, lane: string, maxDepth = 16
): Promise<RuntimePresentationSource | null> {
  try {
    const usesMain = ['main', 'composed', 'inherit'].includes(pageLayoutMode(page));
    const settings = lane === 'public' && usesMain ? await fetchRuntimePublicSettings(emit, lane, [SITE_MAIN_DESIGN_SETTING]) : {};
    const source = await resolvePagePresentation(page, id => fetchRuntimePageById(emit, id, lane), {
      maxDepth, mainDesignId: settings[SITE_MAIN_DESIGN_SETTING]
    });
    return source ? { ...source, page } : null;
  } catch (error) {
    console.warn('RUNTIME_PRESENTATION_CASCADE_FAILED', error);
    return null;
  }
}
