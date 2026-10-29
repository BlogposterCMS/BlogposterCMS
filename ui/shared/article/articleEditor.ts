import { Editor, type JSONContent } from '@tiptap/core';
import { bpDialog } from '../dialogs/bpDialog.js';
import { openPopover } from '../overlays/popover.js';
import { registerWorkspaceAgent } from '../agent/workspaceAgent.js';
import { registerWorkspaceChanges } from '../navigation/workspaceChanges.js';
import { articleExtensions, cleanArticleHtml, safeArticleUrl, validateArticleDocument } from './articleSchema.js';
import { readArticlePage, pageContentKind, saveArticle } from './articleData.js';

let opened = false;
export async function openArticleEditor(pageId: string | number, onSaved?: () => void | Promise<void>): Promise<void> {
  if (opened) return;
  opened = true;
  try { await runDialog(pageId, onSaved); } finally { opened = false; }
}

async function runDialog(pageId: string | number, onSaved?: () => void | Promise<void>) {
  let page = await readArticlePage(pageId);
  if (!['empty', 'article'].includes(pageContentKind(page))) throw new Error('ARTICLE_FORMAT_CONFLICT: Open the existing HTML or design editor.');
  const body = document.createElement('div'); body.className = 'article-editor';
  const toolbar = document.createElement('div'); toolbar.className = 'article-editor__toolbar'; toolbar.setAttribute('role', 'toolbar'); toolbar.setAttribute('aria-label', 'Text formatting');
  const canvas = document.createElement('div'); canvas.className = 'article-editor__document';
  const status = document.createElement('p'); status.className = 'article-editor__status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  body.append(toolbar, canvas, status);
  const footer = document.createElement('div'); footer.className = 'article-editor__footer';
  const discard = document.createElement('button'); discard.type = 'button'; discard.className = 'button ghost'; discard.textContent = 'Discard changes'; discard.hidden = true;
  const save = document.createElement('button'); save.type = 'button'; save.className = 'button primary'; save.textContent = 'Save article';
  footer.append(discard, save);
  let dirty = false, busy = false, allowClose = false, saved = false;
  const message = (text: string, error = false) => { status.textContent = text; status.setAttribute('role', error ? 'alert' : 'status'); };
  const update = () => { save.disabled = busy || !dirty; discard.disabled = busy; canvas.inert = toolbar.inert = busy; };
  const editor = new Editor({ element: canvas, extensions: articleExtensions(), content: cleanArticleHtml(page.html || '<p></p>'),
    editorProps: { attributes: { role: 'textbox', 'aria-label': 'Article content', 'aria-multiline': 'true' }, transformPastedHTML: cleanArticleHtml },
    onUpdate: () => { dirty = true; message('Unsaved changes'); update(); }
  });
  let initial = editor.getHTML();
  // UniqueID normalizes older/empty documents once without creating a user draft.
  editor.on('create', () => { initial = editor.getHTML(); dirty = false; message(''); update(); });
  editor.on('update', () => { dirty = editor.getHTML() !== initial; update(); });
  function button(label: string, icon: string, action: () => void) {
    const control = document.createElement('button'); control.type = 'button'; control.className = 'icon-button'; control.title = label; control.setAttribute('aria-label', label);
    control.innerHTML = `<img src="/assets/icons/${icon}.svg" width="18" height="18" alt="">`;
    control.addEventListener('click', () => { if (!busy) action(); }); toolbar.append(control); return control;
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
  const link = button('Edit link', 'link', () => {
    const fields = document.createElement('div'); fields.className = 'article-editor__link';
    const input = document.createElement('input'); input.type = 'url'; input.setAttribute('aria-label', 'Link URL'); input.placeholder = 'https://'; input.value = editor.getAttributes('link').href || '';
    const apply = document.createElement('button'); apply.type = 'button'; apply.className = 'button secondary sm'; apply.textContent = 'Apply';
    fields.append(input, apply);
    activePopover = openPopover(link, { content: fields, ariaLabel: 'Edit link' });
    apply.addEventListener('click', () => {
      if (input.value && !safeArticleUrl(input.value, true)) { message('ARTICLE_LINK_INVALID: Enter a valid link.', true); return; }
      if (input.value) editor.chain().focus().extendMarkRange('link').setLink({ href: input.value }).run();
      else editor.chain().focus().unsetLink().run();
      activePopover?.close();
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
    for (const [label, action] of commands) { const item = document.createElement('button'); item.type = 'button'; item.className = 'bp-popover__item'; item.textContent = label; item.addEventListener('click', () => { action(); activePopover?.close(); }); menu.append(item); }
  });
  button('Undo', 'undo-2', () => { editor.chain().focus().undo().run(); });
  button('Redo', 'redo-2', () => { editor.chain().focus().redo().run(); });
  const close = () => { allowClose = true; body.closest('.bp-dialog')?.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.click(); };
  async function persist() {
    if (busy) throw new Error('ARTICLE_BUSY');
    busy = true; update(); message('Saving…');
    try { validateArticleDocument(editor.getJSON()); page = await saveArticle(page, editor.getHTML()); initial = editor.getHTML(); dirty = false; saved = true; message('Saved'); }
    catch (error) { message(error instanceof Error ? error.message : 'ARTICLE_SAVE_FAILED', true); throw error; }
    finally { busy = false; update(); }
  }
  save.addEventListener('click', () => { void persist().then(close).catch(() => {}); });
  discard.addEventListener('click', close);
  // Enter belongs to the document, not the enclosing global dialog form.
  body.addEventListener('keydown', event => { if (event.key === 'Enter') event.stopPropagation(); if ((event.ctrlKey || event.metaKey) && event.key === 's') { event.preventDefault(); save.click(); } });
  const dialog = bpDialog.open({ title: `Article · ${page.title || 'Untitled'}`, body, kind: 'modal', actions: [{ id: 'cancel', label: 'Close', variant: 'ghost' }], footerContent: footer,
    beforeClose: () => { if (busy) return false; if (dirty && !allowClose) { discard.hidden = false; message('Unsaved changes. Save or choose Discard changes.'); return false; } return true; }
  });
  // bpDialog mounts in its queue; attach the existing agent contract once connected.
  await new Promise<void>(resolve => { const attach = () => { if (body.isConnected) resolve(); else setTimeout(attach, 10); }; attach(); });
  const unregister = registerWorkspaceChanges(body, { isDirty: () => dirty, isBusy: () => busy });
  const blocks = () => { const result: Array<{ id: string; type: string; text: string; node: JSONContent }> = []; editor.state.doc.descendants(node => { if (node.attrs['block-id']) result.push({ id: node.attrs['block-id'], type: node.type.name, text: node.textContent, node: node.toJSON() }); }); return result; };
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
  const agent = registerWorkspaceAgent({ root: body, id: `article-${pageId}`, title: 'Article editor', read: () => ({ dirty, busy, selection: pageId, document: editor.getJSON(), blocks: blocks(), error: status.getAttribute('role') === 'alert' ? status.textContent : null }), actions: [
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
  try { await dialog; } finally { activePopover?.close(); agent.stop(); unregister(); editor.destroy(); }
  if (saved) await onSaved?.();
}
