//public/assets/plainspace/public/basicwidgets/textBoxWidget.js
import { registerElement } from '../../../js/globalTextEditor.js';

export function render(el) {
  if (!el) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'textbox-widget';

  const p = document.createElement('p');
  const span = document.createElement('span');
  span.textContent = 'Lorem ipsum dolor sit amet';
  p.appendChild(span);
  wrapper.appendChild(p);


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

  registerElement(span);
}
