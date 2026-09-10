/** @jest-environment jsdom */
import { render } from '../ui/widgets/plainspace/admin/pageEditorWidgets/pageEditorWidget';
import { bpDialog } from '../ui/shared/dialogs/bpDialog';
import { confirmWorkspaceNavigation } from '../ui/shared/navigation/workspaceChanges';

jest.mock('../ui/shared/dialogs/bpDialog', () => ({ bpDialog: {
  confirm: jest.fn().mockResolvedValue(false), alert: jest.fn().mockResolvedValue(undefined)
} }));
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

describe('fixed Page Editor', () => {
  let host: HTMLElement;
  let page: any;
  let emit: jest.Mock;
  let fail: string;
  const find = <T extends HTMLElement = HTMLButtonElement>(selector: string) => host.querySelector<T>(selector)!;
  const edit = (name: string, value: string) => {
    const input = find<HTMLInputElement>(`[name="${name}"]`);
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const writes = () => emit.mock.calls.filter(([, payload]) => payload.action === 'update');
  const submit = async () => {
    find('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
  };
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.mocked(bpDialog.confirm).mockResolvedValue(false);
    fail = '';
    page = { id: 7, title: 'Docs', slug: 'docs', status: 'draft', language: 'en', html: '', meta: { keep: true } };
    emit = jest.fn(async (_event, payload) => {
      const action = `${payload.resource}.${payload.action}`;
      if (action === fail) throw new Error('offline');
      if (action === 'designer.list') return { designs: [{ id: 'design:one', title: 'Landing' }] };
      if (action === 'media.listLocalFolder') return { files: ['sample.html'] };
      if (action === 'apps.builderList') return { apps: [{ name: 'designer' }] };
      return { ok: true };
    });
    window.ADMIN_TOKEN = 'test';
    window.ADMIN_BASE = '/admin/';
    window.meltdownEmit = emit;
    window.pageDataPromise = Promise.resolve(page);
    window.pageDataLoader = { clear: jest.fn() } as any;
    window.fetch = jest.fn().mockResolvedValue({ ok: true, text: async () => '<p>HTML</p>' });
    host = document.createElement('main');
    document.body.replaceChildren(host);
    await render(host);
    await settle();
  });
  afterEach(() => { document.body.replaceChildren(); });

  it('keeps drafts across tabs and one save footer outside the panels', () => {
    const tabs = [...host.querySelectorAll<HTMLButtonElement>('.page-editor-tabs [role="tab"]')];
    expect(tabs.map(tab => tab.textContent)).toEqual(['Details', 'Layout & content', 'SEO & previews']);
    edit('title', 'Pending title');
    tabs[1]!.click();
    expect(find('.page-editor-tab-actions').hidden).toBe(false);
    expect(find('.page-editor-tab-actions [data-builder="designer"]').classList.contains('primary')).toBe(true);
    expect(find('.page-editor-tab-actions [data-upload]').classList.contains('secondary')).toBe(true);
    tabs[2]!.click();
    expect(find('.page-editor-tab-actions').hidden).toBe(true);
    expect(find<HTMLInputElement>('[name="title"]').value).toBe('Pending title');
    expect(find('.page-editor-footer [data-save]')).toBeTruthy();
    expect(find('.page-content-source').hasAttribute('open')).toBe(false);
    expect(find('.page-content-library').hasAttribute('open')).toBe(false);
    expect(find('.page-editor-seo-text [name="seoTitle"]')).toBeTruthy();
    expect(find('.page-editor-seo-images .page-editor-image-preview')).toBeTruthy();
    expect(host.querySelectorAll('.page-editor-body > [role="tabpanel"]:not([hidden])')).toHaveLength(1);
  });

  it('stages metadata and content in one explicit save without changing the loaded record early', async () => {
    expect(host.querySelectorAll('form')).toHaveLength(1);
    expect(find('[data-save]').disabled).toBe(true);
    expect(window.fetch).not.toHaveBeenCalled();
    edit('title', 'New docs');
    const mode = find<HTMLSelectElement>('select[aria-label="Page layout"]');
    mode.value = 'design';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    const layoutSelect = find<HTMLSelectElement>('[aria-label="Layout design"]');
    layoutSelect.value = 'design:one';
    layoutSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(writes()).toHaveLength(0);
    expect(page).toMatchObject({ title: 'Docs', meta: { keep: true } });
    expect(page.meta.designId).toBeUndefined();
    await submit();
    expect(writes()).toHaveLength(1);
    expect(writes()[0][1].params).toMatchObject({
      title: 'New docs', status: 'draft', meta: { keep: true, designId: 'design:one' },
      translations: [{ title: 'New docs', html: '', metaDesc: '' }]
    });
    expect(page).toMatchObject({ title: 'New docs', meta: { designId: 'design:one' } });
    expect(find('.page-editor-feedback').textContent).toBe('Page saved.');
    expect(find('.page-content-feedback').textContent).toBe('');
    expect(find<HTMLAnchorElement>('[data-builder="designer"]').getAttribute('href')).toBe('/admin/studio/design/design%3Aone');
    expect(await confirmWorkspaceNavigation()).toBe(true);
  });

  it('saves translated SEO title and both images through the page draft, then reloads and discards correctly', async () => {
    edit('seoTitle', 'Sharing title');
    edit('featuredImage', '/media/featured.jpg');
    edit('seoImage', '/media/social.jpg');
    expect(writes()).toHaveLength(0);
    expect(page.meta.featuredImage).toBeUndefined();
    await submit();
    expect(writes()[0][1].params).toMatchObject({
      seo_image: '/media/social.jpg', meta: { keep: true, featuredImage: '/media/featured.jpg' },
      translations: [{ seoTitle: 'Sharing title' }]
    });
    await render(host);
    expect(find<HTMLInputElement>('[name="seoTitle"]').value).toBe('Sharing title');
    expect(find<HTMLInputElement>('[name="featuredImage"]').value).toBe('/media/featured.jpg');
    edit('seoImage', '');
    expect(find<HTMLImageElement>('img[alt="Link preview image preview"]').getAttribute('src')).toBe('/media/featured.jpg');
    jest.mocked(bpDialog.confirm).mockResolvedValue(true);
    find('[data-discard]').click(); await settle();
    expect(find<HTMLInputElement>('[name="seoImage"]').value).toBe('/media/social.jpg');
  });

  it('retains both drafts on a failed save and can retry', async () => {
    edit('seoDesc', 'Draft description');
    find('[aria-label="Attach sample.html"]').click();
    await settle();
    expect(window.fetch).toHaveBeenCalledTimes(1);
    fail = 'pages.update';
    await submit();
    expect(find('.page-editor-feedback').textContent).toContain('PAGE_EDITOR_SAVE_FAILED');
    expect(find<HTMLInputElement>('[name="seoDesc"]').value).toBe('Draft description');
    expect(page.html).toBe('');
    expect(await confirmWorkspaceNavigation()).toBe(false);
    fail = '';
    await submit();
    expect(page.html).toBe('<p>HTML</p>');
    expect(page.meta_desc).toBe('Draft description');
  });

  it('saves tags through the same page draft, survives reload and rejects invalid labels without writing', async () => {
    edit('tags', 'Academy, 入门, academy');
    expect(page.meta.tags).toBeUndefined();
    await submit();
    expect(page.meta.tags).toEqual(['academy', '入门']);
    expect(writes()[0][1].params.meta).toMatchObject({ keep: true, tags: ['academy', '入门'] });
    await render(host);
    expect(find<HTMLInputElement>('[name="tags"]').value).toBe('academy, 入门');
    edit('tags', '<script>'); await submit();
    expect(writes()).toHaveLength(1);
    expect(find('.page-editor-feedback').textContent).toContain('CONTENT_TAGS_INVALID');
    edit('tags', ''); await submit();
    expect(page.meta.tags).toEqual([]);
  });

  it('guards double submits and leaving during a pending save', async () => {
    edit('title', 'Changed');
    let release!: () => void;
    emit.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ ok: true }); }));
    await submit();
    await submit();
    expect(writes()).toHaveLength(1);
    expect(find('[data-save]').disabled).toBe(true);
    expect(await confirmWorkspaceNavigation()).toBe(false);
    expect(bpDialog.alert).toHaveBeenCalled();
    release();
    await settle();
    expect(find('.page-editor-feedback').textContent).toBe('Page saved.');
  });

  it('keeps search separate from the page draft and confirms discarding attachments', async () => {
    const search = find<HTMLInputElement>('input[type=search]');
    search.value = 'missing';
    search.dispatchEvent(new Event('input'));
    expect(host.textContent).toContain('No matching HTML files');
    expect(find('[data-save]').disabled).toBe(true);
    search.value = '';
    search.dispatchEvent(new Event('input'));
    const mode = find<HTMLSelectElement>('select[aria-label="Page layout"]');
    mode.value = 'design';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    const layoutSelect = find<HTMLSelectElement>('[aria-label="Layout design"]');
    layoutSelect.value = 'design:one';
    layoutSelect.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    edit('title', 'Discard me');
    find('[data-discard]').click();
    await settle();
    expect(find<HTMLInputElement>('[name="title"]').value).toBe('Discard me');
    jest.mocked(bpDialog.confirm).mockResolvedValue(true);
    find('[data-discard]').click();
    await settle();
    expect(find<HTMLInputElement>('[name="title"]').value).toBe('Docs');
    expect(find('.selected-content').textContent).toBe('No page content yet');
    expect(writes()).toHaveLength(0);
  });

  it('offers retry for partial library failures while keeping available content usable', async () => {
    fail = 'designer.list';
    await render(host);
    await settle();
    expect(host.textContent).toContain('PAGE_CONTENT_LIBRARY_FAILED');
    expect(find('[aria-label="Attach sample.html"]')).not.toBeNull();
    expect(host.textContent).not.toContain('No other published designs');
    fail = '';
    find('.page-content-library-status button').click();
    await settle();
    expect(find<HTMLSelectElement>('[aria-label="Layout design"]').textContent).toContain('Landing');
  });

  it('warns on reload only while a connected editor has unsaved changes', () => {
    edit('title', 'Dirty');
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    host.replaceChildren();
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
  });
});
