import {
  addDashboardWidget,
} from './widgetPanelAddWidget.js';
import { bindWidgetPanelCatalog } from './widgetPanelCatalog.js';

let panel: HTMLDivElement | null = null;
let toggleBtn: HTMLElement | null = null;

function createPanel(): void {
  if (panel) return;
  panel = document.createElement('div');
  panel.id = 'widgets-panel';
  panel.className = 'widgets-panel';
  panel.innerHTML = `
    <div class="widgets-panel-inner">
      <input type="text" class="widgets-search" placeholder="Search Widgets..." />
      <div class="widgets-categories"></div>
    </div>`;
  document.body.appendChild(panel);

  const externalToggle = document.getElementById('widgets-toggle-inline');
  if (!externalToggle) {
    const createdToggle = document.createElement('button');
    createdToggle.id = 'widgets-toggle';
    createdToggle.className = 'widgets-toggle';
    createdToggle.type = 'button';
    createdToggle.textContent = 'Widgets +';
    createdToggle.addEventListener('click', () => {
      const open = !panel?.classList.contains('open');
      document.dispatchEvent(new CustomEvent('ui:widgets:toggle', { detail: { open } }));
    });
    document.body.appendChild(createdToggle);
    toggleBtn = createdToggle;
    const obs = new MutationObserver(() => {
      const ext = document.getElementById('widgets-toggle-inline');
      if (ext) {
        createdToggle.remove();
        toggleBtn = ext;
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  } else {
    toggleBtn = externalToggle;
  }

  bindWidgetPanelCatalog(panel);
}

function toggle(open?: boolean): void {
  if (!panel) createPanel();
  if (!panel) return;
  const isOpen = typeof open === 'boolean' ? open : !panel.classList.contains('open');
  panel.classList.toggle('open', isOpen);
}

export function openWidgetsPanel(forceOpen = true): void {
  toggle(forceOpen);
}

document.addEventListener('ui:widgets:toggle', ev => {
  toggle((ev as CustomEvent<{ open?: boolean }>).detail?.open);
});

document.addEventListener('click', ev => {
  if (!panel || !panel.classList.contains('open')) return;
  const target = ev.target instanceof Node ? ev.target : null;
  const clickedToggle = Boolean(toggleBtn && target && (toggleBtn === target || toggleBtn.contains(target)));
  if (target && !panel.contains(target) && !clickedToggle) toggle(false);
});

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.classList.contains('dashboard-edit-mode')) {
    createPanel();
  }
});

window.addDashboardWidget = addDashboardWidget;
