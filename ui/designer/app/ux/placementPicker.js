import { STRINGS } from '../i18n.js';

export function showPlacementPicker(targetEl, onPlace) {
  const picker = document.createElement('div');
  picker.className = 'placement-picker';
  const options = [
    { pos: 'top', label: STRINGS.placeTop },
    { pos: 'right', label: STRINGS.placeRight },
    { pos: 'bottom', label: STRINGS.placeBottom },
    { pos: 'left', label: STRINGS.placeLeft },
    { pos: 'inside', label: STRINGS.placeInside }
  ];

  const cleanup = () => {
    picker.remove();
    document.removeEventListener('click', outside, true);
    document.removeEventListener('keydown', esc, true);
  };
  const outside = e => { if (!picker.contains(e.target)) cleanup(); };
  const esc = e => { if (e.key === 'Escape') cleanup(); };

  options.forEach(o => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `pick-${o.pos}`;
    btn.textContent = o.label;
    btn.addEventListener('click', ev => {
      ev.stopPropagation();
      cleanup();
      onPlace(o.pos);
    });
    picker.appendChild(btn);
  });

  document.body.appendChild(picker);
  const rect = targetEl.getBoundingClientRect();
  picker.style.left = rect.left + rect.width / 2 + 'px';
  picker.style.top = rect.top + rect.height / 2 + 'px';

  document.addEventListener('click', outside, true);
  document.addEventListener('keydown', esc, true);
}
