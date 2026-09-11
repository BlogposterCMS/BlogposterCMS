import { createFormField } from '../forms/formField.js';
import { normalizePageLanguage } from './pageEditorData.js';
import { loadContentLanguages } from '../localization/contentLanguages.js';
import { contentLanguageLabel } from '../localization/contentLanguageConfig.js';

export function mountPageLanguageControl(host: HTMLElement, open: (language: string) => Promise<void>, report: (message: string) => void) {
  let activeLanguage = '';
  const row = document.createElement('div'); row.className = 'page-content-actions';
  const input = document.createElement('select'); input.id = 'page-content-language';
  let loading = true, busy = false;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'button secondary sm'; button.textContent = 'Open language';
  row.append(createFormField('Content language', input), button); host.append(row);
  const hint = document.createElement('p'); hint.id = 'page-content-language-hint';
  hint.textContent = 'Available languages come from General Settings. Save or discard changes before switching. Layout, address and tags are shared.';
  input.setAttribute('aria-describedby', hint.id); host.append(hint);
  const activate = async () => {
    try { await open(normalizePageLanguage(input.value)); }
    catch (error) {
      input.value = activeLanguage;
      const detail = error instanceof Error ? error.message : 'Could not open this language.';
      report(detail.startsWith('PAGE_EDITOR_') ? detail : `PAGE_EDITOR_LANGUAGE_FAILED: ${detail}`);
    }
  };
  button.addEventListener('click', () => { void activate(); });
  const refresh = (language: string, nextBusy: boolean) => {
    activeLanguage = language; busy = nextBusy;
    if (language && ![...input.options].some(option => option.value === language)) input.add(new Option(`${contentLanguageLabel(language)} (existing content)`, language));
    input.value = language; input.disabled = button.disabled = busy || loading;
  };
  void loadContentLanguages().then(config => { input.replaceChildren(...config.languages.map(language => new Option(contentLanguageLabel(language), language))); loading = false; refresh(activeLanguage, busy); }).catch(error => report(error.message));
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); void activate(); } });
  return { refresh };
}
