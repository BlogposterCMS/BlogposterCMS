/** @jest-environment jsdom */
import { runDocsExampleImport, promptDocsExampleImport } from '../ui/widgets/plainspace/admin/exampleImportControl';
import { bpDialog } from '../ui/shared/dialogs/bpDialog';
jest.mock('../ui/shared/dialogs/bpDialog', () => ({ bpDialog: { prompt: jest.fn() } }));

beforeEach(() => { jest.clearAllMocks(); });

test('UI and agent requests stay on the existing Importer facade with explicit draft import intent', async () => {
  const response = { dryRun: false, plan: { rootSlug: 'handbook' }, result: { rootPageId: 1, designId: 2 } };
  window.meltdownEmit = jest.fn().mockResolvedValue(response);
  expect(await runDocsExampleImport('handbook', false)).toEqual(response);
  expect(window.meltdownEmit).toHaveBeenCalledWith('cmsAdminApiRequest', expect.objectContaining({
    resource: 'importers', action: 'run', params: { importerName: 'exampleSite', options: { exampleId: 'docs', rootSlug: 'handbook', dryRun: false } }
  }), 60000);
});

test('rejects malformed success responses and unsafe addresses', async () => {
  window.meltdownEmit = jest.fn().mockResolvedValue({ plan: {} });
  await expect(runDocsExampleImport('handbook', false)).rejects.toThrow('EXAMPLE_IMPORT_RESULT_INVALID');
  await expect(runDocsExampleImport('../other', false)).rejects.toThrow('EXAMPLE_IMPORT_SLUG_INVALID');
});

test('explains the draft scope before importing and allows cancellation', async () => {
  jest.mocked(bpDialog.prompt).mockResolvedValue(null);
  expect(await promptDocsExampleImport()).toBeNull();
  expect(bpDialog.prompt).toHaveBeenCalledWith(expect.stringContaining('Pages and design start as drafts'), 'docs-example',
    expect.objectContaining({ submitLabel: 'Import example', prompt: expect.objectContaining({ label: 'Root page address' }) }));
});
