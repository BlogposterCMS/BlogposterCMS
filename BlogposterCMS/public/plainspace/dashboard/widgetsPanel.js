import { applyWidgetOptions } from '../main/widgetOptions.js';
import { attachDashboardControls } from './widgetControls.js';

const DEFAULT_ADMIN_ROWS = 20;
let panel;
let toggleBtn;

function createPanel() {
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

  // ⬇️ Nur eigenen Toggle bauen, wenn NICHT extern vorhanden
  const externalToggle = document.getElementById('widgets-toggle-inline');
  if (!externalToggle) {
    toggleBtn = document.createElement('button');
    toggleBtn.id = 'widgets-toggle';
    toggleBtn.className = 'widgets-toggle';
    toggleBtn.type = 'button';
    toggleBtn.textContent = 'Widgets +';
    toggleBtn.addEventListener('click', () => {
      const open = !panel.classList.contains('open');
      document.dispatchEvent(
        new CustomEvent('ui:widgets:toggle', { detail: { open } })
      );
    });
    document.body.appendChild(toggleBtn);
    // Remove floater if external toggle appears later
    const obs = new MutationObserver(() => {
      const ext = document.getElementById('widgets-toggle-inline');
      if (ext) {
        toggleBtn.remove();
        toggleBtn = ext;
        obs.disconnect();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  } else {
    toggleBtn = externalToggle;
  }

  buildWidgets();
}

function buildWidgets() {
  const container = panel.querySelector('.widgets-categories');
  const searchInput = panel.querySelector('.widgets-search');
  const widgets = Array.isArray(window.availableWidgets) ? [...window.availableWidgets] : [];
  const categories = {};
  widgets.forEach(def => {
    const cat = def.metadata?.category || 'Other';
    (categories[cat] ||= []).push(def);
  });
  const render = () => {
    const term = searchInput.value.toLowerCase();
    container.innerHTML = '';
    Object.keys(categories).sort().forEach(cat => {
      const section = document.createElement('div');
      section.className = 'widgets-category';
      const title = document.createElement('div');
      title.className = 'category-title';
      title.textContent = cat;
      section.appendChild(title);
      const list = document.createElement('div');
      list.className = 'widgets-list';
      categories[cat].forEach(def => {
        const label = def.metadata?.label || def.id;
        if (term && !label.toLowerCase().includes(term)) return;
        const card = document.createElement('div');
        card.className = 'widget-card';
        if (def.metadata?.icon) {
          const img = document.createElement('img');
          img.src = def.metadata.icon;
          img.className = 'icon';
          img.alt = '';
          card.appendChild(img);
        }
        const span = document.createElement('span');
        span.textContent = label;
        card.appendChild(span);
        card.addEventListener('click', () => addWidget(def));
        card.draggable = true;
        card.addEventListener('dragstart', ev => {
          ev.dataTransfer.setData('text/plain', def.id);
          ev.dataTransfer.effectAllowed = 'copy';
        });
        list.appendChild(card);
      });
      if (list.children.length) {
        section.appendChild(list);
        container.appendChild(section);
      }
    });
  };
  searchInput.addEventListener('input', render);
  render();
}

function toggle(open) {
  if (!panel) createPanel();
  const isOpen = typeof open === 'boolean' ? open : !panel.classList.contains('open');
  panel.classList.toggle('open', isOpen);
}

// kleine Helfer-API, damit externe Buttons es aufrufen können
export function openWidgetsPanel(forceOpen = true) {
  toggle(forceOpen);
}

document.addEventListener('ui:widgets:toggle', ev => toggle(ev.detail?.open));

document.addEventListener('click', ev => {
  if (!panel || !panel.classList.contains('open')) return;
  const clickedToggle = toggleBtn && (toggleBtn === ev.target || toggleBtn.contains(ev.target));
  if (!panel.contains(ev.target) && !clickedToggle) toggle(false);
});

document.addEventListener('DOMContentLoaded', () => {
  if (document.body.classList.contains('dashboard-edit-mode')) {
    createPanel();
  }
});

async function addWidget(def, pos = {}) {
  const grid = window.adminGrid;
  if (!grid || !def) return;
  const x = Number.isFinite(pos.x) ? pos.x : 0;
  const y = Number.isFinite(pos.y) ? pos.y : 0;
  const wrapper = grid.addWidget({ x, y, w: 8, h: DEFAULT_ADMIN_ROWS });
  wrapper.dataset.widgetId = def.id;
  wrapper.dataset.instanceId = `w${Math.random().toString(36).slice(2, 8)}`;
  const content = document.createElement('div');
  content.className = 'canvas-item-content';
  wrapper.appendChild(content);
  let instance = null;
  try {
    const res = await window.meltdownEmit('getWidgetInstance', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'plainspace',
      moduleType: 'core',
      instanceId: `default.${def.id}`
    });
    instance = res?.content ? JSON.parse(res.content) : null;
    applyWidgetOptions(wrapper, instance, grid);
  } catch {
    /* ignore */
  }
  const { renderWidget } = await import(
    /* webpackIgnore: true */ '/plainspace/widgets/widgetRenderer.js'
  );
  await renderWidget(wrapper, def, null, instance);
  attachDashboardControls(wrapper, grid);
  if (document.body.classList.contains('dashboard-edit-mode')) {
    grid.select(wrapper);
  }
  document.dispatchEvent(
    new CustomEvent('ui:widget:add', { detail: { type: def.id } })
  );
}

window.addDashboardWidget = addWidget;
