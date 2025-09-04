export function createSaveManager(state, ctx) {
  function scheduleAutosave() {
    if (!state.autosaveEnabled || !state.pageId) return;
    state.pendingSave = true;
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      saveCurrentLayout({ autosave: true });
    }, 1000);
  }

  function startAutosave() {
    if (state.autosaveInterval) clearInterval(state.autosaveInterval);
    if (state.autosaveEnabled && state.pageId) {
      state.autosaveInterval = setInterval(() => {
        if (state.pendingSave) saveCurrentLayout({ autosave: true });
      }, 30000);
    }
  }

  async function saveCurrentLayout({ autosave = false } = {}) {
    const { updateAllWidgetContents, getCurrentLayout, pushState } = ctx;
    if (!state.pageId) return;
    updateAllWidgetContents();
    const layout = getCurrentLayout();
    const layoutStr = JSON.stringify(layout);
    if (autosave && layoutStr === state.lastSavedLayoutStr) { state.pendingSave = false; return; }
    if (!autosave) pushState(layout);
    try {
      await window.meltdownEmit('saveLayoutForViewport', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'plainspace',
        moduleType: 'core',
        pageId: state.pageId,
        lane: 'public',
        viewport: 'desktop',
        layout,
        layer: typeof ctx.getLayer === 'function' ? ctx.getLayer() : 0
      });
      state.lastSavedLayoutStr = layoutStr;
      state.pendingSave = false;
    } catch (err) {
      console.error('[Designer] saveLayoutForViewport error', err);
    }
  }

  async function saveDesign({
    name,
    gridEl,
    getCurrentLayoutForLayer,
    getActiveLayer,
    ensureCodeMap,
    capturePreview,
    updateAllWidgetContents,
    pageId
  }) {
    if (!name) { alert('Enter a name'); return; }
    updateAllWidgetContents();
    const layout = getCurrentLayoutForLayer(gridEl, getActiveLayer(), ensureCodeMap());
    const previewPath = typeof capturePreview === 'function' ? await capturePreview() : '';
    try {
      await window.meltdownEmit('saveLayoutTemplate', {
        jwt: window.ADMIN_TOKEN,
        moduleName: 'plainspace',
        name,
        lane: 'public',
        viewport: 'desktop',
        layout,
        previewPath
      });
      const targetIds = pageId ? [pageId] : [];
      const events = targetIds.map(id => ({
        eventName: 'saveLayoutForViewport',
        payload: {
          jwt: window.ADMIN_TOKEN,
          moduleName: 'plainspace',
          moduleType: 'core',
          pageId: id,
          lane: 'public',
          viewport: 'desktop',
          layout
        }
      }));
      if (events.length) await window.meltdownEmitBatch(events);
    } catch (err) {
      console.error('[Designer] saveLayoutTemplate error', err);
      throw err;
    }
  }

  return { scheduleAutosave, startAutosave, saveCurrentLayout, saveDesign };
}
