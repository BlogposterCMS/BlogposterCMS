import { renderWidget } from '../widgets/widgetRenderer.js';
import { wrapCss } from '../utils.js';
import { extractCssProps, makeSelector } from './renderUtils.js';

export function attachEditButton(el, widgetDef, codeMap, pageId, scheduleAutosave) {
  const btn = document.createElement('button');
  btn.className = 'widget-edit';
  btn.innerHTML = window.featherIcon ? window.featherIcon('settings') : '<img src="/assets/icons/settings.svg" alt="pro" />';
  btn.addEventListener('click', async e => {
    e.stopPropagation();
    let overlay = el.__codeEditor;
    let htmlEl, cssEl, jsEl;
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'widget-code-editor';
      overlay.dataset.instanceId = el.dataset.instanceId;
      overlay.innerHTML = `
          <div class="editor-inner">
            <label>HTML</label>
            <textarea class="editor-html"></textarea>
            <label>CSS</label>
            <textarea class="editor-css"></textarea>
            <label>JS</label>
            <textarea class="editor-js"></textarea>
            <div class="editor-actions">
              <button class="media-btn">Insert Image</button>
              <button class="save-btn">Save</button>
              <button class="reset-btn">Reset to Default</button>
              <button class="cancel-btn">Cancel</button>
            </div>
          </div>`;
      document.body.appendChild(overlay);

      htmlEl = overlay.querySelector('.editor-html');
      cssEl = overlay.querySelector('.editor-css');
      jsEl = overlay.querySelector('.editor-js');
      const mediaBtn = overlay.querySelector('.media-btn');
      const updateRender = () => {
        const finalCss = wrapCss(cssEl.value, overlay.currentSelector);
        renderWidget(el, widgetDef, codeMap, {
          html: htmlEl.value,
          css: finalCss,
          js: jsEl.value
        });
      };

      htmlEl.addEventListener('input', updateRender);
      cssEl.addEventListener('input', updateRender);
      jsEl.addEventListener('input', updateRender);

      mediaBtn.addEventListener('click', async () => {
        try {
          const { shareURL } = await window.meltdownEmit('openMediaExplorer', { jwt: window.ADMIN_TOKEN });
          if (shareURL) {
            const ta = htmlEl;
            const start = ta.selectionStart || 0;
            const end = ta.selectionEnd || 0;
            const safeUrl = shareURL.replace(/"/g, '&quot;');
            const imgTag = `<img src="${safeUrl}" alt="" />`;
            ta.value = ta.value.slice(0, start) + imgTag + ta.value.slice(end);
            ta.focus();
            ta.setSelectionRange(start + imgTag.length, start + imgTag.length);
            updateRender();
          }
        } catch (err) {
          console.error('[Designer] openMediaExplorer error', err);
        }
      });

      overlay.updateRender = updateRender;
      el.__codeEditor = overlay;
    } else {
      overlay.dataset.instanceId = el.dataset.instanceId;
      htmlEl = overlay.querySelector('.editor-html');
      cssEl = overlay.querySelector('.editor-css');
      jsEl = overlay.querySelector('.editor-js');
      const mediaBtn = overlay.querySelector('.media-btn');
      overlay.updateRender = () => {
        const finalCss = wrapCss(cssEl.value, overlay.currentSelector);
        renderWidget(el, widgetDef, codeMap, {
          html: htmlEl.value,
          css: finalCss,
          js: jsEl.value
        });
      };
      mediaBtn.onclick = async () => {
        try {
          const { shareURL } = await window.meltdownEmit('openMediaExplorer', { jwt: window.ADMIN_TOKEN });
          if (shareURL) {
            const ta = htmlEl;
            const start = ta.selectionStart || 0;
            const end = ta.selectionEnd || 0;
            const safeUrl = shareURL.replace(/"/g, '&quot;');
            const imgTag = `<img src="${safeUrl}" alt="" />`;
            ta.value = ta.value.slice(0, start) + imgTag + ta.value.slice(end);
            ta.focus();
            ta.setSelectionRange(start + imgTag.length, start + imgTag.length);
            overlay.updateRender && overlay.updateRender();
          }
        } catch (err) {
          console.error('[Designer] openMediaExplorer error', err);
        }
      };
    }
    const instId = el.dataset.instanceId;
    const codeData = codeMap && codeMap[instId] ? { ...codeMap[instId] } : {};

    if (!codeData.sourceJs) {
      try {
        const resp = await window.fetchWithTimeout(new URL(widgetDef.codeUrl, document.baseURI).href);
        codeData.sourceJs = await resp.text();
      } catch (err) {
        console.error('[Designer] fetch widget source error', err);
        codeData.sourceJs = '';
      }
    }
    if (codeData.html) {
      htmlEl.value = codeData.html;
    } else {
      const root = el.querySelector('.canvas-item-content');
      const container = root?.querySelector('.widget-container');
      htmlEl.value = container ? container.innerHTML.trim() : '';
    }
    overlay.querySelector('.editor-css').value = codeData.css || '';
    jsEl.value = codeData.js || '';
    overlay.defaultJs = codeData.sourceJs || '';
    overlay.currentSelector = codeData.selector || '';

    function pickElement() {
      const root = el.querySelector('.canvas-item-content');
      if (!root) return;
      const handler = ev => {
        ev.preventDefault();
        ev.stopPropagation();
        overlay.currentSelector = makeSelector(ev.target);
        overlay.querySelector('.editor-css').value = extractCssProps(ev.target);
        overlay.updateRender && overlay.updateRender();
        root.removeEventListener('click', handler, true);
      };
      root.addEventListener('click', handler, true);
    }

    pickElement();

    const rect = el.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft = rect.left;
    overlay.classList.remove('left', 'right');
    overlay.style.display = 'block';
    overlay.style.visibility = 'hidden';
    overlay.style.top = `${rect.top}px`;
    if (spaceRight >= 300 || spaceRight >= spaceLeft) {
      overlay.classList.add('right');
      overlay.style.left = `${rect.right + 8}px`;
    } else {
      overlay.classList.add('left');
      const left = rect.left - overlay.offsetWidth - 8;
      overlay.style.left = `${Math.max(0, left)}px`;
    }
    overlay.style.visibility = '';

    overlay.updateRender && overlay.updateRender();
    overlay.querySelector('.save-btn').onclick = () => {
      const instId = el.dataset.instanceId;
      if (codeMap) {
        codeMap[instId] = {
          html: htmlEl.value,
          css: wrapCss(cssEl.value, overlay.currentSelector),
          js: jsEl.value,
          selector: overlay.currentSelector
        };
      }
      overlay.style.display = 'none';
      renderWidget(el, widgetDef, codeMap);
      const grid = el.closest('.pixel-grid, .canvas-grid')?.__grid;
      grid?.emitChange?.(el, { contentOnly: true });
      if (pageId) scheduleAutosave();
    };
    overlay.querySelector('.reset-btn').onclick = () => {
      if (!confirm('Do you really want to reset all customizations?')) return;
      const instId = el.dataset.instanceId;
      if (codeMap) delete codeMap[instId];
      htmlEl.value = '';
      overlay.querySelector('.editor-css').value = '';
      overlay.querySelector('.editor-js').value = overlay.defaultJs || '';
      overlay.currentSelector = '';
      overlay.updateRender && overlay.updateRender();
      const grid = el.closest('.pixel-grid, .canvas-grid')?.__grid;
      grid?.emitChange?.(el, { contentOnly: true });
      if (pageId) scheduleAutosave();
    };
    overlay.querySelector('.cancel-btn').onclick = () => {
      overlay.style.display = 'none';
    };
  });
  el.appendChild(btn);
  return btn;
}

export function attachRemoveButton(el, grid, pageId, scheduleAutosave) {
  const btn = document.createElement('button');
  btn.className = 'widget-remove';
  btn.innerHTML = window.featherIcon ? window.featherIcon('x') : '<img src="/assets/icons/x.svg" alt="remove" />';
  btn.addEventListener('click', e => {
    e.stopPropagation();
    grid.removeWidget(el);
    if (pageId) scheduleAutosave();
  });
  el.appendChild(btn);
  return btn;
}

export function attachResizeButton(el, grid) {
  const btn = document.createElement('button');
  btn.className = 'widget-resize';
  btn.dataset.state = 'small';
  const setIcon = () => {
    btn.innerHTML = window.featherIcon
      ? window.featherIcon(btn.dataset.state === 'small' ? 'maximize' : 'minimize')
      : '';
  };
  setIcon();

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const w = parseInt(el.getAttribute('gs-w')) || 4;
    const newW = w <= 4 ? 8 : 4;
    grid.update(el, { w: newW });
    btn.dataset.state = newW <= 4 ? 'small' : 'large';
    setIcon();
    grid._updateGridHeight();
    grid.emitChange(el);
  });

  el.appendChild(btn);
  return btn;
}

export function attachLockOnClick(el, selectWidget) {
  el.addEventListener('click', e => {
    e.stopPropagation();
    if (selectWidget) selectWidget(el);
  });
}
