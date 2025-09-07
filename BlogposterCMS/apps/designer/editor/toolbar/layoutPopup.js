import { enterSplitMode } from '../modes/splitMode.js';

let popup;
let escHandler;

function ensurePopup() {
  if (popup) return popup;
  popup = document.createElement('div');
  popup.className = 'layout-popup';
  popup.innerHTML = `
      <div class="layout-popup-content">
        <h4>Choose layout</h4>
        <div class="layout-current">
          <div class="layout-preview"></div>
          <p class="layout-info">Current global layout</p>
        </div>
        <div class="layout-popup-actions">
          <button type="button" class="layout-use-current">Use Global Layout</button>
          <button type="button" class="layout-create-new">+ New Layout</button>
        </div>
      </div>`;
  popup.addEventListener('click', ev => {
    if (ev.target === popup) hideLayoutPopup();
  });
  const useBtn = popup.querySelector('.layout-use-current');
  const newBtn = popup.querySelector('.layout-create-new');
  const handle = () => {
    hideLayoutPopup();
    const ctx = popup._ctx || {};
    if (ctx.rootEl) enterSplitMode({ rootEl: ctx.rootEl, onChange: ctx.onChange });
  };
  useBtn?.addEventListener('click', handle);
  newBtn?.addEventListener('click', handle);
  document.body.appendChild(popup);
  return popup;
}

export function showLayoutPopup({ rootEl, onChange } = {}) {
  const el = ensurePopup();
  el._ctx = { rootEl, onChange };
  el.classList.add('show');
  escHandler = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); hideLayoutPopup(); } };
  document.addEventListener('keydown', escHandler, true);
}

export function hideLayoutPopup() {
  popup?.classList.remove('show');
  if (escHandler) {
    document.removeEventListener('keydown', escHandler, true);
    escHandler = null;
  }
}
