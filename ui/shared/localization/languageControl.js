import { openPopover } from '../overlays/popover.js';
import { mountTooltips } from '../overlays/tooltip.js';
import { normalizePageLanguage } from '../page-editor/pageEditorData.js';
import { loadContentLanguages } from './contentLanguages.js';
import { contentLanguageLabel } from './contentLanguageConfig.js';
import enhanceSelects, { destroyCustomSelects } from '../controls/customSelectCore.js';
import { createFormField } from '../forms/formField.js';
/** One locale control for document and Designer chrome; a locale never changes the admin UI language. */
export function createContentLanguageControl(current, source, open, actions = []) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-button content-language-control';
    button.dataset.bpTooltip = 'Content language';
    button.setAttribute('aria-label', 'Content language');
    const tooltip = mountTooltips(button);
    button.innerHTML = '<img src="/assets/icons/languages.svg" width="18" height="18" alt="">';
    const value = document.createElement('span');
    value.textContent = current();
    button.append(value);
    let popover;
    button.addEventListener('click', () => {
        const body = document.createElement('div');
        body.className = 'article-editor__link content-language-picker';
        const input = document.createElement('select');
        input.disabled = true;
        input.setAttribute('aria-label', 'Language / locale');
        const label = createFormField('Language / locale', input);
        const hint = document.createElement('p');
        hint.textContent = `Main language: ${source()}. Unsaved changes must be saved or discarded before switching.`;
        const status = document.createElement('p');
        status.setAttribute('role', 'status');
        const apply = document.createElement('button');
        apply.type = 'button';
        apply.className = 'button secondary sm';
        apply.textContent = 'Open language';
        apply.disabled = true;
        body.append(label, hint, status, apply);
        for (const action of actions) {
            const extra = document.createElement('button');
            extra.type = 'button';
            extra.className = 'button ghost sm';
            extra.textContent = action.label;
            extra.disabled = action.available ? !action.available() : false;
            extra.addEventListener('click', () => { void Promise.resolve().then(action.run).then(() => popover?.close()).catch(error => { status.textContent = error.message; }); });
            body.append(extra);
        }
        popover = openPopover(button, { content: body, ariaLabel: 'Content language', onClose: () => destroyCustomSelects(body) });
        status.textContent = 'Loading available languages…';
        void loadContentLanguages().then(config => {
            if (!body.isConnected)
                return;
            for (const code of [...new Set([source(), current(), ...config.languages])])
                input.add(new Option(`${contentLanguageLabel(code)}${code === source() ? ' (main)' : !config.languages.includes(code) ? ' (existing content)' : ''}`, code));
            input.value = current();
            input.disabled = false;
            status.textContent = '';
            enhanceSelects(body);
            popover?.updatePosition();
        }).catch(error => { status.textContent = error instanceof Error ? error.message : 'CONTENT_LANGUAGES_LOAD_FAILED'; });
        input.addEventListener('change', () => { apply.disabled = input.disabled || input.value === current(); });
        const activate = async () => {
            apply.disabled = true;
            try {
                await open(normalizePageLanguage(input.value));
                popover?.close();
                value.textContent = current();
            }
            catch (error) {
                status.textContent = error instanceof Error ? error.message : 'CONTENT_LANGUAGE_OPEN_FAILED';
            }
            finally {
                apply.disabled = input.disabled || input.value === current();
            }
        };
        apply.addEventListener('click', () => { void activate(); });
        input.addEventListener('keydown', event => { if (event.key === 'Enter') {
            event.preventDefault();
            event.stopPropagation();
            void activate();
        } });
    });
    return { button, refresh: () => { value.textContent = current(); }, close: () => { tooltip.stop(); popover?.close(); } };
}
