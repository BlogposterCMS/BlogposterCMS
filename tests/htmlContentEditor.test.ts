/** @jest-environment jsdom */
import { openHtmlContentEditor } from '../ui/shared/article/htmlContentEditor';
import { bpDialog } from '../ui/shared/dialogs/bpDialog';
import { registerWorkspaceAgent } from '../ui/shared/agent/workspaceAgent';
jest.mock('../ui/shared/agent/workspaceAgent', () => ({ registerWorkspaceAgent: jest.fn(() => ({ stop: jest.fn() })) }));
jest.mock('../ui/shared/dialogs/bpDialog', () => ({ bpDialog: { open: jest.fn() } }));

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
