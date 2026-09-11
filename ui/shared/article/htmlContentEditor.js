import { createContentLanguageControl } from '../localization/languageControl.js';
import { assertContentLanguage, availableContentLanguages } from '../localization/contentLanguages.js';
import { bpDialog } from '../dialogs/bpDialog.js';
import { registerWorkspaceAgent } from '../agent/workspaceAgent.js';
import { registerWorkspaceChanges } from '../navigation/workspaceChanges.js';
import { mountLinkFeedback, htmlSourceLinks } from '../links/linkFeedback.js';
import { articleTitle, readArticlePage, pageContentKind, saveHtmlContent } from './articleData.js';
import { contentEditorHeader } from './contentEditorHeader.js';
import { ensureContentDesign, pageDesignEditorUrl } from './pageEditorMode.js';
import { loadSourceEditor } from '../code/sourceEditorLoader.js';
/** Lossless authoring fallback for existing HTML attachments, using the same modal and Pages save owner. */
export async function openHtmlContentEditor(pageId, onSaved, options = {}) {
    let language = options.language;
    do {
        language = await openSourceDialog(pageId, onSaved, { ...options, language });
    } while (language);
}
async function openSourceDialog(pageId, onSaved, options) {
    let page = await readArticlePage(pageId, options.language);
    if (pageContentKind(page) !== 'html')
        throw new Error('ARTICLE_FORMAT_CONFLICT: Reopen the page content action.');
    const activeLanguage = page.contentLanguage || page.language || 'en';
    const sourceLanguage = page.language || 'en';
    const sourcePage = activeLanguage === sourceLanguage ? page : await readArticlePage(pageId, sourceLanguage);
    const fallback = activeLanguage !== sourceLanguage && !page.trans_lang;
    let nextLanguage;
    const values = { html: (fallback ? sourcePage.html : page.html) || '', css: (fallback ? sourcePage.css : page.css) || '' };
    const editors = {};
    let sourceMode = 'html', wrapping = true, formatting = false, stopped = false;
    const body = document.createElement('div');
    body.className = 'article-editor';
    const source = document.createElement('div');
    source.className = 'article-editor__source';
    const html = document.createElement('textarea');
    html.setAttribute('aria-label', 'Page content HTML');
    html.spellcheck = false;
    html.value = values.html;
    const css = document.createElement('textarea');
    css.setAttribute('aria-label', 'Page content CSS');
    css.spellcheck = false;
    css.value = values.css;
    const panes = { html: document.createElement('div'), css: document.createElement('div') };
    for (const key of ['html', 'css']) {
        panes[key].className = 'article-editor__code-pane';
        panes[key].setAttribute('role', 'group');
        panes[key].setAttribute('aria-label', `${key.toUpperCase()} source`);
    }
    panes.html.append(html);
    panes.css.append(css);
    panes.css.hidden = true;
    const toolbar = document.createElement('div');
    toolbar.className = 'article-editor__source-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Source editor tools');
    const button = (text) => { const item = document.createElement('button'); item.type = 'button'; item.className = 'button ghost sm'; item.textContent = text; toolbar.append(item); return item; };
    const htmlTab = button('HTML'), cssTab = button('CSS'), wrap = button('Wrap lines'), find = button('Find'), format = button('Format');
    format.title = 'Format the current draft (undo with Ctrl/Cmd+Z)';
    htmlTab.addEventListener('click', () => setSourceView('html'));
    cssTab.addEventListener('click', () => setSourceView('css'));
    wrap.addEventListener('click', () => setSourceView(sourceMode, !wrapping));
    find.addEventListener('click', () => editors[sourceMode]?.search());
    format.addEventListener('click', () => { void formatSource().catch(() => { }); });
    source.append(panes.html, panes.css);
    body.append(toolbar, source);
    const status = document.createElement('p');
    status.className = 'article-editor__status';
    status.setAttribute('role', 'status');
    body.append(status);
    const footer = document.createElement('div');
    footer.className = 'article-editor__footer';
    const discard = document.createElement('button');
    discard.type = 'button';
    discard.className = 'button ghost';
    discard.textContent = 'Discard changes';
    discard.hidden = true;
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'button primary';
    save.textContent = 'Save content';
    footer.append(discard, save);
    let dirty = false, busy = false, allowClose = false, saved = false, studioRequested = false, studioUrl = '';
    const message = (text, error = false) => { status.textContent = text; status.setAttribute('role', error ? 'alert' : 'status'); };
    const header = contentEditorHeader(page, update, () => { void openDesign().then(close).catch(error => message(error.message, true)); });
    if (fallback)
        header.title.value = articleTitle(sourcePage);
    const initial = { ...values, title: header.title.value };
    const language = createContentLanguageControl(() => activeLanguage, () => sourceLanguage, async (value) => { await openLanguage(value); if (nextLanguage)
        close(); });
    const actions = document.createElement('div');
    actions.className = 'article-editor__header-actions';
    actions.append(language.button, header.studio);
    async function openLanguage(value) {
        if (dirty || busy || formatting)
            throw new Error('ARTICLE_LANGUAGE_DRAFT: Save or discard changes before switching language.');
        value = await assertContentLanguage(value, [sourceLanguage, activeLanguage]);
        if (value !== activeLanguage) {
            await readArticlePage(pageId, value);
            nextLanguage = value;
        }
    }
    function update() {
        dirty = values.html !== initial.html || values.css !== initial.css || header.title.value !== initial.title;
        for (const key of ['html', 'css']) {
            panes[key].classList.toggle('article-editor__source-language', fallback && values[key] === initial[key]);
            editors[key]?.setReadOnly(busy);
        }
        header.title.classList.toggle('article-editor__source-language', fallback && header.title.value === initial.title);
        language.button.disabled = busy || formatting;
        save.disabled = busy || formatting || !dirty;
        discard.disabled = header.studio.disabled = header.title.disabled = busy || formatting;
        source.inert = busy || formatting;
        htmlTab.disabled = cssTab.disabled = busy || formatting;
        htmlTab.setAttribute('aria-pressed', String(sourceMode === 'html'));
        cssTab.setAttribute('aria-pressed', String(sourceMode === 'css'));
        wrap.setAttribute('aria-pressed', String(wrapping));
        wrap.disabled = find.disabled = format.disabled = busy || formatting || !editors[sourceMode];
    }
    body.addEventListener('input', event => { if (event.target === html)
        values.html = html.value; if (event.target === css)
        values.css = css.value; update(); });
    body.addEventListener('keydown', event => { if (event.key === 'Enter')
        event.stopPropagation(); if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        save.click();
    } });
    const close = () => { allowClose = true; body.closest('.bp-dialog')?.querySelector('[data-action="cancel"]')?.click(); };
    function setSourceView(mode, shouldWrap = wrapping) {
        if (busy || formatting)
            throw new Error('ARTICLE_BUSY');
        sourceMode = mode;
        wrapping = shouldWrap;
        panes.html.hidden = mode !== 'html';
        panes.css.hidden = mode !== 'css';
        for (const editor of Object.values(editors))
            editor.setWrap(wrapping);
        editors[mode]?.focus();
        update();
    }
    async function formatSource() {
        if (busy || formatting)
            throw new Error('ARTICLE_BUSY');
        const editor = editors[sourceMode];
        if (!editor)
            throw new Error('SOURCE_EDITOR_LOAD_FAILED');
        formatting = true;
        update();
        message('Formatting draft…');
        try {
            await editor.format();
            message('Draft formatted. Undo with Ctrl/Cmd+Z.');
        }
        catch (error) {
            message(error instanceof Error ? error.message : 'SOURCE_EDITOR_FORMAT_FAILED', true);
            throw error;
        }
        finally {
            formatting = false;
            update();
        }
    }
    async function persist() {
        if (busy || formatting)
            throw new Error('ARTICLE_BUSY');
        busy = true;
        update();
        try {
            page = await saveHtmlContent(page, values.html, values.css, header.title.value);
            header.title.value = articleTitle(page);
            saved = true;
            initial.html = values.html;
            initial.css = values.css;
            initial.title = header.title.value;
            message('Saved');
        }
        catch (error) {
            message(error instanceof Error ? error.message : 'ARTICLE_SAVE_FAILED', true);
            throw error;
        }
        finally {
            busy = false;
            update();
        }
    }
    async function openDesign() {
        if (busy || formatting)
            throw new Error('ARTICLE_BUSY');
        if (dirty)
            await persist();
        busy = true;
        update();
        try {
            if (options.openDesign)
                await options.openDesign(page);
            else
                studioUrl = pageDesignEditorUrl(pageId, await ensureContentDesign(page), page.contentLanguage, `/${(window.ADMIN_BASE || 'admin').replace(/^\/+|\/+$/g, '')}`);
            studioRequested = true;
            return { url: studioUrl || undefined };
        }
        finally {
            busy = false;
            update();
        }
    }
    save.addEventListener('click', () => { void persist().then(close).catch(() => { }); });
    discard.addEventListener('click', close);
    const dialog = bpDialog.open({ title: `Content · ${articleTitle(page)}`, titleContent: header.title, headerContent: actions, body, footerContent: footer,
        actions: [{ id: 'cancel', label: 'Close', variant: 'ghost' }], beforeClose: () => {
            if (busy || formatting)
                return false;
            if (dirty && !allowClose) {
                discard.hidden = false;
                message('Unsaved changes. Save or choose Discard changes.');
                return false;
            }
            return true;
        } });
    await new Promise(resolve => { const attach = () => body.isConnected ? resolve() : setTimeout(attach, 10); attach(); });
    const links = mountLinkFeedback(body, { collect: () => htmlSourceLinks(html, editors.html?.element || html) });
    const unregister = registerWorkspaceChanges(body, { isDirty: () => dirty, isBusy: () => busy || formatting });
    const agent = registerWorkspaceAgent({ root: body, id: `html-content-${pageId}`, title: 'HTML content editor',
        read: () => ({ dirty, busy: busy || formatting, selection: pageId, title: header.title.value, ...values, sourceEditor: { mode: sourceMode, wrapLines: wrapping, enhanced: Boolean(editors[sourceMode]), canFormat: Boolean(editors[sourceMode]) && !busy && !formatting }, contentLanguage: activeLanguage, sourceLanguage, availableLanguages: availableContentLanguages(), translationStatus: fallback && !dirty ? 'source-fallback' : 'authored', seoTitleOverride: page.seo_title || '', linkFeedback: links.read() }),
        onCommandSettled: (_command, acknowledged) => { if (acknowledged && (studioRequested || nextLanguage))
            close(); }, actions: [
            { action: 'content.openLanguage', label: 'Open content language', params: [{ name: 'language', type: 'string', required: true }], run: params => openLanguage(String(params.language || '')) },
            { action: 'content.edit', label: 'Edit content draft', acceptsDraft: true, params: [{ name: 'title', type: 'string' }, { name: 'html', type: 'string' }, { name: 'css', type: 'string' }], run: params => {
                    if (busy || formatting)
                        throw new Error('ARTICLE_BUSY');
                    for (const key of ['title', 'html', 'css'])
                        if (params[key] !== undefined && typeof params[key] !== 'string')
                            throw new Error('ARTICLE_CONTENT_INVALID');
                    for (const [key, control] of [['title', header.title], ['html', html], ['css', css]]) {
                        if (params[key] !== undefined) {
                            control.value = params[key];
                            if (key !== 'title') {
                                values[key] = params[key];
                                editors[key]?.setValue(values[key]);
                            }
                        }
                    }
                    update();
                    links.schedule();
                } },
            { action: 'content.sourceView', label: 'Show HTML or CSS source', acceptsDraft: true, params: [{ name: 'mode', type: 'string', required: true }], run: params => {
                    if (params.mode !== 'html' && params.mode !== 'css')
                        throw new Error('SOURCE_EDITOR_LANGUAGE_INVALID');
                    setSourceView(params.mode);
                } },
            { action: 'content.formatSource', label: 'Format current source draft', acceptsDraft: true, run: formatSource },
            { action: 'content.save', label: 'Save content and title', acceptsDraft: true, confirm: true, run: persist },
            { action: 'content.openDesign', label: 'Save changes and open in Design Studio', acceptsDraft: true, confirm: true, run: openDesign }
        ] });
    update();
    // Keep the ordinary source fields usable if the local enhancement cannot load.
    void loadSourceEditor().then(runtime => {
        if (stopped)
            return;
        for (const key of ['html', 'css']) {
            const field = key === 'html' ? html : css;
            editors[key] = runtime.createSourceEditor({ parent: panes[key], value: values[key], language: key, label: field.getAttribute('aria-label'), onChange: value => {
                    values[key] = value;
                    field.value = value;
                    // A textarea normalizes CRLF. Preserve the editor's original string for saving.
                    panes[key].dispatchEvent(new Event('input', { bubbles: true }));
                } });
            editors[key].setWrap(wrapping);
            field.hidden = true;
        }
        update();
    }).catch(() => {
        if (stopped)
            return;
        for (const key of ['html', 'css']) {
            editors[key]?.destroy();
            delete editors[key];
        }
        html.hidden = css.hidden = false;
        update();
        message('SOURCE_EDITOR_LOAD_FAILED: Code tools could not load. Plain source editing remains available.', true);
    });
    try {
        await dialog;
    }
    finally {
        stopped = true;
        Object.values(editors).forEach(editor => editor.destroy());
        language.close();
        links.stop();
        agent.stop();
        unregister();
    }
    if (saved)
        await onSaved?.();
    if (studioUrl)
        window.location.assign(studioUrl);
    return nextLanguage;
}
