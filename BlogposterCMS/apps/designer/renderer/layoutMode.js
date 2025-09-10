import { STRINGS } from '../i18n.js';
import { fetchPartial } from '../fetchPartial.js';
import { sanitizeHtml } from '../../../public/plainspace/sanitizer.js';
import { getWidgetIcon } from './renderUtils.js';

let widgetsPanelTemplate = '';
let layoutPanelHtml = null;

export function initLayoutMode(sidebarEl) {
  widgetsPanelTemplate = sidebarEl.innerHTML;
}

export function populateWidgetsPanel(sidebarEl, allWidgets, iconMap = {}) {
  sidebarEl.innerHTML = widgetsPanelTemplate;
  const dragWrap = sidebarEl.querySelector('.drag-icons');
  if (dragWrap) {
    dragWrap.innerHTML = allWidgets.map(w => `
    <div class="sidebar-item drag-widget-icon" draggable="true" data-widget-id="${w.id}">
      ${getWidgetIcon(w, iconMap)}
      <span class="label">${w.metadata.label}</span>
    </div>
  `).join('');
    dragWrap.querySelectorAll('.drag-widget-icon').forEach(icon => {
      icon.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', icon.dataset.widgetId);
      });
    });
  }
}

async function showLayoutPanel(sidebarEl) {
  if (!layoutPanelHtml) {
    try {
      layoutPanelHtml = sanitizeHtml(await fetchPartial('layout-panel'));
    } catch (e) {
      layoutPanelHtml = '<nav class="sidebar-nav layout-panel"></nav>';
    }
  }
  sidebarEl.innerHTML = layoutPanelHtml;
  const titleEl = sidebarEl.querySelector('.layout-panel-title');
  if (titleEl) titleEl.textContent = STRINGS.layoutPanelTitle;
  const soonEl = sidebarEl.querySelector('.layout-panel-coming-soon');
  if (soonEl) soonEl.textContent = STRINGS.layoutPanelComingSoon;
  const arrangeText = sidebarEl.querySelector('.arrange-label-text');
  if (arrangeText) arrangeText.textContent = STRINGS.arrangeMode;
}

function showLayoutPill(ctx) {
  if (document.getElementById('layoutModePill')) return;
  const pill = document.createElement('div');
  pill.id = 'layoutModePill';
  pill.className = 'layout-mode-pill';
  pill.innerHTML = `
      <span>${STRINGS.layoutEditor}</span>
      <button type="button" class="pill-save">${STRINGS.save}</button>
      <button type="button" class="pill-close">${STRINGS.close}</button>
    `;
  const header = document.getElementById('builder-header');
  (header || document.body).appendChild(pill);
  const saveBtn = pill.querySelector('.pill-save');
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      try {
        await ctx.saveDesign({
          name: (document.getElementById('layoutNameInput')?.value || '').trim(),
          gridEl: ctx.gridEl,
          layoutRoot: ctx.layoutRoot,
          getCurrentLayoutForLayer: ctx.getCurrentLayoutForLayer,
          getActiveLayer: ctx.getActiveLayer,
          ensureCodeMap: ctx.ensureCodeMap,
          capturePreview: ctx.capturePreview,
          updateAllWidgetContents: ctx.updateAllWidgetContents,
          ownerId: ctx.getAdminUserId(),
          pageId: ctx.pageId,
          isLayout: true,
          isGlobal: true
        });
        alert('Layout template saved');
      } catch (err) {
        alert('Save failed: ' + err.message);
      }
    });
  }
  const closeBtn = pill.querySelector('.pill-close');
  if (closeBtn) closeBtn.addEventListener('click', () => ctx.switchLayer(1));
}

function hideLayoutPill() {
  const pill = document.getElementById('layoutModePill');
  if (pill) pill.remove();
}

export async function startLayoutMode(ctx) {
  await showLayoutPanel(ctx.sidebarEl);
  ctx.hideToolbar();
  if (ctx.gridEl) ctx.gridEl.style.pointerEvents = 'none';
  try { ctx.refreshContainerBars?.(); } catch (e) { }
  try { ctx.refreshLayoutTree?.(); } catch (e) { }
  showLayoutPill(ctx);
}

export function stopLayoutMode(ctx) {
  populateWidgetsPanel(ctx.sidebarEl, ctx.allWidgets, ctx.ICON_MAP);
  if (ctx.gridEl) ctx.gridEl.style.pointerEvents = '';
  ctx.showToolbar();
  hideLayoutPill();
}
