const ACCOUNT_MENU_ID = 'account-menu';
const ACCOUNT_MENU_TOGGLE_ID = 'account-menu-toggle';
const ACCOUNT_MENU_PANEL_ID = 'account-menu-dropdown';

let accountMenuDocumentBound = false;

interface AccountMenuElements {
  menu: HTMLElement;
  toggle: HTMLButtonElement;
  panel: HTMLElement;
}

function getAccountMenuElements(): AccountMenuElements | null {
  const menu = document.getElementById(ACCOUNT_MENU_ID);
  const toggle = document.getElementById(ACCOUNT_MENU_TOGGLE_ID);
  const panel = document.getElementById(ACCOUNT_MENU_PANEL_ID);

  if (
    !(menu instanceof HTMLElement)
    || !(toggle instanceof HTMLButtonElement)
    || !(panel instanceof HTMLElement)
  ) {
    return null;
  }
  return { menu, toggle, panel };
}

function getAccountMenuItems(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>('.account-menu__item'))
    .filter(item => !item.hasAttribute('disabled') && item.tabIndex !== -1);
}

function focusAccountMenuItem(panel: HTMLElement, index: number): void {
  const items = getAccountMenuItems(panel);
  if (!items.length) return;
  const nextIndex = ((index % items.length) + items.length) % items.length;
  items[nextIndex]?.focus();
}

function focusRelativeAccountMenuItem(panel: HTMLElement, direction: 1 | -1): void {
  const items = getAccountMenuItems(panel);
  if (!items.length) return;
  const currentIndex = document.activeElement instanceof HTMLElement
    ? items.indexOf(document.activeElement)
    : -1;
  focusAccountMenuItem(panel, currentIndex < 0 ? (direction > 0 ? 0 : items.length - 1) : currentIndex + direction);
}

function setAccountMenuOpen(open: boolean, options: { focus?: 'first' | 'last' | 'toggle' } = {}): void {
  const elements = getAccountMenuElements();
  if (!elements) return;

  elements.menu.classList.toggle('is-open', open);
  elements.panel.hidden = !open;
  elements.toggle.setAttribute('aria-expanded', String(open));

  if (!open && options.focus === 'toggle') {
    elements.toggle.focus();
    return;
  }

  if (open && options.focus === 'first') {
    focusAccountMenuItem(elements.panel, 0);
  } else if (open && options.focus === 'last') {
    focusAccountMenuItem(elements.panel, -1);
  }
}

function bindAccountMenuDocumentBehavior(): void {
  if (accountMenuDocumentBound) return;
  accountMenuDocumentBound = true;

  document.addEventListener('click', event => {
    const elements = getAccountMenuElements();
    const target = event.target;
    if (!elements || !(target instanceof Node)) return;
    if (!elements.menu.contains(target)) {
      setAccountMenuOpen(false);
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    const elements = getAccountMenuElements();
    if (!elements || elements.panel.hidden) return;
    setAccountMenuOpen(false, { focus: 'toggle' });
  });
}

export function bindAccountMenu(): void {
  const elements = getAccountMenuElements();
  if (!elements) return;

  bindAccountMenuDocumentBehavior();

  if (elements.toggle.dataset.bound !== 'true') {
    elements.toggle.dataset.bound = 'true';
    elements.toggle.addEventListener('click', event => {
      event.stopPropagation();
      setAccountMenuOpen(elements.panel.hidden);
    });
    elements.toggle.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setAccountMenuOpen(true, { focus: 'first' });
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setAccountMenuOpen(true, { focus: 'last' });
      }
    });
  }

  if (elements.panel.dataset.bound !== 'true') {
    elements.panel.dataset.bound = 'true';
    elements.panel.addEventListener('click', event => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const item = target.closest<HTMLElement>('.account-menu__item');
      if (item && item.id !== 'theme-mode-toggle') {
        setAccountMenuOpen(false);
      }
    });
    elements.panel.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        focusRelativeAccountMenuItem(elements.panel, event.key === 'ArrowDown' ? 1 : -1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        focusAccountMenuItem(elements.panel, 0);
      } else if (event.key === 'End') {
        event.preventDefault();
        focusAccountMenuItem(elements.panel, -1);
      } else if (event.key === 'Tab') {
        setAccountMenuOpen(false);
      }
    });
  }
}
