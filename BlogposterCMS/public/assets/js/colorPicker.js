export const presetColors = [
  '#FF0000', '#FF4040', '#FFC0CB', '#FF00FF', '#800080', '#8A2BE2',
  '#00CED1', '#00FFFF', '#40E0D0', '#ADD8E6', '#4169E1', '#0047AB',
  '#008000', '#7CFC00', '#BFFF00', '#FFFF00', '#FFDAB9', '#FFA500',
  '#000000', '#A9A9A9', '#808080'
];

export function createColorPicker(options = {}) {
  const {
    presetColors: customPresets = presetColors,
    userColors = [],
    themeColors = [],
    initialColor = customPresets[0],
    onSelect = () => {},
    onClose = () => {}
  } = options;

  let selectedColor = initialColor;
  const container = document.createElement('div');
  container.className = 'color-picker';

  function hide() {
    container.classList.add('hidden');
  }

  function showAt(x, y) {
    container.style.left = x + 'px';
    container.style.top = y + 'px';
    container.classList.remove('hidden');
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'color-picker-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.addEventListener('click', () => {
    hide();
    onClose();
  });
  container.appendChild(closeBtn);

  function createSection(colors, label) {
    if (!colors || !colors.length) return;
    const wrapper = document.createElement('div');
    const section = document.createElement('div');
    section.className = 'color-section';
    if (label) {
      const lbl = document.createElement('span');
      lbl.className = 'color-section-label';
      lbl.textContent = label;
      wrapper.appendChild(lbl);
    }
    colors.forEach(c => {
      if (!c) return;
      const circle = document.createElement('button');
      circle.type = 'button';
      circle.className = 'color-circle';
      circle.style.backgroundColor = c;
      if (c === selectedColor) circle.classList.add('active');
      circle.addEventListener('click', () => {
        selectedColor = c;
        container.querySelectorAll('.color-circle').forEach(n => n.classList.remove('active'));
        circle.classList.add('active');
        onSelect(selectedColor);
      });
      section.appendChild(circle);
    });
    const addCustom = document.createElement('button');
    addCustom.type = 'button';
    addCustom.className = 'color-circle add-custom';
    addCustom.textContent = '+';
    const input = document.createElement('div');
    input.className = 'color-input';
    input.contentEditable = 'true';
    input.textContent = selectedColor;
    const sanitize = val => (/^#[0-9a-fA-F]{3,8}$/.test(val) ? val : selectedColor);
    input.addEventListener('input', () => {
      const val = sanitize(input.textContent.trim());
      selectedColor = val;
      container.querySelectorAll('.color-circle').forEach(n => n.classList.remove('active'));
      addCustom.style.backgroundColor = selectedColor;
      addCustom.classList.add('active');
      onSelect(selectedColor);
    });
    addCustom.addEventListener('click', () => {
      input.focus();
    });
    section.appendChild(addCustom);
    section.appendChild(input);
    wrapper.appendChild(section);
    container.appendChild(wrapper);
  }

  createSection(customPresets, 'Presets');
  createSection(userColors, 'Your colors');
  createSection(themeColors, 'Theme');

  return {
    el: container,
    getColor() {
      return selectedColor;
    },
    showAt,
    hide
  };
}
