/**
 * @jest-environment jsdom
 */

import { bindAccountMenu } from '../ui/shell/dashboard/topHeaderAccountMenu';

function renderAccountMenu(): void {
  document.body.innerHTML = `
    <div class="top-header">
      <div class="right-icons">
        <div id="account-menu" class="account-menu">
          <button
            id="account-menu-toggle"
            class="top-header__icon-button account-menu__toggle"
            type="button"
            aria-label="Open account menu"
            aria-haspopup="menu"
            aria-expanded="false"
            aria-controls="account-menu-dropdown"
          ></button>
          <div id="account-menu-dropdown" class="account-menu__dropdown" role="menu" hidden>
            <button id="theme-mode-toggle" class="account-menu__item" type="button" role="menuitem">Theme mode</button>
            <a href="#" id="user-link" class="account-menu__item" role="menuitem">Profile</a>
            <button id="logout-icon" class="account-menu__item" type="button" role="menuitem">Log out</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function click(element: Element): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function keydown(element: Element, key: string): void {
  element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('top header account menu', () => {
  beforeEach(() => {
    renderAccountMenu();
  });

  it('groups theme, profile, and logout actions behind one menu trigger', () => {
    bindAccountMenu();

    const toggle = document.getElementById('account-menu-toggle') as HTMLButtonElement;
    const panel = document.getElementById('account-menu-dropdown') as HTMLElement;
    const items = panel.querySelectorAll('.account-menu__item');

    expect(panel.hidden).toBe(true);
    expect(toggle.getAttribute('aria-haspopup')).toBe('menu');
    expect(items).toHaveLength(3);

    click(toggle);

    expect(panel.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    click(document.body);

    expect(panel.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('supports keyboard navigation without closing the theme cycle action', () => {
    bindAccountMenu();

    const toggle = document.getElementById('account-menu-toggle') as HTMLButtonElement;
    const panel = document.getElementById('account-menu-dropdown') as HTMLElement;
    const theme = document.getElementById('theme-mode-toggle') as HTMLButtonElement;
    const profile = document.getElementById('user-link') as HTMLAnchorElement;

    keydown(toggle, 'ArrowDown');

    expect(panel.hidden).toBe(false);
    expect(document.activeElement).toBe(theme);

    click(theme);
    expect(panel.hidden).toBe(false);

    keydown(theme, 'ArrowDown');
    expect(document.activeElement).toBe(profile);

    keydown(profile, 'Escape');

    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);
  });
});
