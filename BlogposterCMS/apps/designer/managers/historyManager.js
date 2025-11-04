const historyByDesign = {};

export function initDesignHistory(designId) {
  if (!designId) return historyByDesign;
  historyByDesign[designId] = historyByDesign[designId] || { undoStack: [], redoStack: [] };
  return historyByDesign[designId];
}

export function getDesignHistory(designId) {
  if (!designId) {
    return { undoStack: [], redoStack: [] };
  }
  if (!historyByDesign[designId]) {
    historyByDesign[designId] = { undoStack: [], redoStack: [] };
  }
  return historyByDesign[designId];
}

export function pushLayoutSnapshot(designId, layout, pushHistoryState) {
  if (!designId || !pushHistoryState) return;
  const { undoStack, redoStack } = getDesignHistory(designId);
  pushHistoryState(undoStack, redoStack, layout);
}

export function undoDesign(designId, { applySnapshot, undoTextCommand, scheduleAutosave, shouldAutosave } = {}) {
  if (!designId || typeof applySnapshot !== 'function') return;
  if (typeof undoTextCommand === 'function' && undoTextCommand()) return;
  const { undoStack, redoStack } = getDesignHistory(designId);
  if (undoStack.length < 2) return;
  const current = undoStack.pop();
  redoStack.push(current);
  const prev = JSON.parse(undoStack[undoStack.length - 1]);
  applySnapshot(prev);
  if (shouldAutosave && typeof scheduleAutosave === 'function') {
    scheduleAutosave();
  }
}

export function redoDesign(designId, { applySnapshot, redoTextCommand, scheduleAutosave, shouldAutosave } = {}) {
  if (!designId || typeof applySnapshot !== 'function') return;
  if (typeof redoTextCommand === 'function' && redoTextCommand()) return;
  const { undoStack, redoStack } = getDesignHistory(designId);
  if (!redoStack.length) return;
  const next = redoStack.pop();
  undoStack.push(next);
  const layout = JSON.parse(next);
  applySnapshot(layout);
  if (shouldAutosave && typeof scheduleAutosave === 'function') {
    scheduleAutosave();
  }
}

export function resetDesignHistory(designId) {
  if (!designId) return;
  historyByDesign[designId] = { undoStack: [], redoStack: [] };
}
