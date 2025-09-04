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

function hexToHsl(hex) {
  const { r, g, b } = hexToRgb(hex);
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h, s;
  const l = (max + min) / 2;
  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      default:
        h = (rNorm - gNorm) / d + 4;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (0 <= h && h < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }
  const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clamp(num, min, max) {
  return Math.min(Math.max(num, min), max);
}

export function setAccentVariables(hex) {
  if (!isValidHex(hex)) return;
  const { h, s, l } = hexToHsl(hex);
  const sNorm = clamp(s, 60, 75);
  const lNorm = clamp(l, 40, 60);
  document.documentElement.style.setProperty('--accent-h', h);
  document.documentElement.style.setProperty('--accent-s', `${sNorm}%`);
  document.documentElement.style.setProperty('--accent-l', `${lNorm}%`);
  const contrast = lNorm > 50 ? '#000000' : '#ffffff';
  document.documentElement.style.setProperty('--color-primary-contrast', contrast);
  const normalizedHex = hslToHex(h, sNorm, lNorm);
  window.USER_COLOR = normalizedHex;
  updateSharedColor(normalizedHex);
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
  if (!force && window.USER_COLOR && isValidHex(window.USER_COLOR)) {
    setAccentVariables(window.USER_COLOR);
    return;
  }
  const jwt = window.ADMIN_TOKEN;
  if (!window.meltdownEmit || !jwt) return;
  try {
    const authPayload = {
      moduleName: 'auth',
      moduleType: 'core'
    };
    if (jwt) {
      authPayload.jwt = jwt;
      authPayload.tokenToValidate = jwt;
    }
    const decoded = await window.meltdownEmit('validateToken', authPayload);
    const userId = decoded?.userId;
    if (!userId) return;
    const userPayload = {
      moduleName: 'userManagement',
      moduleType: 'core',
      userId
    };
    if (jwt) {
      userPayload.jwt = jwt;
    }
    const res = await window.meltdownEmit('getUserDetailsById', userPayload);
    const user = res?.data ?? res;
    if (user && isValidHex(user.ui_color)) {
      setAccentVariables(user.ui_color);
    }
  } catch (err) {
    console.error('[userColor] Failed to set user color', err);
  }
}

document.addEventListener('DOMContentLoaded', applyUserColor);
document.addEventListener('main-header-loaded', () => applyUserColor(true));
