import enhanceSelects from '../../../../shared/controls/customSelect.js';
import { createFormField } from '../../../../shared/forms/formField.js';
import { bpDialog } from '../../../../shared/dialogs/bpDialog.js';
import { registerWorkspaceChanges } from '../../../../shared/navigation/workspaceChanges.js';
import { render as renderContent, type PageContentController } from './pageContentWidget.js';
import { registerWorkspaceAgent, patchAgentForm, agentString } from '../../../../shared/agent/workspaceAgent.js';
import {
  asString, clearPageEditorCache, errorMessage, savePageEditorPage, loadPageEditorPage,
  type PageEditorFormValues
} from './pageEditorData.js';

interface PageEditorWindow extends Window {
  saveCurrentPage?: () => Promise<void>;
}

export async function render(el: HTMLElement | null): Promise<void> {
  if (!el) return;
  const emit = window.meltdownEmit;
  const jwt = window.ADMIN_TOKEN;
  el.innerHTML = '<p role="status">Loading page…</p>';
  let source;
  try { source = await loadPageEditorPage(emit, jwt, window.location.pathname, window.ADMIN_BASE || 'admin', window.pageDataPromise, window.pageDataLoader); }
  catch (error) {
    el.textContent = `PAGE_EDITOR_LOAD_FAILED: ${errorMessage(error)}`;
    el.setAttribute('role', 'alert');
    return;
  }
  if (!jwt || source?.id == null || typeof emit !== 'function') {
    el.innerHTML = '<p role="alert">PAGE_EDITOR_CONTEXT_MISSING: Open a page from Page Management.</p>';
    return;
  }
  // An attachment is a page draft field, not a second save authority. Keep the
  // loaded record unchanged until the existing Pages update acknowledges it.
  const page = source;
  const draft = { ...page, meta: { ...page.meta } };
  let dirty = false;
  let busy = false;
  let contentBusy = false;
  let contentController: PageContentController | null = null;
  const adminBase = `/${(window.ADMIN_BASE || 'admin').replace(/^\/+|\/+$/g, '')}`;
  const root = document.createElement('form');
  root.className = 'page-editor-workspace';
  root.setAttribute('aria-label', 'Page editor');
  root.innerHTML = `
    <header class="page-editor-header"><div><a class="page-editor-back">← Pages</a><h2></h2><p>Manage page details and attached content in one place.</p></div>
      <div class="page-editor-actions"><button type="button" class="button ghost sm" data-discard>Discard changes</button><button type="submit" class="button primary sm" data-save>Save page</button></div></header>
    <p class="page-editor-feedback" role="status" aria-live="polite"></p>
    <div class="page-editor-body"><section class="page-editor-widget" aria-label="Page details"><h3>Details</h3></section><div class="page-editor-content"></div></div>`;
  root.querySelector<HTMLAnchorElement>('.page-editor-back')!.href = `${adminBase}/content/pages`;
  const heading = root.querySelector('h2')!;
  const details = root.querySelector<HTMLElement>('.page-editor-widget')!;
  const content = root.querySelector<HTMLElement>('.page-editor-content')!;
  const body = root.querySelector<HTMLElement>('.page-editor-body')!;
  const feedback = root.querySelector<HTMLElement>('.page-editor-feedback')!;
  const save = root.querySelector<HTMLButtonElement>('[data-save]')!;
  const discard = root.querySelector<HTMLButtonElement>('[data-discard]')!;
  const fields = new Map<keyof PageEditorFormValues, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>();

  function field(name: keyof PageEditorFormValues, label: string, type = 'text'): void {
    const control = type === 'textarea' ? document.createElement('textarea')
      : type === 'select' ? document.createElement('select') : document.createElement('input');
    control.id = `page-editor-${name}`;
    control.name = name;
    if (control instanceof HTMLInputElement) { control.type = type; control.placeholder = ' '; }
    if (control instanceof HTMLTextAreaElement) { control.rows = 4; control.placeholder = ' '; }
    if (name === 'title' || name === 'slug') control.required = true;
    if (control instanceof HTMLSelectElement) {
      for (const status of ['draft', 'published', 'deleted']) {
        const option = document.createElement('option');
        option.value = status;
        option.textContent = status[0]!.toUpperCase() + status.slice(1);
        control.append(option);
      }
    }
    details.append(createFormField(label, control));
    fields.set(name, control);
  }
  field('title', 'Title');
  field('slug', 'Slug');
  field('status', 'Status', 'select');
  field('seoDesc', 'SEO description', 'textarea');
  field('seoImage', 'SEO image URL');
  field('publishAt', 'Publish at', 'datetime-local');

  function setFeedback(text: string, error = false): void {
    feedback.textContent = text;
    feedback.setAttribute('role', error ? 'alert' : 'status');
  }
  function updateState(): void {
    save.disabled = busy || contentBusy || !dirty;
    discard.disabled = busy || contentBusy || !dirty;
    save.textContent = busy ? 'Saving…' : 'Save page';
    root.setAttribute('aria-busy', String(busy || contentBusy));
    body.inert = busy;
    details.inert = busy || contentBusy;
  }
  function markDirty(): void {
    dirty = true;
    setFeedback('Unsaved changes');
    updateState();
  }
  function values(): PageEditorFormValues {
    return Object.fromEntries(Array.from(fields, ([name, input]) => [name, input.value])) as unknown as PageEditorFormValues;
  }
  function resetFields(): void {
    const saved: PageEditorFormValues = {
      title: page.trans_title || page.title || '', slug: page.slug || '', status: page.status || 'draft',
      seoDesc: page.meta_desc || '', seoImage: page.seo_image || '', publishAt: asString(page.meta?.publish_at)
    };
    fields.forEach((input, name) => { input.value = saved[name]; });
    heading.textContent = page.trans_title || page.title || 'Untitled page';
    enhanceSelects(details);
  }
  async function mountContent(): Promise<void> {
    await renderContent(content, {
      page: draft,
      onChange: markDirty,
      onController: controller => { contentController = controller; },
      onBusy: value => { contentBusy = value; updateState(); }
    });
  }
  async function savePage(propagate = false): Promise<void> {
    if (!root.isConnected || busy || contentBusy || !dirty) return;
    if (!root.reportValidity()) {
      if (propagate) throw new Error('PAGE_EDITOR_FIELDS_INVALID: Correct the required page fields.');
      return;
    }
    busy = true;
    updateState();
    setFeedback('Saving page…');
    try {
      const form = values();
      await savePageEditorPage(emit, jwt, draft, form);
      Object.assign(draft, {
        title: form.title.trim(), trans_title: form.title.trim(), slug: form.slug.trim(), status: form.status,
        meta_desc: form.seoDesc, seo_image: form.seoImage.trim(), meta: { ...draft.meta, publish_at: form.publishAt }
      });
      Object.assign(page, draft, { meta: { ...draft.meta } });
      dirty = false;
      clearPageEditorCache(window.pageDataLoader, page);
      heading.textContent = page.title || 'Untitled page';
      content.dispatchEvent(new Event('page-content-saved'));
      setFeedback('Page saved.');
    } catch (error) {
      setFeedback(`PAGE_EDITOR_SAVE_FAILED: ${errorMessage(error)}`, true);
      if (propagate) throw error;
    } finally { busy = false; updateState(); }
  }
  details.addEventListener('input', markDirty);
  details.addEventListener('change', markDirty);
  root.addEventListener('submit', event => { event.preventDefault(); void savePage(); });
  discard.addEventListener('click', async () => {
    if (busy || contentBusy || !dirty || !(await bpDialog.confirm('Discard your unsaved page changes?', { confirmLabel: 'Discard changes' }))) return;
    Object.assign(draft, page, { meta: { ...page.meta } });
    dirty = false;
    resetFields();
    updateState();
    setFeedback('Changes discarded.');
    await mountContent();
  });
  el.removeAttribute('role');
  el.replaceChildren(root);
  resetFields();
  updateState();
  registerWorkspaceChanges(root, { isDirty: () => dirty, isBusy: () => busy || contentBusy });
  (window as PageEditorWindow).saveCurrentPage = savePage;
  await mountContent();
  registerWorkspaceAgent({ root, id: 'page-editor', title: 'Page editor',
    read: () => ({ dirty, busy: busy || contentBusy, selection: page.id,
      error: feedback.getAttribute('role') === 'alert' ? feedback.textContent : null,
      draft: values(), content: contentController?.read(),
      attachment: { html: draft.html, meta: draft.meta }
    }),
    actions: [
      { action: 'page.setLayout', label: 'Stage page layout', acceptsDraft: true,
        params: [{ name: 'mode', type: 'string', required: true }, { name: 'designId', type: 'string' }],
        run: async p => {
          if (!contentController || !['main', 'composed', 'inherit', 'design', 'none'].includes(String(p.mode))) throw new Error('PAGE_LAYOUT_MODE_INVALID');
          await contentController.setLayout(p.mode as 'main' | 'composed' | 'inherit' | 'design' | 'none', typeof p.designId === 'string' ? p.designId : undefined);
        } },
      { action: 'page.setContent', label: 'Stage page body HTML', acceptsDraft: true,
        params: [{ name: 'html', type: 'string', required: true }],
        run: async p => { if (!contentController || typeof p.html !== 'string') throw new Error('PAGE_CONTENT_HTML_REQUIRED'); await contentController.setHtml(p.html); } },
      { action: 'page.updateDraft', label: 'Update page fields', acceptsDraft: true,
        params: [{ name: 'fields', type: 'object', required: true }],
        run: p => patchAgentForm(root, p.fields, Array.from(fields.keys())) },
      { action: 'page.attachContent', label: 'Stage content attachment', acceptsDraft: true, confirm: true,
        params: [{ name: 'kind', type: 'string', required: true }, { name: 'id', type: 'string', required: true }],
        run: async p => {
          if (!contentController || (p.kind !== 'design' && p.kind !== 'html')) throw new Error('PAGE_CONTENT_KIND_INVALID');
          contentBusy = true; updateState();
          try { await contentController.attach(p.kind, agentString(p, 'id')); }
          finally { contentBusy = false; updateState(); }
        } },
      { action: 'page.detachContent', label: 'Stage content removal', acceptsDraft: true, confirm: true,
        run: async () => { if (!contentController) throw new Error('PAGE_CONTENT_UNAVAILABLE'); await contentController.detach(); } },
      { action: 'page.save', label: 'Save page', acceptsDraft: true, confirm: true, run: () => savePage(true) }
    ]
  });
  document.dispatchEvent(new CustomEvent('content-header-loaded'));
}
