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
    themeColors = []
  } = options;

  let selectedColor = options.initialColor || customPresets[0];
  let onSelect = options.onSelect || (() => {});
  let onClose = options.onClose || (() => {});
  const container = document.createElement('div');
  container.className = 'color-picker';

  function hide() {
    container.classList.add('hidden');
    onClose();
  }

  function showAt(x, y) {
    container.style.left = x + 'px';
    container.style.top = y + 'px';
    container.classList.remove('hidden');
  }

  function createSection(colors, label, allowCustom = false) {
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
      circle.dataset.color = c;
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
    if (allowCustom) {
      const addCustom = document.createElement('button');
      addCustom.type = 'button';
      addCustom.className = 'color-circle add-custom';
      addCustom.textContent = '+';
      addCustom.addEventListener('click', () => {
        hueWrapper.classList.remove('hidden');
      });
      section.appendChild(addCustom);
    }
    wrapper.appendChild(section);
    container.appendChild(wrapper);
  }

  function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (0 <= h && h < 60) { r = c; g = x; }
    else if (60 <= h && h < 120) { r = x; g = c; }
    else if (120 <= h && h < 180) { g = c; b = x; }
    else if (180 <= h && h < 240) { g = x; b = c; }
    else if (240 <= h && h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const toHex = v => Math.round((v + m) * 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  const hueWrapper = document.createElement('div');
  hueWrapper.className = 'hue-wrapper hidden';
  const hueWheel = document.createElement('div');
  hueWheel.className = 'hue-wheel';
  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'hue-hex';
  hexInput.value = selectedColor;
  const sanitize = val => (/^#[0-9a-fA-F]{3,8}$/.test(val) ? val : selectedColor);
  hexInput.addEventListener('input', () => {
    const val = sanitize(hexInput.value.trim());
    selectedColor = val;
    hueWheel.style.borderColor = val;
    container.querySelectorAll('.color-circle').forEach(n => n.classList.remove('active'));
    onSelect(selectedColor);
  });
  hueWheel.addEventListener('click', e => {
    const rect = hueWheel.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const angle = Math.atan2(y, x) * (180 / Math.PI);
    const hue = (angle + 360) % 360;
    const color = hslToHex(hue, 100, 50);
    selectedColor = color;
    hexInput.value = color;
    hueWheel.style.borderColor = color;
    container.querySelectorAll('.color-circle').forEach(n => n.classList.remove('active'));
    onSelect(selectedColor);
  });
  hueWrapper.appendChild(hueWheel);
  hueWrapper.appendChild(hexInput);
  container.appendChild(hueWrapper);

  createSection(customPresets, 'Presets', true);
  createSection(userColors, 'Your colors');
  createSection(themeColors, 'Theme');

  function updateOptions(newOpts = {}) {
    if (newOpts.onSelect) onSelect = newOpts.onSelect;
    if (newOpts.onClose) onClose = newOpts.onClose;
    if (newOpts.initialColor) {
      selectedColor = newOpts.initialColor;
      const circles = Array.from(container.querySelectorAll('.color-circle'));
      let found = false;
      circles.forEach(btn => {
        const match = btn.dataset.color === selectedColor;
        btn.classList.toggle('active', match);
        if (match) found = true;
      });
      if (!found) {
        circles.forEach(btn => btn.classList.remove('active'));
      }
      hexInput.value = selectedColor;
      hueWheel.style.borderColor = selectedColor;
    }
  }

  return {
    el: container,
    getColor() {
      return selectedColor;
    },
    showAt,
    hide,
    updateOptions
  };
}
