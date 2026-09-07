import { fetchRuntimePageById, fetchRuntimePublicSettings } from './runtimePageData.js';
import { inheritsPageLayout, pageLayoutMode, resolvePagePresentation, SITE_MAIN_DESIGN_SETTING } from '../../shared/layout/pagePresentation.js';
export const inheritsRuntimePresentation = inheritsPageLayout;
/** Same selection contract as the page envelope; the existing facade owns visibility. */
export async function resolveRuntimePresentationCascade(page, emit, lane, maxDepth = 16) {
    try {
        const usesMain = ['main', 'composed', 'inherit'].includes(pageLayoutMode(page));
        const settings = lane === 'public' && usesMain ? await fetchRuntimePublicSettings(emit, lane, [SITE_MAIN_DESIGN_SETTING]) : {};
        const source = await resolvePagePresentation(page, id => fetchRuntimePageById(emit, id, lane), {
            maxDepth, mainDesignId: settings[SITE_MAIN_DESIGN_SETTING]
        });
        return source ? { ...source, page } : null;
    }
    catch (error) {
        console.warn('RUNTIME_PRESENTATION_CASCADE_FAILED', error);
        return null;
    }
}
