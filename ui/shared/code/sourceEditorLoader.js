let loading;
/** Use the existing local bundled-editor loading boundary, including AppLoader frames. */
export async function loadSourceEditor() {
    if (!window.BlogposterSourceEditor) {
        const url = new URL('/build/sourceEditor.js', window.location.href).href;
        loading ||= import(/* webpackIgnore: true */ url).catch(error => { loading = undefined; throw error; });
        await loading;
    }
    if (!window.BlogposterSourceEditor)
        throw new Error('SOURCE_EDITOR_LOAD_FAILED');
    return window.BlogposterSourceEditor;
}
