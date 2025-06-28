import { renderWidget } from '../builder/widgets/widgetRenderer.js';

const DEFAULT_ADMIN_ROWS = 20;
let overlay;

function applyWidgetOptions(wrapper, opts = {}) {
  if (!opts) return;
  if (opts.max) wrapper.classList.add('max');
  if (opts.maxWidth) wrapper.classList.add('max-width');
  if (opts.maxHeight) wrapper.classList.add('max-height');
  if (opts.halfWidth) wrapper.classList.add('half-width');
  if (opts.thirdWidth) wrapper.classList.add('third-width');
  if (typeof opts.width === 'number') {
    wrapper.style.width = `${opts.width}%`;
  }
  if (typeof opts.height === 'number') {
    wrapper.style.height = `${opts.height}%`;
  }
  if (opts.overflow) wrapper.classList.add('overflow');
}

export function showWidgetPopup() {
  const widgets = Array.isArray(window.availableWidgets) ?
    [...window.availableWidgets] : [];
  if (!widgets.length) return;
  widgets.sort((a, b) => {
    const la = (a.metadata?.label || a.id).toLowerCase();
    const lb = (b.metadata?.label || b.id).toLowerCase();
    return la.localeCompare(lb);
  });

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'widget-popup-overlay';
    overlay.className = 'widget-popup-overlay';
    overlay.innerHTML = '<div class="widget-popup-container"></div>';
    document.body.appendChild(overlay);
  }

  const container = overlay.querySelector('.widget-popup-container');
  container.innerHTML = '';

  widgets.forEach(def => {
    const item = document.createElement('div');
    item.className = 'widget-popup-item';

    const preview = document.createElement('div');
    preview.className = 'widget-preview';
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-item';
    wrapper.dataset.instanceId = `prev-${def.id}`;
    wrapper.dataset.widgetId = def.id;
    const content = document.createElement('div');
    content.className = 'canvas-item-content';
    wrapper.appendChild(content);
    preview.appendChild(wrapper);
    item.appendChild(preview);

    renderWidget(content, def, null, 'admin');

    const title = document.createElement('div');
    title.className = 'widget-title';
    title.textContent = def.metadata?.label || def.id;
    item.appendChild(title);

    const btn = document.createElement('button');
    btn.className = 'widget-add-btn';
    btn.innerHTML = window.featherIcon ? window.featherIcon('arrow-right') :
      '<img src="/assets/icons/arrow-right.svg" class="icon" alt="add" />';
    btn.addEventListener('click', () => addWidget(def));
    item.appendChild(btn);

    container.appendChild(item);
  });

  overlay.style.display = 'block';
  document.body.classList.add('widget-popup-open');
}

export function hideWidgetPopup() {
  if (overlay) overlay.style.display = 'none';
  document.body.classList.remove('widget-popup-open');
}

async function addWidget(def) {
  const grid = window.adminGrid;
  if (!grid) return;
  const wrapper = grid.addWidget({ x: 0, y: 0, w: 8, h: DEFAULT_ADMIN_ROWS });
  wrapper.dataset.widgetId = def.id;
  wrapper.dataset.instanceId = `w${Math.random().toString(36).slice(2, 8)}`;
  const content = document.createElement('div');
  content.className = 'canvas-item-content';
  wrapper.appendChild(content);
  try {
    const res = await window.meltdownEmit('getWidgetInstance', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'plainspace',
      moduleType: 'core',
      instanceId: `default.${def.id}`
    });
    const opts = res?.content ? JSON.parse(res.content) : null;
    applyWidgetOptions(wrapper, opts);
  } catch {}
  renderWidget(content, def, null, 'admin');
  hideWidgetPopup();
}
