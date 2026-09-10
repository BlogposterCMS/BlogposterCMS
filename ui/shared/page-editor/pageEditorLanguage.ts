import { createFormField } from '../forms/formField.js';
import { normalizePageLanguage } from './pageEditorData.js';

export function mountPageLanguageControl(host: HTMLElement, open: (language: string) => Promise<void>, report: (message: string) => void) {
  let activeLanguage = '';
  const row = document.createElement('div'); row.className = 'page-content-actions';
  const input = document.createElement('input'); input.type = 'text'; input.id = 'page-content-language';
  input.maxLength = 35; input.autocomplete = 'off'; input.placeholder = 'en';
  const button = document.createElement('button'); button.type = 'button'; button.className = 'button secondary sm'; button.textContent = 'Open language';
  row.append(createFormField('Content language', input), button); host.append(row);
  const hint = document.createElement('p'); hint.id = 'page-content-language-hint';
  hint.textContent = 'Language code, for example en or zh-CN. Save or discard changes before switching. Layout, address and tags are shared.';
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
  input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); void activate(); } });
  return { refresh(language: string, busy: boolean) { activeLanguage = input.value = language; input.disabled = button.disabled = busy; } };
}
