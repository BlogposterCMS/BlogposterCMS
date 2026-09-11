/** @jest-environment jsdom */
import { openHtmlContentEditor } from '../ui/shared/article/htmlContentEditor';
import { bpDialog } from '../ui/shared/dialogs/bpDialog';
import { registerWorkspaceAgent } from '../ui/shared/agent/workspaceAgent';
import { loadSourceEditor } from '../ui/shared/code/sourceEditorLoader';
jest.mock('../ui/shared/code/sourceEditorLoader', () => ({ loadSourceEditor: jest.fn() }));
jest.mock('../ui/shared/agent/workspaceAgent', () => ({ registerWorkspaceAgent: jest.fn(() => ({ stop: jest.fn() })) }));
jest.mock('../ui/shared/dialogs/bpDialog', () => ({ bpDialog: { open: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  (loadSourceEditor as jest.Mock).mockResolvedValue({ createSourceEditor: ({ parent, value, onChange }: any) => {
    let current = value;
    const element = document.createElement('div'); parent.append(element);
    return { element, getValue: () => current, setValue: (next: string) => { current = next; onChange(next); }, focus: jest.fn(), search: jest.fn(), setReadOnly: jest.fn(), setWrap: jest.fn(), destroy: jest.fn(), format: async () => { current += '\n'; onChange(current); } };
  } });
});

test('the HTML modal preserves custom markup and attachments while saving the title through Pages', async () => {
  let options: any, finish!: (value: unknown) => void;
  (bpDialog.open as jest.Mock).mockImplementation(value => { options = value; document.body.append(value.body); return new Promise(resolve => { finish = resolve; }); });
  const page = { id: 88, title: 'Custom content', language: 'en', html: '<section data-custom="keep"><video src="/media/keep.mp4"></video></section>', css: '.custom{display:grid}', meta: { htmlFileName: 'original.html', attachments: ['existing'] } };
  window.meltdownEmit = jest.fn().mockResolvedValue(page);
  const dialog = openHtmlContentEditor(88);
  await new Promise(resolve => setTimeout(resolve, 30));
  const surface = (registerWorkspaceAgent as jest.Mock).mock.calls[0][0];
  expect(surface.read().dirty).toBe(false);
  surface.actions.find((item: any) => item.action === 'content.edit').run({ title: 'Updated content' });
  expect(options.beforeClose()).toBe(false);
  await surface.actions.find((item: any) => item.action === 'content.save').run();
  const update = (window.meltdownEmit as jest.Mock).mock.calls.find(([, payload]) => payload.action === 'update')![1].params;
  expect(update.translations[0]).toMatchObject({ title: 'Updated content', html: page.html, css: page.css });
  expect(update.meta).toMatchObject(page.meta);
  expect(options.beforeClose()).toBe(true);
  finish({ action: 'cancel' }); await dialog;
  document.body.replaceChildren();
});

test('view changes leave the source untouched and agent formatting edits only the chosen draft', async () => {
  let options: any, finish!: (value: unknown) => void;
  (bpDialog.open as jest.Mock).mockImplementation(value => { options = value; document.body.append(value.body); return new Promise(resolve => { finish = resolve; }); });
  const page = { id: 89, title: 'Raw source', language: 'en', html: '<section>\r\n  Keep <b>this</b> text.\r\n</section>', css: 'p{color:red}', meta: { htmlFileName: 'keep.html', attachments: ['existing'] } };
  window.meltdownEmit = jest.fn().mockResolvedValue(page);
  const pending = openHtmlContentEditor(89);
  await new Promise(resolve => setTimeout(resolve, 30));
  const surface = (registerWorkspaceAgent as jest.Mock).mock.calls[0][0];
  expect(surface.read()).toMatchObject({ dirty: false, html: page.html, sourceEditor: { mode: 'html', enhanced: true } });
  surface.actions.find((item: any) => item.action === 'content.sourceView').run({ mode: 'css' });
  expect(surface.read().dirty).toBe(false);
  await surface.actions.find((item: any) => item.action === 'content.formatSource').run();
  expect(surface.read()).toMatchObject({ dirty: true, html: page.html, css: page.css + '\n', sourceEditor: { mode: 'css' } });
  expect(options.beforeClose()).toBe(false);
  await surface.actions.find((item: any) => item.action === 'content.save').run();
  const update = (window.meltdownEmit as jest.Mock).mock.calls.find(([, payload]) => payload.action === 'update')![1].params;
  expect(update.translations[0]).toMatchObject({ html: page.html, css: page.css + '\n' });
  expect(update.meta).toMatchObject(page.meta);
  finish({ action: 'cancel' }); await pending; document.body.replaceChildren();
});

test('a failed code-editor enhancement retains visible plain fields and the native save path', async () => {
  (loadSourceEditor as jest.Mock).mockRejectedValue(new Error('chunk unavailable'));
  let options: any, finish!: (value: unknown) => void;
  (bpDialog.open as jest.Mock).mockImplementation(value => { options = value; document.body.append(value.body); return new Promise(resolve => { finish = resolve; }); });
  window.meltdownEmit = jest.fn().mockResolvedValue({ id: 90, title: 'Raw', language: 'en', html: '<p>Keep</p>', css: '', meta: { htmlFileName: 'raw.html' } });
  const pending = openHtmlContentEditor(90);
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(options.body.querySelector('[role="alert"]').textContent).toContain('SOURCE_EDITOR_LOAD_FAILED');
  const html = options.body.querySelector('textarea[aria-label="Page content HTML"]');
  expect(html.hidden).toBe(false); html.value = '<p>Edited</p>'; html.dispatchEvent(new Event('input', { bubbles: true }));
  const surface = (registerWorkspaceAgent as jest.Mock).mock.calls[0][0];
  expect(surface.read()).toMatchObject({ dirty: true, html: '<p>Edited</p>', sourceEditor: { enhanced: false, canFormat: false } });
  await surface.actions.find((item: any) => item.action === 'content.save').run();
  expect(options.beforeClose()).toBe(true);
  finish({ action: 'cancel' }); await pending; document.body.replaceChildren();
});
