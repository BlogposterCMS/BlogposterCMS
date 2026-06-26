import { fetchUserColor, isValidHex } from './userColorData.js';

const GOLD_COLOR = '#d4af37';
const COLOR_SIMILARITY_THRESHOLD = 50;
const THEME_MODE_STORAGE_KEY = 'blogposter.themeMode';
const THEME_MODE_SEQUENCE = ['system', 'dark', 'light'] as const;
let themeModeStorageSyncBound = false;

type ThemeMode = typeof THEME_MODE_SEQUENCE[number];

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function hexToRgb(hex: string): Rgb {
  const parsed = hex.slice(1);
  return {
    r: parseInt(parsed.slice(0, 2), 16),
    g: parseInt(parsed.slice(2, 4), 16),
    b: parseInt(parsed.slice(4, 6), 16)
  };
}

function hexToHsl(hex: string): Hsl {
  const { r, g, b } = hexToRgb(hex);
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h: number;
  let s: number;
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

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (0 <= h && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (60 <= h && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (120 <= h && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (180 <= h && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (240 <= h && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else {
    r = c;
    g = 0;
    b = x;
  }
  const toHex = (v: number): string => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clamp(num: number, min: number, max: number): number {
  return Math.min(Math.max(num, min), max);
}

function normalizeThemeMode(value: unknown): ThemeMode {
  return value === 'dark' || value === 'light' ? value : 'system';
}

function readStoredThemeMode(): ThemeMode {
  try {
    return normalizeThemeMode(window.localStorage?.getItem(THEME_MODE_STORAGE_KEY));
  } catch (error) {
    console.warn('[SHELL_THEME_MODE_STORAGE] Failed to read theme mode', error);
    return 'system';
  }
}

function writeStoredThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage?.setItem(THEME_MODE_STORAGE_KEY, mode);
  } catch (error) {
    console.warn('[SHELL_THEME_MODE_STORAGE] Failed to persist theme mode', error);
  }
}

function isThemeModeStorageEvent(event: StorageEvent): boolean {
  if (event.key !== THEME_MODE_STORAGE_KEY) return false;
  try {
    return !event.storageArea || event.storageArea === window.localStorage;
  } catch (error) {
    console.warn('[SHELL_THEME_MODE_STORAGE] Failed to inspect theme mode storage event', error);
    return true;
  }
}

export function bindThemeModeStorageSync(): void {
  if (themeModeStorageSyncBound) return;
  themeModeStorageSyncBound = true;
  window.addEventListener('storage', (event: StorageEvent) => {
    if (isThemeModeStorageEvent(event)) {
      applyThemeMode(event.newValue);
    }
  });
}

function modeIcon(mode: ThemeMode): string {
  if (mode === 'dark') return '/assets/icons/moon.svg';
  if (mode === 'light') return '/assets/icons/sun.svg';
  return '/assets/icons/sun-moon.svg';
}

function nextModeLabel(mode: ThemeMode): string {
  if (mode === 'system') return 'Switch to dark mode';
  if (mode === 'dark') return 'Switch to light mode';
  return 'Use system theme';
}

function updateThemeModeToggle(mode: ThemeMode): void {
  const button = document.getElementById('theme-mode-toggle');
  if (!button) return;
  const label = `Theme: ${mode}. ${nextModeLabel(mode)}.`;
  button.setAttribute('aria-label', label);
  button.removeAttribute('title');

  const icon = button.querySelector<HTMLImageElement>('img');
  if (icon) {
    icon.src = modeIcon(mode);
    icon.alt = '';
  }
}

export function applyThemeMode(mode: unknown = readStoredThemeMode()): ThemeMode {
  bindThemeModeStorageSync();
  const normalized = normalizeThemeMode(mode);
  document.documentElement.dataset.themeMode = normalized;
  if (normalized === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.dataset.theme = normalized;
  }
  updateThemeModeToggle(normalized);
  return normalized;
}

export function cycleThemeMode(): ThemeMode {
  const current = normalizeThemeMode(document.documentElement.dataset.themeMode || readStoredThemeMode());
  const currentIndex = THEME_MODE_SEQUENCE.indexOf(current);
  const next = THEME_MODE_SEQUENCE[(currentIndex + 1) % THEME_MODE_SEQUENCE.length] ?? 'system';
  writeStoredThemeMode(next);
  return applyThemeMode(next);
}

export function bindThemeModeToggle(): void {
  applyThemeMode();
  const button = document.getElementById('theme-mode-toggle');
  if (!button || button.dataset.themeModeBound === 'true') return;
  button.dataset.themeModeBound = 'true';
  button.addEventListener('click', () => {
    cycleThemeMode();
  });
}

export function setAccentVariables(hex: string): void {
  if (!isValidHex(hex)) return;
  const { h, s, l } = hexToHsl(hex);
  const sNorm = clamp(s, 60, 75);
  const lNorm = clamp(l, 40, 60);
  document.documentElement.style.setProperty('--accent-h', String(h));
  document.documentElement.style.setProperty('--accent-s', `${sNorm}%`);
  document.documentElement.style.setProperty('--accent-l', `${lNorm}%`);
  const contrast = lNorm > 50 ? '#000000' : '#ffffff';
  document.documentElement.style.setProperty('--color-primary-contrast', contrast);
  const normalizedHex = hslToHex(h, sNorm, lNorm);
  window.USER_COLOR = normalizedHex;
  updateSharedColor(normalizedHex);
}

function colorDistance(a: string, b: string): number {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return Math.sqrt((ca.r - cb.r) ** 2 + (ca.g - cb.g) ** 2 + (ca.b - cb.b) ** 2);
}

function updateSharedColor(userColor: string): void {
  let shared = GOLD_COLOR;
  if (isValidHex(userColor) && colorDistance(userColor, GOLD_COLOR) < COLOR_SIMILARITY_THRESHOLD) {
    shared = '#000000';
  }
  document.documentElement.style.setProperty('--shared-widget-color', shared);
}

export async function applyUserColor(force = false): Promise<void> {
  if (!force && window.USER_COLOR && isValidHex(window.USER_COLOR)) {
    setAccentVariables(window.USER_COLOR);
    return;
  }
  const jwt = window.ADMIN_TOKEN;
  if (!window.meltdownEmit || !jwt) return;
  try {
    const userColor = await fetchUserColor(window.meltdownEmit, jwt);
    if (userColor) {
      setAccentVariables(userColor);
    }
  } catch (err) {
    console.error('[userColor] Failed to set user color', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  bindThemeModeToggle();
  void applyUserColor();
});
document.addEventListener('top-header-loaded', () => {
  bindThemeModeToggle();
});
document.addEventListener('main-header-loaded', () => {
  void applyUserColor(true);
});
