/**
 * @jest-environment jsdom
 */

import {
  applyThemeMode,
  bindThemeModeToggle,
  cycleThemeMode
} from '../ui/shell/theme/userColor';

describe('theme mode controls', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-theme-mode');
    document.body.innerHTML = '';
    window.localStorage.clear();
  });

  it('applies explicit light, dark, and system theme modes through document tokens', () => {
    expect(applyThemeMode('dark')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.themeMode).toBe('dark');

    expect(applyThemeMode('light')).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.dataset.themeMode).toBe('light');

    expect(applyThemeMode('system')).toBe('system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.dataset.themeMode).toBe('system');
  });

  it('binds the top-header theme toggle and cycles modes persistently', () => {
    document.body.innerHTML = `
      <button id="theme-mode-toggle" type="button">
        <img src="/assets/icons/sun-moon.svg" alt="" />
      </button>
    `;

    bindThemeModeToggle();
    expect(document.getElementById('theme-mode-toggle')?.dataset.themeModeBound).toBe('true');
    expect(document.getElementById('theme-mode-toggle')?.getAttribute('title')).toBeNull();
    expect(document.documentElement.dataset.themeMode).toBe('system');

    document.getElementById('theme-mode-toggle')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('blogposter.themeMode')).toBe('dark');
    expect(document.querySelector<HTMLImageElement>('#theme-mode-toggle img')?.src).toContain('/assets/icons/moon.svg');

    expect(cycleThemeMode()).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('syncs document theme tokens when another same-origin frame changes storage', () => {
    applyThemeMode('light');
    expect(document.documentElement.dataset.theme).toBe('light');

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'blogposter.themeMode',
      newValue: 'dark'
    }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.themeMode).toBe('dark');

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'blogposter.themeMode',
      newValue: 'system'
    }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(document.documentElement.dataset.themeMode).toBe('system');
  });
});
