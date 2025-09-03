const STORAGE_KEY = 'builder.defaultOpacity';

function readDefaultOpacity() {
  if (typeof localStorage === 'undefined') return 1;
  try {
    const stored = parseFloat(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) ? stored : 1;
  } catch {
    return 1;
  }
}

export const designerState = {
  defaultOpacity: readDefaultOpacity()
};

export function setDefaultOpacity(val) {
  designerState.defaultOpacity = val;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, String(val));
  } catch {}
}
