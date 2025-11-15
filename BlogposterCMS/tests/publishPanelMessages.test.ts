/** @jest-environment jsdom */

const mockPageService = {
  create: jest.fn(async () => ({ pageId: 'page-1' })),
  update: jest.fn(async () => undefined)
};

const mockSanitizeSlug = jest.fn((slug: string) => slug);

jest.mock('../apps/designer/fetchPartial.js', () => ({
  fetchPartial: jest.fn(() =>
    Promise.resolve(`
<button class="publish-close" type="button" aria-label="Close">&times;</button>
<h2 class="publish-title">Publish this design</h2>
<label class="publish-slug-label">Slug
  <div class="publish-slug-wrap">
    <span class="slug-prefix" aria-hidden="true">/</span>
    <input type="text" class="publish-slug-input" />
  </div>
  <div class="publish-url hidden"></div>
</label>
<div class="publish-suggestions builder-options-menu"></div>
<div class="publish-warning hidden"></div>
<label class="publish-draft hidden"><input type="checkbox" class="publish-draft-checkbox" /> Set page to draft</label>
<div class="publish-info hidden"></div>
<div class="publish-actions">
  <button class="publish-settings" type="button">Settings</button>
  <button class="publish-confirm">Publish</button>
</div>
<div class="publish-draft-note hidden"></div>
`)
  )
}));

jest.mock('../public/plainspace/sanitizer.js', () => ({
  sanitizeHtml: jest.fn((html: string) => html)
}));

jest.mock('../apps/designer/utils.js', () => ({
  wrapCss: jest.fn((data: string) => data)
}));

jest.mock(
  '/plainspace/widgets/admin/defaultwidgets/pageList/pageService.js',
  () => ({
    pageService: mockPageService,
    sanitizeSlug: mockSanitizeSlug
  }),
  { virtual: true }
);

import { fetchPartial } from '../apps/designer/fetchPartial.js';
import { initPublishPanel } from '../apps/designer/renderer/publishPanel';

function createBasicContext(options: { meltdown?: jest.Mock } = {}) {
  document.body.innerHTML = '<aside id="publishPanel"></aside>';
  const publishBtn = document.createElement('button');
  publishBtn.id = 'publish-toggle';
  document.body.appendChild(publishBtn);
  const nameInput = document.createElement('input');
  nameInput.value = 'Example design';
  document.body.appendChild(nameInput);
  const gridEl = document.createElement('div');
  const layoutRoot = document.createElement('div');

  (window as any).meltdownEmit = options.meltdown ?? jest.fn(() => Promise.resolve([]));
  (window as any).ADMIN_TOKEN = 'token';

  initPublishPanel({
    publishBtn,
    nameInput,
    gridEl,
    layoutRoot,
    updateAllWidgetContents: jest.fn(),
    getAdminUserId: jest.fn(() => 'user-1'),
    getCurrentLayoutForLayer: jest.fn(),
    getActiveLayer: jest.fn(),
    ensureCodeMap: jest.fn(),
    capturePreview: jest.fn(),
    pageId: null,
    saveDesign: jest.fn(() => Promise.resolve())
  });

  return { publishBtn };
}

