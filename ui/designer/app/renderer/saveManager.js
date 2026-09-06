import { capturePreview as defaultCapturePreview } from './capturePreview.js';
import { designerState } from '../managers/designerState.js';
import { serializeLayout } from './layoutSerialize.js';
import { emitAdminFacade } from '../runtime/runtimeFacade.js';

export function createSaveManager(state, ctx) {
  let saveQueue = Promise.resolve();
  let changeVersion = 0;
  let queuedSaves = 0;
  let lastSaveError = null;
  function scheduleAutosave() {
    changeVersion += 1;
    state.pendingSave = true;
    // Untitled/manual-only designs still have a draft that collaborators must see.
    if (!state.autosaveEnabled || !state.designId) return;
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      saveCurrentLayout({ autosave: true });
    }, 1000);
  }

  document.addEventListener('designerContentChanged', scheduleAutosave);

  function startAutosave() {
    if (state.autosaveInterval) clearInterval(state.autosaveInterval);
    if (state.autosaveEnabled && state.designId) {
      state.autosaveInterval = setInterval(() => {
        if (state.pendingSave) saveCurrentLayout({ autosave: true });
      }, 30000);
    }
  }

  async function saveCurrentLayout({ autosave = false } = {}) {
    if (!state.designId || typeof ctx.getDesignSaveOptions !== 'function') return;
    const savingVersion = changeVersion;
    try {
      // Autosave shares the full LayoutTree/placement contract with manual Save.
      await saveDesign(ctx.getDesignSaveOptions());
      if (savingVersion === changeVersion) state.pendingSave = false;
    } catch (err) {
      console.error('[Designer] DESIGNER_AUTOSAVE_FAILED', err);
    }
  }

  function saveDesign(options) {
    // Serialize versioned writes so manual Save cannot race an autosave.
    queuedSaves += 1;
    const operation = saveQueue.then(async () => {
      const savingVersion = changeVersion;
      try {
        const result = await persistDesign(options);
        if (savingVersion === changeVersion) state.pendingSave = false;
        lastSaveError = null;
        return result;
      } catch (error) {
        lastSaveError = error instanceof Error ? error.message : String(error);
        throw error;
      } finally { queuedSaves -= 1; }
    });
    saveQueue = operation.catch(() => {});
    return operation;
  }

  async function persistDesign({
    name,
    description = '',
    gridEl,
    layoutRoot = gridEl,
    getCurrentLayoutForLayer,
    getActiveLayer,
    ensureCodeMap,
    capturePreview,
    updateAllWidgetContents,
    ownerId,
    pageId,
    isLayout = false,
    isGlobal = false
  }) {
    if (!name?.trim()) throw new Error('DESIGNER_SAVE_NAME_REQUIRED: Enter a design name before saving.');
    updateAllWidgetContents();
    const layout = getCurrentLayoutForLayer(gridEl, getActiveLayer(), ensureCodeMap());
    const rootLayout = layoutRoot?.classList?.contains('layout-container')
      ? layoutRoot
      : layoutRoot?.querySelector('.layout-container');
    const layoutTree = rootLayout ? serializeLayout(rootLayout) : null;
    const sceneSections = typeof ctx.getSceneSections === 'function'
      ? ctx.getSceneSections()
      : [];
    const layoutPayload = layoutTree || (sceneSections.length ? { type: 'leaf', workarea: true } : null);
    // Canonical Section metadata is serialized on the LayoutTree nodes. Do not
    // write a second mutable scene list that could drift from the page order.
    // Page cards need an at-a-glance thumbnail, so save the visible viewport
    // instead of shrinking a full-height canvas into an unreadable image.
    const thumbnailCaptureOptions = { viewport: true };
    const previewDataUrl = typeof capturePreview === 'function'
      ? await capturePreview(thumbnailCaptureOptions)
      : gridEl ? await defaultCapturePreview(gridEl, thumbnailCaptureOptions) : '';
    let thumbnailUrl = '';
    if (previewDataUrl && previewDataUrl.startsWith('data:image')) {
      try {
        const base64 = previewDataUrl.split(',')[1];
        const thumbFile = `thumb-${Date.now()}.png`;
        const subPath = 'builder/designer-thumbnails';
        await emitAdminFacade(window.meltdownEmit, 'media', 'uploadToFolder', {
          subPath,
          fileName: thumbFile,
          fileData: base64
        });
        const pubRes = await emitAdminFacade(window.meltdownEmit, 'media', 'makeFilePublic', {
          filePath: `${subPath}/${thumbFile}`,
          userId: ownerId
        });
        thumbnailUrl = typeof pubRes?.shareLink === 'string' ? pubRes.shareLink : '';
      } catch (err) {
        console.warn('[Designer] DESIGNER_THUMBNAIL_UPLOAD_FAILED', err);
      }
    }
    try {
      const bgStyle = layoutRoot ? getComputedStyle(layoutRoot) : (gridEl ? getComputedStyle(gridEl) : null);
      let mediaId = layoutRoot?.dataset.bgImageId || gridEl?.dataset.bgImageId || designerState.bgMediaId || '';
      let mediaUrl = layoutRoot?.dataset.bgImageUrl || gridEl?.dataset.bgImageUrl || designerState.bgMediaUrl || '';
      if (!mediaUrl && bgStyle?.backgroundImage && bgStyle.backgroundImage !== 'none') {
        const m = bgStyle.backgroundImage.match(/url\((['"]?)(.*?)\1\)/i);
        mediaUrl = m ? m[2] : '';
      }
      const bg = gridEl ? {
        color: bgStyle?.backgroundColor || '',
        mediaId,
        mediaUrl
      } : null;
      const res = await emitAdminFacade(window.meltdownEmit, 'designer', 'save', {
        design: {
          id: state.designId,
          title: name,
          description,
          thumbnail: thumbnailUrl,
          ownerId,
          bgColor: bg ? bg.color : '',
          bgMediaId: bg ? bg.mediaId : '',
          bgMediaUrl: bg ? bg.mediaUrl : '',
          version: state.designVersion,
          isLayout,
          isGlobal
        },
        widgets: layout,
        layout: layoutPayload
      }, 20000);
      if (res && (typeof res.id === 'string' || typeof res.id === 'number')) {
        state.designId = res.id;
      }
      if (res && typeof res.version === 'number') {
        state.designVersion = res.version;
      }
      if (bg) {
        designerState.bgMediaId = bg.mediaId || '';
        designerState.bgMediaUrl = bg.mediaUrl || '';
      }
      return {
        ...(res && typeof res === 'object' ? res : {}),
        thumbnailUrl
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        console.error('[Designer] saveDesign timed out', err);
        // Propagate to the UI/agent caller instead of blocking automation with alert().
      } else {
        console.error('[Designer] saveDesign error', err);
      }
      throw err;
    }
  }

  const getSaveState = () => ({
    dirty: Boolean(state.pendingSave), busy: queuedSaves > 0,
    error: lastSaveError, designId: state.designId || null,
    designVersion: state.designVersion || null, changeVersion,
    autosaveEnabled: Boolean(state.autosaveEnabled && state.designId)
  });
  return { scheduleAutosave, startAutosave, saveCurrentLayout, saveDesign, getSaveState };
}
