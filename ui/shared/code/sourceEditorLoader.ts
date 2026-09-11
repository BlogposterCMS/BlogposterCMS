import type { createSourceEditor } from './sourceEditor.js';

type SourceEditorRuntime = { createSourceEditor: typeof createSourceEditor };
declare global { interface Window { BlogposterSourceEditor?: SourceEditorRuntime; } }
let loading: Promise<unknown> | undefined;

/** Use the existing local bundled-editor loading boundary, including AppLoader frames. */
export async function loadSourceEditor(): Promise<SourceEditorRuntime> {
  if (!window.BlogposterSourceEditor) {
    const url = new URL('/build/sourceEditor.js', window.location.href).href;
    loading ||= import(/* webpackIgnore: true */ url).catch(error => { loading = undefined; throw error; });
    await loading;
  }
  if (!window.BlogposterSourceEditor) throw new Error('SOURCE_EDITOR_LOAD_FAILED');
  return window.BlogposterSourceEditor;
}
