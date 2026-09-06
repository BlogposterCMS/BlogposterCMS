import { fetchRuntimePublicSettings } from './runtimePageData.js';

const GLOBAL_BODY_BACKGROUND_KEY = 'DESIGN_STUDIO_GLOBAL_BODY_BACKGROUND';
const PUBLIC_BACKGROUND_FALLBACK = '#f2f3f7';

/** Website design settings must not override the admin's live theme tokens. */
export async function applyRuntimeGlobalBackground(
  lane: string,
  emit: Parameters<typeof fetchRuntimePublicSettings>[0]
): Promise<void> {
  if (lane === 'admin') {
    document.body.style.backgroundColor = 'var(--studio-canvas-subtle)';
    return;
  }
  try {
    const settings = await fetchRuntimePublicSettings(emit, lane, [GLOBAL_BODY_BACKGROUND_KEY]);
    const color = String(settings[GLOBAL_BODY_BACKGROUND_KEY] || '').trim();
    document.body.style.backgroundColor = /^#[0-9a-f]{6}$/i.test(color)
      ? color : PUBLIC_BACKGROUND_FALLBACK;
  } catch (err) {
    console.warn('[Renderer] RUNTIME_GLOBAL_BACKGROUND_LOAD_FAILED', err);
    document.body.style.backgroundColor = PUBLIC_BACKGROUND_FALLBACK;
  }
}
