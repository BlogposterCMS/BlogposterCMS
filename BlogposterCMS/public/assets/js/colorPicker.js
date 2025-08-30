export const presetColors = [
  '#FF0000', '#FF4040', '#FFC0CB', '#FF00FF', '#800080', '#8A2BE2',
  '#00CED1', '#00FFFF', '#40E0D0', '#ADD8E6', '#4169E1', '#0047AB',
  '#008000', '#7CFC00', '#BFFF00', '#FFFF00', '#FFDAB9', '#FFA500',
  '#000000', '#A9A9A9', '#808080'
];

export function createColorPicker(options = {}) {
  const {
    presetColors: customPresets = presetColors,
    recentColors = options.userColors || [],
    documentColors = [],
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

  function createCircle(c, editable = false) {
    if (!c) return null;
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
      if (editable) {
        editingCircle = circle;
        hexInput.value = selectedColor;
        hueWheel.style.borderColor = selectedColor;
        hueWrapper.classList.remove('hidden');
      } else {
        hueWrapper.classList.add('hidden');
        editingCircle = null;
      }
    });
    return circle;
  }

  function createSection(colors, label, opts = {}) {
    const { editable = false } = opts;
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
    let visible = colors;
    let hidden = [];
    if (colors.length > 18) {
      visible = colors.slice(0, 18);
      hidden = colors.slice(18);
    }
    visible.forEach(c => {
      const circle = createCircle(c, editable);
      if (circle) section.appendChild(circle);
    });
    wrapper.appendChild(section);
    if (hidden.length) {
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'show-more';
      more.textContent = 'Mehr anzeigen';
      more.addEventListener('click', () => {
        hidden.forEach(c => {
          const circle = createCircle(c, editable);
          if (circle) section.appendChild(circle);
        });
        more.remove();
      });
      wrapper.appendChild(more);
    }
    container.appendChild(wrapper);
    return section;
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
  let editingCircle = null;
  const handleColorChange = color => {
    selectedColor = color;
    hexInput.value = color;
    hueWheel.style.borderColor = color;
    container.querySelectorAll('.color-circle').forEach(n => n.classList.remove('active'));
    if (editingCircle) {
      editingCircle.dataset.color = color;
      editingCircle.style.backgroundColor = color;
      editingCircle.classList.add('active');
    } else {
      addRecentColor(color);
      const circle = recentSection.querySelector(`.color-circle[data-color="${color}"]`);
      if (circle) circle.classList.add('active');
    }
    onSelect(selectedColor);
  };
  hexInput.addEventListener('input', () => {
    const val = sanitize(hexInput.value.trim());
    if (val.length === 7) handleColorChange(val);
  });
  hexInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      hueWrapper.classList.add('hidden');
      editingCircle = null;
    }
  });
  hueWheel.addEventListener('click', e => {
    const rect = hueWheel.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const angle = Math.atan2(y, x) * (180 / Math.PI);
    const hue = (angle + 360) % 360;
    const color = hslToHex(hue, 100, 50);
    handleColorChange(color);
    hueWrapper.classList.add('hidden');
    editingCircle = null;
  });
  hueWrapper.appendChild(hueWheel);
  hueWrapper.appendChild(hexInput);
  container.appendChild(hueWrapper);

  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'color-search';
  search.placeholder = 'Try "blue" or "#00c4cc"';
  const normalizeColor = val => {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillStyle = val;
    const computed = ctx.fillStyle;
    return /^#[0-9a-fA-F]{6}$/.test(computed) ? computed.toUpperCase() : null;
  };
  search.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const col = normalizeColor(search.value.trim());
      if (col) {
        handleColorChange(col);
        hueWrapper.classList.add('hidden');
        editingCircle = null;
        search.value = '';
      }
    }
  });
  container.appendChild(search);

  let recentHidden = [];
  let recentMoreBtn = null;
  function addRecentColor(color) {
    if (!color || recentColors.includes(color)) return;
    recentColors.unshift(color);
    const circle = createCircle(color, true);
    if (!circle) return;
    if (recentSection.querySelectorAll('.color-circle').length <= 18) {
      recentSection.appendChild(circle);
    } else {
      recentHidden.push(circle);
      if (!recentMoreBtn) {
        recentMoreBtn = document.createElement('button');
        recentMoreBtn.type = 'button';
        recentMoreBtn.className = 'show-more';
        recentMoreBtn.textContent = 'Mehr anzeigen';
        recentMoreBtn.addEventListener('click', () => {
          recentHidden.forEach(c => recentSection.appendChild(c));
          recentHidden.length = 0;
          recentMoreBtn.remove();
          recentMoreBtn = null;
        });
        recentSection.parentElement.appendChild(recentMoreBtn);
      }
    }
  }

  const recentSection = (() => {
    const wrapper = document.createElement('div');
    const lbl = document.createElement('span');
    lbl.className = 'color-section-label';
    lbl.textContent = 'Custom colours';
    wrapper.appendChild(lbl);
    const section = document.createElement('div');
    section.className = 'color-section';
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'color-circle add-custom';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', () => {
      editingCircle = null;
      hexInput.value = selectedColor;
      hueWheel.style.borderColor = selectedColor;
      hueWrapper.classList.remove('hidden');
    });
    section.appendChild(addBtn);
    recentColors.slice(0, 18).forEach(c => {
      const circle = createCircle(c, true);
      if (circle) section.appendChild(circle);
    });
    if (recentColors.length > 18) {
      recentHidden.push(...recentColors.slice(18).map(c => createCircle(c, true)).filter(Boolean));
      recentMoreBtn = document.createElement('button');
      recentMoreBtn.type = 'button';
      recentMoreBtn.className = 'show-more';
      recentMoreBtn.textContent = 'Mehr anzeigen';
      recentMoreBtn.addEventListener('click', () => {
        recentHidden.forEach(c => section.appendChild(c));
        recentHidden.length = 0;
        recentMoreBtn.remove();
        recentMoreBtn = null;
      });
      wrapper.appendChild(recentMoreBtn);
    }
    wrapper.appendChild(section);
    container.appendChild(wrapper);
    return section;
  })();

  createSection(documentColors, 'Document colours');
  createSection(customPresets, 'Default solid colours');
  createSection(themeColors, 'Brand Kit');

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
    if (newOpts.documentColors) {
      documentColors.splice(0, documentColors.length, ...newOpts.documentColors);
      // re-render document section
      const docWrapper = container.querySelectorAll('.color-section')[1];
      if (docWrapper) {
        docWrapper.innerHTML = '';
        newOpts.documentColors.forEach(c => {
          const circle = createCircle(c);
          if (circle) docWrapper.appendChild(circle);
        });
      }
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
