import type { OpenMediaExplorerOptions } from '../media/openExplorer.js';

// Keep the existing picker contract available immediately; load its UI on use.
window._openMediaExplorer = async (options: OpenMediaExplorerOptions = {}) => {
  const { openMediaExplorer } = await import('../media/openExplorer.js');
  return openMediaExplorer(options);
};
