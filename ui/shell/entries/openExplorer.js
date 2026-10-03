// Keep the existing picker contract available immediately; load its UI on use.
window._openMediaExplorer = async (options = {}) => {
    const { openMediaExplorer } = await import('../media/openExplorer.js');
    return openMediaExplorer(options);
};
export {};
