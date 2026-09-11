import { Editor, type JSONContent } from '@tiptap/core';
import { bpDialog } from '../dialogs/bpDialog.js';
import { openPopover } from '../overlays/popover.js';
import { registerWorkspaceAgent } from '../agent/workspaceAgent.js';
import { registerWorkspaceChanges } from '../navigation/workspaceChanges.js';
import { articleExtensions, cleanArticleHtml, safeArticleUrl, validateArticleDocument } from './articleSchema.js';
import { articleTitle, readArticlePage, pageContentKind, saveArticle } from './articleData.js';
import { mountLinkFeedback } from '../links/linkFeedback.js';
import { contentEditorHeader, type ContentEditorOptions } from './contentEditorHeader.js';
import { ensureContentDesign, pageDesignEditorUrl } from './pageEditorMode.js';
import { createContentLanguageControl } from '../localization/languageControl.js';
import { normalizePageLanguage } from '../page-editor/pageEditorData.js';
import { createArticleLocale, type ArticleLocaleProgress } from './articleLocale.js';
import { articleLocaleDecorations } from './articleLocaleDecorations.js';
import { articleCommandAvailable, mountArticleToolbarState } from './articleToolbarState.js';
import { assertContentLanguage, availableContentLanguages } from '../localization/contentLanguages.js';

let opened = false;
export async function openArticleEditor(pageId: string | number, onSaved?: () => void | Promise<void>, options: ContentEditorOptions = {}): Promise<void> {
  if (opened) return;
  opened = true;
  try {
    let language = options.language;
    const navigation = { blockId: '' };
    do { language = await runDialog(pageId, onSaved, { ...options, language }, navigation); } while (language);
  } finally { opened = false; }
}

