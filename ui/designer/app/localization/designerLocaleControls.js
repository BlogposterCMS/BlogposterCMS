import { createContentLanguageControl } from '../../../shared/localization/languageControl.js';
import { designerLocaleState, finishDesignerLanguageSwitch, requestDesignerLanguage, resetDesignerLocale } from './designerLocale.js';
import { bpDialog } from '../../../shared/dialogs/bpDialog.js';
/** Reuse the same language icon in the header and selected widget toolbar. UI markings never enter the saved document. */
export function mountDesignerLocaleControls(header) {
    const make = () => createContentLanguageControl(() => designerLocaleState().language, () => designerLocaleState().sourceLanguage, async (language) => { await requestDesignerLanguage(language); finishDesignerLanguageSwitch(); }, [{ label: 'Use inherited design for this language', available: () => designerLocaleState().inherited && designerLocaleState().hasOverride, run: async () => {
                if (await bpDialog.confirm('Reset the saved layout and content overrides for this language? The main design and other languages stay unchanged.', { title: 'Use inherited design?' })) {
                    await resetDesignerLocale();
                    finishDesignerLanguageSwitch();
                }
            } }]);
    const global = make();
    global.button.classList.add('button', 'header-icon-btn');
    (header.querySelector('.header-actions') || header).append(global.button);
    const selected = make();
    selected.button.classList.add('designer-locale-selection');
    selected.button.setAttribute('aria-label', 'Content language for selected widget');
    const update = () => {
        const state = designerLocaleState();
        const widget = document.querySelector('.canvas-item.selected, .canvas-item.is-selected, .canvas-item[aria-selected="true"]');
        const toolbar = document.querySelector('.widget-action-bar');
        if (toolbar && selected.button.parentElement !== toolbar)
            toolbar.append(selected.button);
        selected.button.hidden = !widget;
        // A stylesheet attribute only decorates the canvas; widget content and attachments are unchanged.
        for (const item of document.querySelectorAll('.canvas-item')) {
            const id = item.dataset.instanceId || item.id;
            const fallback = state.widgets.find(value => value.id === id)?.translationStatus === 'source-fallback';
            item.classList.toggle('designer-locale-source', Boolean(fallback && state.inherited && !item.contains(document.activeElement)));
        }
    };
    document.addEventListener('click', update);
    document.addEventListener('focusin', update);
    document.addEventListener('designerContentChanged', update);
    document.addEventListener('designerSelectionChanged', update);
    window.addEventListener('resize', update);
    document.addEventListener('scroll', update, true);
    update();
}
