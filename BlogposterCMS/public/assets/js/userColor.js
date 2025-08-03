const GOLD_COLOR = '#d4af37';
const COLOR_SIMILARITY_THRESHOLD = 50;

function isValidHex(color) {
  return typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color);
}

function hexToRgb(hex) {
  const parsed = hex.slice(1);
  return {
    r: parseInt(parsed.slice(0, 2), 16),
    g: parseInt(parsed.slice(2, 4), 16),
    b: parseInt(parsed.slice(4, 6), 16)
  };
}

function colorDistance(a, b) {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return Math.sqrt((ca.r - cb.r) ** 2 + (ca.g - cb.g) ** 2 + (ca.b - cb.b) ** 2);
}

function updateSharedColor(userColor) {
  let shared = GOLD_COLOR;
  if (isValidHex(userColor) && colorDistance(userColor, GOLD_COLOR) < COLOR_SIMILARITY_THRESHOLD) {
    shared = '#000000';
  }
  document.documentElement.style.setProperty('--shared-widget-color', shared);
}

export async function applyUserColor(force = false) {
  if (!force && window.USER_COLOR) {
    if (isValidHex(window.USER_COLOR)) {
      document.documentElement.style.setProperty('--user-color', window.USER_COLOR);
    }
    updateSharedColor(window.USER_COLOR);
    return;
  }
  const jwt = window.ADMIN_TOKEN;
  updateSharedColor(window.USER_COLOR);
  if (!jwt || !window.meltdownEmit) return;
  try {
    const decoded = await window.meltdownEmit('validateToken', {
      jwt,
      moduleName: 'auth',
      moduleType: 'core',
      tokenToValidate: jwt
    });
    const userId = decoded?.userId;
    if (!userId) return;
    const res = await window.meltdownEmit('getUserDetailsById', {
      jwt,
      moduleName: 'userManagement',
      moduleType: 'core',
      userId
    });
    const user = res?.data ?? res;
    if (user && isValidHex(user.ui_color)) {
      window.USER_COLOR = user.ui_color;
      document.documentElement.style.setProperty('--user-color', user.ui_color);
      updateSharedColor(user.ui_color);
    }
  } catch (err) {
    console.error('[userColor] Failed to set user color', err);
  }
}

document.addEventListener('DOMContentLoaded', applyUserColor);