async function runDialog(pageId: string | number, onSaved: (() => void | Promise<void>) | undefined, options: ContentEditorOptions, navigation: { blockId: string }) {
  let page = await readArticlePage(pageId, options.language);
  if (!['empty', 'article'].includes(pageContentKind(page))) throw new Error('ARTICLE_FORMAT_CONFLICT: Open the existing HTML or design editor.');
  const sourceLanguage = page.language || 'en';
  const activeLanguage = page.contentLanguage || sourceLanguage;
  const sourcePage = activeLanguage === sourceLanguage ? page : await readArticlePage(pageId, sourceLanguage);
  const savedProgress = (page.meta?.articleTranslations as Record<string, ArticleLocaleProgress> | undefined)?.[activeLanguage];
  const asDocument = (html: string) => { const temporary = new Editor({ extensions: articleExtensions(), content: cleanArticleHtml(html || '<p></p>') }); const result = temporary.getJSON(); temporary.destroy(); return result; };
  const locale = activeLanguage === sourceLanguage ? undefined : createArticleLocale(asDocument(sourcePage.html || ''), page.trans_lang ? asDocument(page.html || '') : null, savedProgress);
  const body = document.createElement('div'); body.className = 'article-editor';
  const toolbar = document.createElement('div'); toolbar.className = 'article-editor__toolbar'; toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Text formatting');
  const canvas = document.createElement('div'); canvas.className = 'article-editor__document';
  const status = document.createElement('p'); status.className = 'article-editor__status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  body.append(toolbar, canvas, status);
  const footer = document.createElement('div'); footer.className = 'article-editor__footer';
  const discard = document.createElement('button'); discard.type = 'button'; discard.className = 'button ghost'; discard.textContent = 'Discard changes'; discard.hidden = true;
  const save = document.createElement('button'); save.type = 'button'; save.className = 'button primary'; save.textContent = 'Save article';
  footer.append(discard, save);
  let dirty = false, busy = false, allowClose = false, saved = false, studioRequested = false;
  let nextStudioUrl = '', nextLanguage: string | undefined;
  const message = (text: string, error = false) => { status.textContent = text; status.setAttribute('role', error ? 'alert' : 'status'); };
  const header = contentEditorHeader(page, () => syncDirty(), () => { void switchToStudio().then(close).catch(error => message(error.message, true)); });
  const sourceTitle = articleTitle(sourcePage);
  if (locale && (!page.trans_lang || savedProgress?.titleTranslated === false)) header.title.value = sourceTitle;
  let initialTitle = header.title.value;
  let progressChanged = false;
  const languageControls: Array<ReturnType<typeof createContentLanguageControl>> = [];
  const languageControl = createContentLanguageControl(() => activeLanguage, () => sourceLanguage, async language => { await openLanguage(language); if (nextLanguage) close(); });
  let toolbarState: ReturnType<typeof mountArticleToolbarState> | undefined;
  const headerActions = document.createElement('div'); headerActions.className = 'article-editor__header-actions'; headerActions.append(languageControl.button, header.studio);
  const update = () => { save.disabled = busy || !dirty; discard.disabled = header.studio.disabled = header.title.disabled = languageControl.button.disabled = busy; canvas.inert = toolbar.inert = busy;
    toolbarState?.refresh();
    header.title.classList.toggle('article-editor__source-language', Boolean(locale && (!page.trans_lang || savedProgress?.titleTranslated === false) && header.title.value === sourceTitle)); };
  const editor = new Editor({ element: canvas, extensions: [...articleExtensions(), articleLocaleDecorations(node => Boolean(locale?.isFallback(node)), locale ? blockId => {
    const control = document.createElement('button'); control.type = 'button'; control.className = 'article-editor__block-language button ghost sm';
    control.innerHTML = '<img src="/assets/icons/languages.svg" width="16" height="16" alt="">';
    control.append(document.createTextNode('Use source block')); control.title = `Keep this block unchanged in ${activeLanguage}`;
    control.addEventListener('click', () => { if (!busy) markTranslated(blockId); });
    return control;
  } : undefined)], content: locale?.document || cleanArticleHtml(page.html || '<p></p>'),
    editorProps: { attributes: { role: 'textbox', 'aria-label': 'Article content', 'aria-multiline': 'true' }, transformPastedHTML: cleanArticleHtml },
    onUpdate: () => { dirty = true; message('Unsaved changes'); update(); }
  });
  let initial = editor.getHTML();
  // UniqueID normalizes older/empty documents once without creating a user draft.
  function syncDirty() { dirty = progressChanged || editor.getHTML() !== initial || header.title.value !== initialTitle; message(dirty ? 'Unsaved changes' : locale ? `Editing ${activeLanguage}. Gray blocks are untranslated ${sourceLanguage} source content.` : ''); update(); }
  editor.on('create', () => { initial = editor.getHTML(); syncDirty(); });
  editor.on('update', syncDirty);
  function button(label: string, icon: string, action: () => void) {
    const control = document.createElement('button'); control.type = 'button'; control.className = 'icon-button'; control.title = label; control.setAttribute('aria-label', label);
    control.innerHTML = `<img src="/assets/icons/${icon}.svg" width="18" height="18" alt="">`;
    control.addEventListener('click', () => { if (!busy && articleCommandAvailable(editor, label)) action(); }); toolbar.append(control); return control;
  }
  const block = document.createElement('select'); block.setAttribute('aria-label', 'Text style');
  for (const [value, label] of [['p', 'Paragraph'], ['1', 'Heading 1'], ['2', 'Heading 2'], ['3', 'Heading 3']]) block.add(new Option(label, value));
  block.addEventListener('change', () => block.value === 'p' ? editor.chain().focus().setParagraph().run() : editor.chain().focus().toggleHeading({ level: Number(block.value) as 1 | 2 | 3 }).run()); toolbar.append(block);
  const marks: Array<[string, string, string, () => void]> = [
    ['Bold', 'bold', 'bold', () => { editor.chain().focus().toggleBold().run(); }],
    ['Italic', 'italic', 'italic', () => { editor.chain().focus().toggleItalic().run(); }],
    ['Underline', 'underline', 'underline', () => { editor.chain().focus().toggleUnderline().run(); }],
    ['Bullet list', 'list', 'bulletList', () => { editor.chain().focus().toggleBulletList().run(); }],
    ['Numbered list', 'list-ordered', 'orderedList', () => { editor.chain().focus().toggleOrderedList().run(); }],
    ['Quote', 'quote', 'blockquote', () => { editor.chain().focus().toggleBlockquote().run(); }],
    ['Code block', 'code', 'codeBlock', () => { editor.chain().focus().toggleCodeBlock().run(); }]
  ];
  const toggles = marks.map(([label, icon, type, action]) => ({ control: button(label, icon, action), type }));
  editor.on('selectionUpdate', () => {
    toggles.forEach(({ control, type }) => control.setAttribute('aria-pressed', String(editor.isActive(type))));
    block.value = editor.isActive('heading') ? String(editor.getAttributes('heading').level) : 'p';
  });
  let activePopover: ReturnType<typeof openPopover> | undefined;
  let linkInput: HTMLInputElement | undefined;
  let linkFeedback: ReturnType<typeof mountLinkFeedback> | undefined;
  const link = button('Edit link', 'link', () => {
    const fields = document.createElement('div'); fields.className = 'article-editor__link';
    const input = document.createElement('input'); input.type = 'url'; input.setAttribute('aria-label', 'Link URL'); input.placeholder = 'https://'; input.value = editor.getAttributes('link').href || '';
    const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'button secondary sm'; apply.textContent = 'Apply';
    fields.append(input, apply);
    activePopover = openPopover(link, { content: fields, ariaLabel: 'Edit link' });
    linkInput = input;
    linkFeedback?.watchInput(input);
    apply.addEventListener('click', () => {
      if (input.value && !safeArticleUrl(input.value, true)) { message('ARTICLE_LINK_INVALID: Enter a valid link.', true); return; }
      if (input.value) editor.chain().focus().extendMarkRange('link').setLink({ href: input.value }).run();
      else editor.chain().focus().unsetLink().run();
      activePopover?.close();
      linkFeedback?.schedule();
    });
  });
  async function insertMedia(kind: 'image' | 'video') {
    busy = true; update();
    try {
      const picked = await window.meltdownEmit?.('openMediaExplorer', { jwt: window.ADMIN_TOKEN, publicUrlOnly: true, accept: `${kind}/*` }) as { cancelled?: boolean; shareURL?: string } | null;
      if (!picked || picked.cancelled || !picked.shareURL) return;
      if (!safeArticleUrl(picked.shareURL)) throw new Error('ARTICLE_MEDIA_URL_INVALID');
      if (kind === 'image') editor.chain().focus().setImage({ src: picked.shareURL, alt: '' }).run();
      else editor.chain().focus().insertContent({ type: 'video', attrs: { src: picked.shareURL } }).run();
    } catch (error) { message(error instanceof Error ? error.message : 'ARTICLE_MEDIA_FAILED', true); }
    finally { busy = false; update(); }
  }
  button('Insert image', 'image', () => { void insertMedia('image'); });
  button('Insert video', 'video', () => { void insertMedia('video'); });
  const description = button('Media description', 'settings', () => {
    const kind = editor.isActive('image') ? 'image' : editor.isActive('video') ? 'video' : null;
    if (!kind) { message('Select an image or video first.'); return; }
    const fields = document.createElement('div'); fields.className = 'article-editor__link';
    const input = document.createElement('input'); input.setAttribute('aria-label', 'Media description');
    input.value = editor.getAttributes(kind)[kind === 'image' ? 'alt' : 'title'] || '';
    const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'button secondary sm'; apply.textContent = 'Apply';
    fields.append(input, apply);
    activePopover = openPopover(description, { content: fields, ariaLabel: 'Media description' });
    apply.addEventListener('click', () => { editor.chain().focus().updateAttributes(kind, { [kind === 'image' ? 'alt' : 'title']: input.value }).run(); activePopover?.close(); });
  });
  const table = button('Table actions', 'table', () => {
    const menu = document.createElement('div'); menu.className = 'bp-popover__menu';
    const commands: Array<[string, () => void]> = editor.isActive('table') ? [
      ['Add row', () => { editor.chain().focus().addRowAfter().run(); }], ['Add column', () => { editor.chain().focus().addColumnAfter().run(); }],
      ['Delete row', () => { editor.chain().focus().deleteRow().run(); }], ['Delete column', () => { editor.chain().focus().deleteColumn().run(); }],
      ['Delete table', () => { editor.chain().focus().deleteTable().run(); }]
    ] : [['Insert table', () => { editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); }]];
    activePopover = openPopover(table, { content: menu, role: 'menu', ariaLabel: 'Table actions' });
    for (const [label, action] of commands) { const item = document.createElement('button'); item.type = 'button'; item.className = 'bp-popover__item'; item.textContent = label; item.disabled = busy || !articleCommandAvailable(editor, label); item.addEventListener('click', () => { if (busy || !articleCommandAvailable(editor, label)) return; action(); activePopover?.close(); }); menu.append(item); }
  });
  button('Undo', 'undo-2', () => { editor.chain().focus().undo().run(); });
  button('Redo', 'redo-2', () => { editor.chain().focus().redo().run(); });
  toolbarState = mountArticleToolbarState(editor, toolbar, () => busy);
  const close = () => { allowClose = true; body.closest('.bp-dialog')?.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.click(); };
  async function persist() {
    if (busy) throw new Error('ARTICLE_BUSY');
    busy = true; update(); message('Saving…');
    try { validateArticleDocument(editor.getJSON()); page = await saveArticle(page, editor.getHTML(), header.title.value,
      locale?.progress(editor.getJSON(), sourceLanguage, Boolean(savedProgress?.titleTranslated || header.title.value !== sourceTitle)));
      header.title.value = articleTitle(page); initialTitle = header.title.value; initial = editor.getHTML(); dirty = false; saved = true; message('Saved'); }
    catch (error) { message(error instanceof Error ? error.message : 'ARTICLE_SAVE_FAILED', true); throw error; }
    finally { busy = false; update(); }
  }
  async function openLanguage(value: string) {
    const language = normalizePageLanguage(value);
    if (language === activeLanguage) return;
    if (dirty || busy) throw new Error('ARTICLE_LANGUAGE_DRAFT: Save or discard changes before switching language.');
    await assertContentLanguage(language, [sourceLanguage, activeLanguage, ...Object.keys(page.meta?.articleTranslations || {})]);
    // A failed read leaves the current editor intact. No primary text is copied into storage here.
    await readArticlePage(pageId, language);
    nextLanguage = language;
  }
  async function switchToStudio() {
    if (busy) throw new Error('ARTICLE_BUSY');
    if (dirty) await persist();
    busy = true; update();
    try {
      if (options.openDesign) await options.openDesign(page);
      else nextStudioUrl = pageDesignEditorUrl(pageId, await ensureContentDesign(page), page.contentLanguage, `/${(window.ADMIN_BASE || 'admin').replace(/^\/+|\/+$/g, '')}`);
      studioRequested = true;
      return { url: nextStudioUrl || undefined };
    } finally { busy = false; update(); }
  }
  save.addEventListener('click', () => { void persist().then(close).catch(() => {}); });
  discard.addEventListener('click', close);
  // Enter belongs to the document, not the enclosing global dialog form.
  body.addEventListener('keydown', event => { if (event.key === 'Enter') event.stopPropagation(); if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); save.click(); } });
  const dialog = bpDialog.open({ title: `Article · ${articleTitle(page) || 'Untitled'}`, titleContent: header.title, headerContent: headerActions, body, kind: 'modal', actions: [{ id: 'cancel', label: 'Close', variant: 'ghost' }], footerContent: footer,
    beforeClose: () => { if (busy) return false; if (dirty && !allowClose) { discard.hidden = false; message('Unsaved changes. Save or choose Discard changes.'); return false; } return true; }
  });
  // bpDialog mounts in its queue; attach the existing agent contract once connected.
  await new Promise<void>(resolve => { const attach = () => { if (body.isConnected) resolve(); else setTimeout(attach, 10); }; attach(); });
  linkFeedback = mountLinkFeedback(body, { collect: () => [
    ...(linkInput?.isConnected ? [{ id: 'link-entry', href: linkInput.value, anchor: linkInput }] : []),
    ...Array.from(canvas.querySelectorAll<HTMLAnchorElement>('a[href]')).map((anchor, index) => ({
      id: `${anchor.closest('[block-id]')?.getAttribute('block-id') || 'article'}:link-${index}`,
      href: anchor.getAttribute('href') || '', anchor
    }))
  ] });
  editor.on('update', () => linkFeedback?.schedule());
  const unregister = registerWorkspaceChanges(body, { isDirty: () => dirty, isBusy: () => busy });
  const blocks = () => { const result: Array<{ id: string; type: string; text: string; node: JSONContent; translationStatus: string }> = []; editor.state.doc.descendants(node => { if (node.attrs['block-id']) result.push({ id: node.attrs['block-id'], type: node.type.name, text: node.textContent, node: node.toJSON(), translationStatus: locale?.isFallback(node.toJSON()) ? 'source-fallback' : 'authored' }); }); return result; };
  function markTranslated(id: string) {
    blockRange(id); if (!locale) return; locale.markTranslated(id); progressChanged = true;
    editor.view.dispatch(editor.state.tr); syncDirty();
  }
  function blockRange(id: unknown) {
    let range: { from: number; to: number } | undefined;
    editor.state.doc.descendants((node, pos) => { if (!range && node.attrs['block-id'] === id) { range = { from: pos, to: pos + node.nodeSize }; return false; } });
    if (!range) throw new Error('ARTICLE_BLOCK_NOT_FOUND');
    return range;
  }
  function validateBlock(node: JSONContent) {
    validateArticleDocument({ type: 'doc', content: [node] });
    // Validate schema shape as well as URLs before accepting an agent transaction.
    try { const parsed = editor.schema.nodeFromJSON(node); parsed.check(); if (!parsed.isBlock) throw new Error(); }
    catch { throw new Error('ARTICLE_BLOCK_INVALID'); }
  }
  const agent = registerWorkspaceAgent({ root: body, id: `article-${pageId}`, title: 'Article editor', read: () => ({ dirty, busy, selection: pageId, title: header.title.value, contentLanguage: activeLanguage, sourceLanguage, availableLanguages: availableContentLanguages(), toolbar: toolbarState?.read(), translationExists: Boolean(page.trans_lang), seoTitleOverride: page.seo_title || '', document: editor.getJSON(), blocks: blocks(), linkFeedback: linkFeedback?.read(), error: status.getAttribute('role') === 'alert' ? status.textContent : null }),
    onCommandSettled: (_command, acknowledged) => { if (acknowledged && (studioRequested || nextLanguage)) close(); }, actions: [
    { action: 'article.openLanguage', label: 'Open content language', params: [{ name: 'language', type: 'string', required: true }], run: params => openLanguage(String(params.language || '')) },
    { action: 'article.useSourceBlock', label: 'Use source block in this language', acceptsDraft: true, params: [{ name: 'id', type: 'string', required: true }], run: params => markTranslated(String(params.id || '')) },
    { action: 'article.setTitle', label: 'Edit page title', acceptsDraft: true, params: [{ name: 'title', type: 'string', required: true }], run: params => {
      if (typeof params.title !== 'string' || !params.title.trim() || params.title.length > 240) throw new Error('ARTICLE_TITLE_INVALID');
      header.title.value = params.title; syncDirty();
    } },
    { action: 'article.openDesign', label: 'Save changes and open in Design Studio', acceptsDraft: true, confirm: true, run: switchToStudio },
    { action: 'article.replaceBlock', label: 'Replace article block', acceptsDraft: true, params: [{ name: 'id', type: 'string', required: true }, { name: 'node', type: 'object', required: true }], run: params => {
      validateBlock(params.node as JSONContent);
      const replacement = { ...(params.node as JSONContent), attrs: { ...(params.node as JSONContent).attrs, 'block-id': params.id } };
      if (!editor.commands.insertContentAt(blockRange(params.id), replacement)) throw new Error('ARTICLE_BLOCK_INVALID');
    } },
    { action: 'article.appendBlock', label: 'Append article block', acceptsDraft: true, params: [{ name: 'node', type: 'object', required: true }], run: params => { validateBlock(params.node as JSONContent); if (!editor.commands.insertContentAt(editor.state.doc.content.size, params.node as JSONContent)) throw new Error('ARTICLE_BLOCK_INVALID'); } },
    { action: 'article.deleteBlock', label: 'Delete article block', acceptsDraft: true, params: [{ name: 'id', type: 'string', required: true }], run: params => { editor.commands.deleteRange(blockRange(params.id)); } },
    { action: 'article.save', label: 'Save article', acceptsDraft: true, confirm: true, run: persist }
  ] });
  update(); editor.commands.focus();
  if (navigation.blockId) { try { editor.commands.setTextSelection(blockRange(navigation.blockId).from + 1); } catch { /* A removed source block has no selection in the target. */ } }
  try { await dialog; } finally { activePopover?.close(); languageControl.close(); languageControls.forEach(control => control.close()); linkFeedback?.stop(); agent.stop(); unregister(); editor.destroy(); }
  if (saved) await onSaved?.();
  if (nextStudioUrl) window.location.assign(nextStudioUrl);
  return nextLanguage;
}
