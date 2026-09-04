export interface BpTabSystem {
  addTab: (label: string) => HTMLElement;
  select: (index: number) => void;
}

let tabSystemId = 0;

/** Creates an accessible tablist while allowing panels to be populated later. */
export function createTabSystem(container: HTMLElement, tabsHost: HTMLElement): BpTabSystem {
  tabSystemId += 1;
  const systemId = `bp-tabs-${tabSystemId}`;
  const tabs: Array<{ button: HTMLButtonElement; panel: HTMLElement }> = [];
  tabsHost.classList.add('bp-tabs');
  tabsHost.setAttribute('role', 'tablist');

  const select = (index: number) => {
    const safeIndex = Math.max(0, Math.min(index, tabs.length - 1));
    tabs.forEach((tab, currentIndex) => {
      const active = currentIndex === safeIndex;
      tab.button.classList.toggle('active', active);
      tab.button.setAttribute('aria-selected', String(active));
      tab.button.tabIndex = active ? 0 : -1;
      tab.panel.hidden = !active;
    });
  };

  const focusTab = (index: number) => {
    if (!tabs.length) return;
    const wrappedIndex = (index + tabs.length) % tabs.length;
    select(wrappedIndex);
    tabs[wrappedIndex]?.button.focus();
  };

  const addTab = (label: string): HTMLElement => {
    const index = tabs.length;
    const buttonId = `${systemId}-tab-${index}`;
    const panelId = `${systemId}-panel-${index}`;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = buttonId;
    button.className = 'button ghost sm';
    button.textContent = label;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', panelId);
    button.setAttribute('aria-selected', 'false');
    button.tabIndex = -1;

    const panel = document.createElement('section');
    panel.id = panelId;
    panel.className = 'settings-section bp-tab-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', buttonId);
    panel.tabIndex = 0;
    panel.hidden = true;

    button.addEventListener('click', () => select(index));
    button.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        focusTab(index + 1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        focusTab(index - 1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        focusTab(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        focusTab(tabs.length - 1);
      }
    });

    tabs.push({ button, panel });
    tabsHost.appendChild(button);
    container.appendChild(panel);
    if (tabs.length === 1) select(0);
    return panel;
  };

  return { addTab, select };
}