function flushPromises() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('publish panel messaging', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.clearAllMocks();
    mockPageService.create.mockClear();
    mockPageService.update.mockClear();
    mockSanitizeSlug.mockClear();
  });

  afterEach(() => {
    warnSpy?.mockRestore();
  });

  test('shows warning and refocuses slug when confirming without slug', async () => {
    const { publishBtn } = createBasicContext();
    await flushPromises();
    await flushPromises();
    const panel = document.getElementById('publishPanel')!;
    const slugInput = panel.querySelector<HTMLInputElement>('.publish-slug-input')!;
    const confirmBtn = panel.querySelector<HTMLButtonElement>('.publish-confirm')!;
    const warningEl = panel.querySelector<HTMLDivElement>('.publish-warning')!;

    publishBtn.click();
    confirmBtn.click();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await flushPromises();

    expect(fetchPartial).toHaveBeenCalled();
    expect(warningEl.classList.contains('hidden')).toBe(false);
    expect(warningEl.textContent).toBe('Select a slug.');
    expect(document.activeElement).toBe(slugInput);
  });

  test('renders info message for a new slug suggestion', async () => {
    createBasicContext();
    await flushPromises();
    const panel = document.getElementById('publishPanel')!;
    const slugInput = panel.querySelector<HTMLInputElement>('.publish-slug-input')!;
    const infoEl = panel.querySelector<HTMLDivElement>('.publish-info')!;

    slugInput.value = 'new-page';
    slugInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();

    expect(infoEl.classList.contains('hidden')).toBe(false);
    expect(infoEl.textContent).toBe('Page will be created when published.');
  });

  test('shows warning when existing slug data cannot be loaded', async () => {
    createBasicContext();
    (window as any).meltdownEmit = jest
      .fn()
      .mockImplementationOnce(() =>
        Promise.resolve([{ lane: 'public', id: 5, slug: 'existing' }])
      )
      .mockImplementationOnce(() => Promise.resolve(null));

    await flushPromises();
    const panel = document.getElementById('publishPanel')!;
    const slugInput = panel.querySelector<HTMLInputElement>('.publish-slug-input')!;
    const warningEl = panel.querySelector<HTMLDivElement>('.publish-warning')!;

    slugInput.value = 'existing';
    slugInput.dispatchEvent(new Event('input', { bubbles: true }));
    await flushPromises();
    await flushPromises();

    expect(warningEl.classList.contains('hidden')).toBe(false);
    expect(warningEl.textContent).toBe('Failed to load page data. Please try again.');
    expect(document.activeElement).toBe(slugInput);
  });

  test('sets aria-hidden attribute when toggling publish panel visibility', async () => {
    const { publishBtn } = createBasicContext();
    await flushPromises();
    await flushPromises();
    const panel = document.getElementById('publishPanel')!;

    expect(panel.getAttribute('aria-hidden')).toBe('true');

    publishBtn.click();
    await flushPromises();
    expect(panel.classList.contains('hidden')).toBe(false);
    expect(panel.getAttribute('aria-hidden')).toBe('false');

    publishBtn.click();
    await flushPromises();
    expect(panel.classList.contains('hidden')).toBe(true);
    expect(panel.getAttribute('aria-hidden')).toBe('true');
  });

  test('skips uploading empty bundles and stores filtered metadata', async () => {
    const uploadSpy = jest.fn();
    const saveMetaSpy = jest.fn();
    const makePublicSpy = jest.fn();

    const meltdownMock = jest.fn((action: string, payload: any) => {
      switch (action) {
        case 'searchPages':
          return Promise.resolve([]);
        case 'getPublishedDesignMeta':
          return Promise.resolve(null);
        case 'deleteLocalItem':
          return Promise.resolve(null);
        case 'uploadFileToFolder':
          uploadSpy(payload);
          return Promise.resolve(null);
        case 'makeFilePublic':
          makePublicSpy(payload);
          return Promise.resolve(null);
        case 'savePublishedDesignMeta':
          saveMetaSpy(payload);
          return Promise.resolve(null);
        default:
          return Promise.resolve(null);
      }
    });

    const { publishBtn } = createBasicContext({ meltdown: meltdownMock });
    await flushPromises();
    await flushPromises();

    const panel = document.getElementById('publishPanel')!;
    const slugInput = panel.querySelector<HTMLInputElement>('.publish-slug-input')!;
    const confirmBtn = panel.querySelector<HTMLButtonElement>('.publish-confirm')!;

    slugInput.value = 'fresh-page';

    publishBtn.click();
    confirmBtn.click();

    await flushPromises();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await flushPromises();
    await flushPromises();

    expect(mockPageService.create).toHaveBeenCalled();
    expect(uploadSpy).toHaveBeenCalledTimes(1);
    expect(uploadSpy).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'index.html' })
    );
    expect(saveMetaSpy).toHaveBeenCalledWith(
      expect.objectContaining({ files: ['index.html'] })
    );
    expect(makePublicSpy).toHaveBeenCalled();
  });
});
