/** @jest-environment jsdom */
import { createHtmlImportControl } from '../ui/widgets/plainspace/admin/htmlImportControl';
import { emitRuntimeAdmin } from '../ui/shared/api-client/runtimeFacade';

jest.mock('../ui/shared/api-client/runtimeFacade', () => ({ emitRuntimeAdmin: jest.fn() }));
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const preview = { plan: { summary: { editableWidgets: 2, decorations: 1, capturedWidths: [390, 1440], warnings: [{ code: 'HTML_IMPORT_VIEWPORTS_SAMPLED' }] } } };

beforeEach(() => { jest.clearAllMocks(); window.meltdownEmit = jest.fn(); window.ADMIN_TOKEN = 'test-token'; (emitRuntimeAdmin as jest.Mock).mockResolvedValue(preview); });

function choose(control: HTMLElement, text: () => Promise<string>, size = 100) {
  const input = control.querySelector('input')!;
  Object.defineProperty(input, 'files', { configurable: true, value: [{ text, size }] });
  input.dispatchEvent(new Event('change'));
}

test('upload is dry-run first and exposes explicit review before enabling draft creation', async () => {
  const control = createHtmlImportControl();
  const apply = control.querySelectorAll('button')[1]!;
  expect(apply.disabled).toBe(true);
  choose(control, async () => JSON.stringify({ version: 1 }));
  await flush();
  expect(emitRuntimeAdmin).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'importers', 'run', {
    importerName: 'htmlPage', options: { capture: { version: 1 }, dryRun: true }
  }, 60000);
  expect(apply.disabled).toBe(false);
  expect(control.textContent).toContain('HTML_IMPORT_VIEWPORTS_SAMPLED');
});

test('slow old file reads cannot replace the newer reviewed capture', async () => {
  const control = createHtmlImportControl();
  let finishOld: (s: string) => void = () => {};
  choose(control, () => new Promise(resolve => { finishOld = resolve; }));
  choose(control, async () => '{"title":"new"}');
  await flush();
  finishOld('{"title":"old"}');
  await flush();
  expect(emitRuntimeAdmin).toHaveBeenCalledTimes(1);
  expect((emitRuntimeAdmin as jest.Mock).mock.calls[0][4].options.capture.title).toBe('new');
});

test('oversized or invalid JSON stays blocked without an import request', async () => {
  const control = createHtmlImportControl();
  choose(control, async () => '{}', 9 * 1024 * 1024);
  await flush();
  expect(emitRuntimeAdmin).not.toHaveBeenCalled();
  expect(control.querySelectorAll('button')[1]!.disabled).toBe(true);
  expect(control.textContent).toContain('HTML_IMPORT_LIMIT_EXCEEDED');
});
