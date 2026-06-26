import { STRINGS } from '../i18n.js';
import { showPlacementPicker } from './placementPicker.js';

export function attachContainerBar(el, ctx) {
  if (!el || el.dataset.split === 'true') return;
  let bar = el.querySelector('.container-actionbar');
  if (bar) bar.remove();
  bar = document.createElement('div');
  bar.className = 'container-actionbar';

  const makeBtn = (cls, icon, title, handler) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = cls;
    if (title) {
      btn.title = title;
      btn.setAttribute('aria-label', title);
    }
    const img = document.createElement('img');
    img.src = `/assets/icons/${icon}.svg`;
    img.alt = title || icon;
    img.className = 'icon';
    btn.appendChild(img);
    if (handler) btn.addEventListener('click', ev => {
      ev.stopPropagation();
      handler(ev);
    });
    return btn;
  };

  const addBtn = makeBtn('bar-add', 'plus', STRINGS.containerAdd, () => {
    showPlacementPicker(el, pos => ctx.placeContainer(el, pos));
  });
  const hostBtn = makeBtn('bar-host', 'star', STRINGS.containerHost, () => ctx.setDynamicHost(el));
  const designBtn = makeBtn('bar-design', 'file', STRINGS.containerDesign, () => {
    const id = prompt(STRINGS.containerDesignPrompt);
    if (id) ctx.setDesignRef(el, id.trim());
  });
  const delBtn = makeBtn('bar-delete', 'trash', STRINGS.containerDelete, () => ctx.deleteContainer(el));
  const bgBtn = makeBtn('bar-bg', 'palette', STRINGS.containerBg);
  bgBtn.disabled = true;
  const htmlBtn = makeBtn('bar-html', 'code', STRINGS.containerHtml);
  htmlBtn.disabled = true;

  if (el.dataset.workarea === 'true') hostBtn.classList.add('active');
  if (el.dataset.designRef) designBtn.classList.add('active');

  bar.append(addBtn, hostBtn, designBtn, delBtn, bgBtn, htmlBtn);
  el.prepend(bar);
}
