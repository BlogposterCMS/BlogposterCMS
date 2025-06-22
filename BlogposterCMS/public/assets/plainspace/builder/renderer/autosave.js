//public/assets/plainspace/builder/renderer/autosave.js
export function scheduleAutosave(state, saveFn) {
  if (!state.autosaveEnabled || !state.pageId) return;
  state.pendingSave = true;
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(() => {
    saveFn({ autosave: true });
  }, 1000);
}

export function startAutosave(state, saveFn) {
  if (state.autosaveInterval) clearInterval(state.autosaveInterval);
  if (state.autosaveEnabled && state.pageId) {
    state.autosaveInterval = setInterval(() => {
      if (state.pendingSave) saveFn({ autosave: true });
    }, 30000);
  }
}

export async function saveCurrentLayout({ autosave = false } = {}, ctx) {
  const { updateAllWidgetContents, getCurrentLayout, pushState, meltdownEmit, pageId, codeMap } = ctx;
  if (!pageId) return;
  updateAllWidgetContents();
  const layout = getCurrentLayout();
  const layoutStr = JSON.stringify(layout);
  if (autosave && layoutStr === ctx.lastSavedLayoutStr) { ctx.pendingSave = false; return; }
  if (!autosave) pushState(layout);
  try {
    await meltdownEmit('saveLayoutForViewport', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'plainspace',
      moduleType: 'core',
      pageId,
      lane: 'public',
      viewport: 'desktop',
      layout
    });
    ctx.lastSavedLayoutStr = layoutStr;
    ctx.pendingSave = false;
  } catch (err) {
    console.error('[Builder] saveLayoutForViewport error', err);
  }
}
