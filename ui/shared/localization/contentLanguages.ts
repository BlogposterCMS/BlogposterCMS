import { emitRuntimeAdmin } from '../api-client/runtimeFacade.js';
import { CONTENT_LANGUAGES_SETTING, contentLanguageCode, contentLanguageConfig, type ContentLanguageConfig } from './contentLanguageConfig.js';
let lastRead: ContentLanguageConfig | undefined;
export const availableContentLanguages = () => lastRead ? [...lastRead.languages] : [];

/** Public settings use the existing CMS/AppLoader facade; no storage or independent locale registry. */
export async function loadContentLanguages(): Promise<ContentLanguageConfig> {
  if (!window.meltdownEmit) throw new Error('CONTENT_LANGUAGES_RUNTIME_UNAVAILABLE');
  const settings = await emitRuntimeAdmin<Record<string, unknown>>(window.meltdownEmit, window.ADMIN_TOKEN, 'settings', 'public', { keys: [CONTENT_LANGUAGES_SETTING, 'DEFAULT_LANGUAGE'] });
  lastRead = contentLanguageConfig(settings?.[CONTENT_LANGUAGES_SETTING], settings?.DEFAULT_LANGUAGE);
  return lastRead;
}

export async function assertContentLanguage(value: unknown, existing: string[] = []): Promise<string> {
  const language = contentLanguageCode(value);
  const config = await loadContentLanguages();
  // Previously saved locales remain editable even if the site stops offering them for new content.
  if (!config.languages.includes(language) && !existing.includes(language)) throw new Error('CONTENT_LANGUAGE_NOT_ENABLED: Enable this language in General Settings first.');
  return language;
}
