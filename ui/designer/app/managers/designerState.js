const STORAGE_KEY = 'builder.defaultOpacity';

function getLocalStorage() {
  try {
    // Sandboxed app frames can throw just by reading the Storage property.
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readDefaultOpacity() {
  const storage = getLocalStorage();
  if (!storage) return 1;
  try {
    const stored = parseFloat(storage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) ? stored : 1;
  } catch {
    return 1;
  }
}

export const designerState = {
  defaultOpacity: readDefaultOpacity(),
  bgMediaId: '',
  bgMediaUrl: ''
};

export function setDefaultOpacity(val) {
  designerState.defaultOpacity = val;
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, String(val));
  } catch {}
}
