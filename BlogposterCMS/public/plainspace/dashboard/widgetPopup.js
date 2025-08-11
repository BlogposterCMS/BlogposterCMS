import { applyWidgetOptions } from '../main/widgetOptions.js';

const DEFAULT_ADMIN_ROWS = 20;
let overlay;
let escBound = false;


/* ─────────── Popup ⇢ open ─────────── */
export async function showWidgetPopup() {
  ['top-header', 'main-header', 'pages-menu']
    .forEach(id => document.getElementById(id)?.classList.add('dimmed'));

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'widget-popup-overlay';
    overlay.className = 'widget-popup-overlay';
    overlay.innerHTML = `
      <div class="widget-popup-backdrop"></div>
      <div class="widget-popup-container"></div>`;
    overlay.querySelector('.widget-popup-backdrop')
           .addEventListener('click', hideWidgetPopup);
    document.body.appendChild(overlay);
  }

  if (!escBound) {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') hideWidgetPopup();
    });
    escBound = true;
  }

  const widgets = Array.isArray(window.availableWidgets)
    ? [...window.availableWidgets] : [];
  if (!widgets.length) return;

  widgets.sort((a, b) =>
    (a.metadata?.label || a.id).localeCompare(
      b.metadata?.label || b.id, undefined, { sensitivity: 'base' })
  );

  const container = overlay.querySelector('.widget-popup-container');
  container.innerHTML = '';

  /* build each card */
  for (const def of widgets) {
    const item     = document.createElement('div');
    item.className = 'widget-popup-item';

    const title = document.createElement('div');
    title.className = 'widget-title';
    title.textContent = def.metadata?.label || def.id;
    item.appendChild(title);

    const btn  = document.createElement('button');
    btn.className = 'widget-add-btn';
    btn.innerHTML = window.featherIcon
      ? window.featherIcon('arrow-right')
      : '<img src="/assets/icons/arrow-right.svg" class="icon" alt="add">';
    btn.addEventListener('click', () => addWidget(def));
    item.appendChild(btn);

    container.appendChild(item);
  }

  overlay.classList.add('open');
  document.body.classList.add('widget-popup-open');
}

/* ─────────── Popup ⇢ close ─────────── */
export function hideWidgetPopup() {
  overlay?.classList.remove('open');
  document.body.classList.remove('widget-popup-open');
  ['top-header', 'main-header', 'pages-menu']
    .forEach(id => document.getElementById(id)?.classList.remove('dimmed'));
}

/* ─────────── Add widget to grid ─────────── */
async function addWidget(def) {
  const grid = window.adminGrid;
  if (!grid) return;

  const wrapper = grid.addWidget({ x: 0, y: 0, w: 8, h: DEFAULT_ADMIN_ROWS });
  wrapper.dataset.widgetId   = def.id;
  wrapper.dataset.instanceId = `w${Math.random().toString(36).slice(2, 8)}`;

  const content = document.createElement('div');
  content.className = 'canvas-item-content';
  wrapper.appendChild(content);

  /* load default instance for sizing & data */
  let instance = null;
  try {
    const res = await window.meltdownEmit('getWidgetInstance', {
      jwt: window.ADMIN_TOKEN,
      moduleName: 'plainspace',
      moduleType: 'core',
      instanceId: `default.${def.id}`
    });
    instance = res?.content ? JSON.parse(res.content) : null;
    applyWidgetOptions(wrapper, instance, grid);        // apply max / width etc.
  } catch { /* ignore */ }

  const { renderWidget } = await import(
    /* webpackIgnore: true */ '/apps/plainspace/widgets/widgetRenderer.js'
  );
  await renderWidget(wrapper, def, null, instance);

  // Activate the widget immediately when added in edit mode
  if (document.body.classList.contains('dashboard-edit-mode')) {
    grid.select(wrapper);
  }
}
