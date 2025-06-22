// public/assets/plainspace/widgets/public/basicwidgets/textBoxWidget.js
import { registerElement } from '../../main/globalTextEditor.js';

export function render(el, ctx = {}) {
  if (!el) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'widget-textbox';

  if (ctx.id) {
    wrapper.id = `text-widget-${ctx.id}`;
  }

  const editable = document.createElement('div');
  editable.className = 'editable';
  editable.textContent = 'Lorem ipsum dolor sit amet';

  if (ctx.id) {
    editable.id = `text-widget-${ctx.id}-editable`;
  }

  wrapper.appendChild(editable);


  const shield = document.createElement('div');
  shield.className = 'hit-layer';
  Object.assign(shield.style, {
    position: 'absolute',
    inset: '0',
    background: 'transparent',
    cursor: 'move',
    pointerEvents: 'auto',
    zIndex: '5'
  });
  wrapper.style.position = 'relative';
  wrapper.appendChild(shield);

  el.innerHTML = '';
  el.appendChild(wrapper);

  registerElement(editable);
}
