import { createFormField } from '../../../../shared/forms/formField.js';
import { emitRuntimeAdmin } from '../../../../shared/api-client/runtimeFacade.js';
import { CONTENT_LANGUAGES_SETTING, CONTENT_LANGUAGE_CHOICES, contentLanguageConfig, contentLanguageLabel } from '../../../../shared/localization/contentLanguageConfig.js';
export async function createContentLanguageSettings(emit, jwt) {
    const values = await emitRuntimeAdmin(emit, jwt, 'settings', 'public', { keys: [CONTENT_LANGUAGES_SETTING, 'DEFAULT_LANGUAGE'] });
    const config = contentLanguageConfig(values?.[CONTENT_LANGUAGES_SETTING], values?.DEFAULT_LANGUAGE);
    const root = document.createElement('div');
    root.className = 'settings-section--form';
    const primary = document.createElement('select');
    primary.setAttribute('aria-label', 'Main content language');
    const fields = { primaryLanguage: primary };
    const choices = [...new Set([...CONTENT_LANGUAGE_CHOICES, ...config.languages])].sort((a, b) => contentLanguageLabel(a).localeCompare(contentLanguageLabel(b)));
    const available = document.createElement('fieldset');
    available.className = 'content-language-options';
    const legend = document.createElement('legend');
    legend.textContent = 'Available content languages';
    available.append(legend);
    for (const code of choices) {
        primary.add(new Option(contentLanguageLabel(code), code));
        const label = document.createElement('label');
        label.className = 'form-choice';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = config.languages.includes(code);
        fields[code] = checkbox;
        label.append(checkbox, document.createTextNode(contentLanguageLabel(code)));
        available.append(label);
    }
    primary.value = config.primaryLanguage;
    const sync = () => { const selected = fields[primary.value]; selected.checked = true; for (const field of Object.values(fields))
        if (field instanceof HTMLInputElement)
            field.disabled = field === selected; };
    primary.addEventListener('change', sync);
    sync();
    const hint = document.createElement('p');
    hint.className = 'settings-hint';
    hint.textContent = 'Choose once for Article, Page Editor, Design Studio and agents. Existing content keeps its main language and translations. Regional locales describe content, not commerce markets.';
    root.append(hint, createFormField('Main content language', primary), available);
    return { root, fields, save: async () => {
            const next = contentLanguageConfig({ version: 1, primaryLanguage: primary.value, languages: Object.entries(fields).filter(([, field]) => field instanceof HTMLInputElement && field.checked).map(([code]) => code) });
            await emitRuntimeAdmin(emit, jwt, 'settings', 'set', { key: CONTENT_LANGUAGES_SETTING, value: JSON.stringify(next) });
        } };
}
