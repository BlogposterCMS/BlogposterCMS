import { createContentLanguageControl } from '../localization/languageControl.js';
import { assertContentLanguage, availableContentLanguages } from '../localization/contentLanguages.js';
import { bpDialog } from '../dialogs/bpDialog.js';
import { registerWorkspaceAgent } from '../agent/workspaceAgent.js';
import { registerWorkspaceChanges } from '../navigation/workspaceChanges.js';
import { mountLinkFeedback, htmlSourceLinks } from '../links/linkFeedback.js';
import { articleTitle, readArticlePage, pageContentKind, saveHtmlContent } from './articleData.js';
import { contentEditorHeader, type ContentEditorOptions } from './contentEditorHeader.js';
import { ensureContentDesign, pageDesignEditorUrl } from './pageEditorMode.js';

/** Lossless authoring fallback for existing HTML attachments, using the same modal and Pages save owner. */
export async function openHtmlContentEditor(pageId: string | number, onSaved?: () => void | Promise<void>, options: ContentEditorOptions = {}) {
  let language = options.language;
  do { language = await openSourceDialog(pageId, onSaved, { ...options, language }); } while (language);
}

async function openSourceDialog(pageId: string | number, onSaved: (() => void | Promise<void>) | undefined, options: ContentEditorOptions) {
  let page = await readArticlePage(pageId, options.language);
  if (pageContentKind(page) !== 'html') throw new Error('ARTICLE_FORMAT_CONFLICT: Reopen the page content action.');
  const activeLanguage = page.contentLanguage || page.language || 'en';
  const sourceLanguage = page.language || 'en';
  const sourcePage = activeLanguage === sourceLanguage ? page : await readArticlePage(pageId, sourceLanguage);
  const fallback = activeLanguage !== sourceLanguage && !page.trans_lang;
  let nextLanguage: string | undefined;
  const body = document.createElement('div'); body.className = 'article-editor';
  const source = document.createElement('div'); source.className = 'article-editor__source';
  const label = document.createElement('p'); label.textContent = 'HTML content · Existing markup and attached media are preserved.';
  const html = document.createElement('textarea'); html.setAttribute('aria-label', 'Page content HTML'); html.spellcheck = false; html.value = fallback ? sourcePage.html || '' : page.html || '';
  const css = document.createElement('textarea'); css.setAttribute('aria-label', 'Page content CSS'); css.spellcheck = false; css.value = fallback ? sourcePage.css || '' : page.css || ''; css.hidden = true;
  const cssToggle = document.createElement('button'); cssToggle.type = 'button'; cssToggle.className = 'button ghost sm'; cssToggle.textContent = 'Edit CSS';
  cssToggle.addEventListener('click', () => { css.hidden = !css.hidden; html.hidden = !css.hidden; cssToggle.textContent = css.hidden ? 'Edit CSS' : 'Edit HTML'; });
  source.append(label, html, css); body.append(cssToggle, source);
  const status = document.createElement('p'); status.className = 'article-editor__status'; status.setAttribute('role', 'status'); body.append(status);
  const footer = document.createElement('div'); footer.className = 'article-editor__footer';
  const discard = document.createElement('button'); discard.type = 'button'; discard.className = 'button ghost'; discard.textContent = 'Discard changes'; discard.hidden = true;
  const save = document.createElement('button'); save.type = 'button'; save.className = 'button primary'; save.textContent = 'Save content'; footer.append(discard, save);
  let dirty = false, busy = false, allowClose = false, saved = false, studioRequested = false, studioUrl = '';
  const message = (text: string, error = false) => { status.textContent = text; status.setAttribute('role', error ? 'alert' : 'status'); };
  const header = contentEditorHeader(page, update, () => { void openDesign().then(close).catch(error => message(error.message, true)); });
  if (fallback) header.title.value = articleTitle(sourcePage);
  const initial = { html: html.value, css: css.value, title: header.title.value };
  const language = createContentLanguageControl(() => activeLanguage, () => sourceLanguage, async value => { await openLanguage(value); if (nextLanguage) close(); });
  const actions = document.createElement('div'); actions.className = 'article-editor__header-actions'; actions.append(language.button, header.studio);
  async function openLanguage(value: string) {
    if (dirty || busy) throw new Error('ARTICLE_LANGUAGE_DRAFT: Save or discard changes before switching language.');
    value = await assertContentLanguage(value, [sourceLanguage, activeLanguage]);
    if (value !== activeLanguage) { await readArticlePage(pageId, value); nextLanguage = value; }
  }
  function update() {
    dirty = html.value !== initial.html || css.value !== initial.css || header.title.value !== initial.title;
    for (const [control, value] of [[html, initial.html], [css, initial.css], [header.title, initial.title]] as const) control.classList.toggle('article-editor__source-language', fallback && control.value === value);
    language.button.disabled = busy;
    save.disabled = busy || !dirty; discard.disabled = header.studio.disabled = header.title.disabled = busy; source.inert = busy;
  }
  body.addEventListener('input', update);
  body.addEventListener('keydown', event => { if (event.key === 'Enter') event.stopPropagation(); if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); save.click(); } });
  const close = () => { allowClose = true; body.closest('.bp-dialog')?.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.click(); };
  async function persist() {
    if (busy) throw new Error('ARTICLE_BUSY');
    busy = true; update();
    try { page = await saveHtmlContent(page, html.value, css.value, header.title.value); header.title.value = articleTitle(page); saved = true; initial.html = html.value; initial.css = css.value; initial.title = header.title.value; message('Saved'); }
    catch (error) { message(error instanceof Error ? error.message : 'ARTICLE_SAVE_FAILED', true); throw error; }
    finally { busy = false; update(); }
  }
  async function openDesign() {
    if (busy) throw new Error('ARTICLE_BUSY');
    if (dirty) await persist();
    busy = true; update();
    try {
      if (options.openDesign) await options.openDesign(page);
      else studioUrl = pageDesignEditorUrl(pageId, await ensureContentDesign(page), page.contentLanguage, `/${(window.ADMIN_BASE || 'admin').replace(/^\/+|\/+$/g, '')}`);
      studioRequested = true; return { url: studioUrl || undefined };
    } finally { busy = false; update(); }
  }
  save.addEventListener('click', () => { void persist().then(close).catch(() => {}); }); discard.addEventListener('click', close);
  const dialog = bpDialog.open({ title: `Content · ${articleTitle(page)}`, titleContent: header.title, headerContent: actions, body, footerContent: footer,
    actions: [{ id: 'cancel', label: 'Close', variant: 'ghost' }], beforeClose: () => {
      if (busy) return false;
      if (dirty && !allowClose) { discard.hidden = false; message('Unsaved changes. Save or choose Discard changes.'); return false; }
      return true;
    } });
  await new Promise<void>(resolve => { const attach = () => body.isConnected ? resolve() : setTimeout(attach, 10); attach(); });
  const links = mountLinkFeedback(body, { collect: () => htmlSourceLinks(html) });
  const unregister = registerWorkspaceChanges(body, { isDirty: () => dirty, isBusy: () => busy });
  const agent = registerWorkspaceAgent({ root: body, id: `html-content-${pageId}`, title: 'HTML content editor',
    read: () => ({ dirty, busy, selection: pageId, title: header.title.value, html: html.value, css: css.value, contentLanguage: activeLanguage, sourceLanguage, availableLanguages: availableContentLanguages(), translationStatus: fallback && !dirty ? 'source-fallback' : 'authored', seoTitleOverride: page.seo_title || '', linkFeedback: links.read() }),
    onCommandSettled: (_command, acknowledged) => { if (acknowledged && (studioRequested || nextLanguage)) close(); }, actions: [
      { action: 'content.openLanguage', label: 'Open content language', params: [{ name: 'language', type: 'string', required: true }], run: params => openLanguage(String(params.language || '')) },
      { action: 'content.edit', label: 'Edit content draft', acceptsDraft: true, params: [{ name: 'title', type: 'string' }, { name: 'html', type: 'string' }, { name: 'css', type: 'string' }], run: params => {
        for (const [key, control] of [['title', header.title], ['html', html], ['css', css]] as const) {
          if (params[key] !== undefined) { if (typeof params[key] !== 'string') throw new Error('ARTICLE_CONTENT_INVALID'); control.value = params[key] as string; }
        }
        update(); links.schedule();
      } },
      { action: 'content.save', label: 'Save content and title', acceptsDraft: true, confirm: true, run: persist },
      { action: 'content.openDesign', label: 'Save changes and open in Design Studio', acceptsDraft: true, confirm: true, run: openDesign }
    ] });
  update();
  try { await dialog; } finally { language.close(); links.stop(); agent.stop(); unregister(); }
  if (saved) await onSaved?.();
  if (studioUrl) window.location.assign(studioUrl);
  return nextLanguage;
}
