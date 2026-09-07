import { bpDialog } from '../../../shared/dialogs/bpDialog.js';
import { emitRuntimeAdmin } from '../../../shared/api-client/runtimeFacade.js';

export type DocsExampleImport = {
  dryRun: boolean;
  plan: { summary: string; rootSlug: string; pages: Array<{ title: string; slug: string }> };
  result?: { rootPageId: string | number; designId: string | number; pageIds: Array<string | number>; menuKey: string };
};

/** UI and agents use the same Importer contract; Pages retains busy/draft state. */
export async function runDocsExampleImport(rootSlug: string, dryRun: boolean): Promise<DocsExampleImport> {
  if (!/^[a-z][a-z0-9-]{0,47}$/.test(rootSlug)) throw new Error('EXAMPLE_IMPORT_SLUG_INVALID: Use a lowercase address such as docs-example.');
  if (typeof window.meltdownEmit !== 'function') throw new Error('EXAMPLE_IMPORT_BRIDGE_MISSING');
  const response = await emitRuntimeAdmin<DocsExampleImport>(window.meltdownEmit, window.ADMIN_TOKEN, 'importers', 'run', {
    importerName: 'exampleSite', options: { exampleId: 'docs', rootSlug, dryRun }
  }, 60000);
  if (!response?.plan || (!dryRun && (!response.result?.rootPageId || !response.result?.designId))) {
    throw new Error('EXAMPLE_IMPORT_RESULT_INVALID: Check Pages before retrying the import.');
  }
  return response;
}

export function promptDocsExampleImport(): Promise<string | null> {
  return bpDialog.prompt(
    'Learn how to build documentation with three English chapters: Introduction, Layouts & pages, and Working with agents. Includes a shared design, chapter menu and breadcrumb. Pages and design start as drafts. Existing pages, your home page and main design stay unchanged.',
    'docs-example',
    { title: 'Import documentation example', submitLabel: 'Import example', cancelLabel: 'Cancel',
      prompt: { label: 'Root page address', placeholder: 'docs-example', required: true } }
  );
}
