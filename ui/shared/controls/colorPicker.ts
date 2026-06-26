export const presetColors: string[] = [
  '#FF0000', '#FF4040', '#FFC0CB', '#FF00FF', '#800080', '#8A2BE2',
  '#00CED1', '#00FFFF', '#40E0D0', '#ADD8E6', '#4169E1', '#0047AB',
  '#008000', '#7CFC00', '#BFFF00', '#FFFF00', '#FFDAB9', '#FFA500',
  '#000000', '#A9A9A9', '#808080'
];

export interface ColorPickerOptions {
  presetColors?: string[];
  recentColors?: string[];
  userColors?: string[];
  documentColors?: string[];
  themeColors?: string[];
  initialColor?: string;
  onSelect?: (color: string) => void;
  onClose?: () => void;
}

export interface ColorPickerInstance {
  el: HTMLDivElement;
  getColor(): string;
  showAt(x: number, y: number): void;
  hide(): void;
  updateOptions(newOpts?: ColorPickerOptions): void;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Rgba extends Rgb {
  a: number;
}

interface Hsv {
  h: number;
  s: number;
  v: number;
}

export function createColorPicker(options: ColorPickerOptions = {}): ColorPickerInstance {
  const customPresets = options.presetColors ?? presetColors;
  const recentColors = options.recentColors ?? options.userColors ?? [];
  const documentColors = options.documentColors ?? [];
  const themeColors = options.themeColors ?? [];

  let selectedColor = options.initialColor || customPresets[0] || '#000000';
  let onSelect = options.onSelect || (() => {});
  let onClose = options.onClose || (() => {});
  const container = document.createElement('div');
  container.className = 'color-picker';

  function hide(): void {
    container.classList.add('hidden');
    onClose();
  }

  function showAt(x: number, y: number): void {
    container.style.left = x + 'px';
    container.style.top = y + 'px';
    container.classList.remove('hidden');
  }

  function positionHueWrapper(target: Element): void {
    const rect = target.getBoundingClientRect();
    const contRect = container.getBoundingClientRect();
    hueWrapper.style.left = rect.left - contRect.left + 'px';
    hueWrapper.style.top = rect.bottom - contRect.top + 4 + 'px';
  }

  function createCircle(c: string, editable = false): HTMLButtonElement | null {
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
        editingIndex = recentColors.indexOf(c);
        setFromHex(selectedColor, false);
        positionHueWrapper(circle);
        hueWrapper.classList.remove('hidden');
      } else {
        hueWrapper.classList.add('hidden');
        editingCircle = null;
        editingIndex = null;
      }
    });
    return circle;
  }

  function createSection(
    colors: string[],
    label: string,
    opts: { editable?: boolean } = {}
  ): HTMLDivElement | undefined {
    const { editable = false } = opts;
    if (!colors || !colors.length) return undefined;
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
    let hidden: string[] = [];
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

  function hsvToRgb(h: number, s: number, v: number): Rgb {
    const c = v * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = v - c;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) {
      r = c;
      g = x;
    } else if (h < 120) {
      r = x;
      g = c;
    } else if (h < 180) {
      g = c;
      b = x;
    } else if (h < 240) {
      g = x;
      b = c;
    } else if (h < 300) {
      r = x;
      b = c;
    } else {
      r = c;
      b = x;
    }
    return {
      r: Math.round((r + m) * 255),
      g: Math.round((g + m) * 255),
      b: Math.round((b + m) * 255)
    };
  }

  function rgbToHsv(r: number, g: number, b: number): Hsv {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      switch (max) {
        case r:
          h = ((g - b) / d) % 6;
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        default:
          h = (r - g) / d + 4;
          break;
      }
      h *= 60;
      if (h < 0) h += 360;
    }
    const s = max === 0 ? 0 : d / max;
    const v = max;
    return { h, s, v };
  }

  function hexToRgba(hex: string): Rgba {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(h => h + h).join('');
    let a = 1;
    if (hex.length === 8) {
      a = parseInt(hex.slice(6, 8), 16) / 255;
      hex = hex.slice(0, 6);
    }
    const num = parseInt(hex, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return { r, g, b, a };
  }

  function hsvToHex(h: number, s: number, v: number, a = 1): string {
    const { r, g, b } = hsvToRgb(h, s, v);
    const toHex = (x: number): string => x.toString(16).padStart(2, '0');
    const alphaHex = a < 1 ? toHex(Math.round(a * 255)) : '';
    return `#${toHex(r)}${toHex(g)}${toHex(b)}${alphaHex}`.toUpperCase();
  }

  const hueWrapper = document.createElement('div');
  hueWrapper.className = 'hue-wrapper hidden';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'color-picker-close';
  closeBtn.innerHTML = '<img src="/assets/icons/x.svg" alt="close">';
  closeBtn.addEventListener('click', () => {
    hueWrapper.classList.add('hidden');
    editingCircle = null;
    editingIndex = null;
  });
  hueWrapper.appendChild(closeBtn);

  const colorArea = document.createElement('div');
  colorArea.className = 'cp-color-area';
  const colorCursor = document.createElement('div');
  colorCursor.className = 'cp-cursor';
  colorArea.appendChild(colorCursor);
  hueWrapper.appendChild(colorArea);

  const hueSlider = document.createElement('input');
  hueSlider.type = 'range';
  hueSlider.min = '0';
  hueSlider.max = '360';
  hueSlider.value = '0';
  hueSlider.className = 'cp-hue';
  hueWrapper.appendChild(hueSlider);

  const alphaSlider = document.createElement('input');
  alphaSlider.type = 'range';
  alphaSlider.min = '0';
  alphaSlider.max = '100';
  alphaSlider.value = '100';
  alphaSlider.className = 'cp-alpha';
  hueWrapper.appendChild(alphaSlider);

  const inputRow = document.createElement('div');
  inputRow.className = 'cp-input-row';
  const preview = document.createElement('div');
  preview.className = 'cp-preview';
  const previewColor = document.createElement('div');
  previewColor.className = 'cp-preview-color';
  preview.appendChild(previewColor);
  inputRow.appendChild(preview);
  const hexInput = document.createElement('input');
  hexInput.type = 'text';
  hexInput.className = 'cp-hex';
  inputRow.appendChild(hexInput);
  const dropper = document.createElement('button');
  dropper.type = 'button';
  dropper.className = 'cp-dropper';
  dropper.innerHTML = '<img src="/assets/icons/pipette.svg" alt="pick">';
  dropper.addEventListener('click', async () => {
    const EyeDropperCtor = window.EyeDropper;
    if (!EyeDropperCtor) return;
    try {
      const res = await new EyeDropperCtor().open();
      setFromHex(res.sRGBHex, true);
    } catch (_) {}
  });
  inputRow.appendChild(dropper);
  hueWrapper.appendChild(inputRow);

  const sanitize = (val: string): string | null => (
    /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(val) ? val : null
  );
  let editingCircle: HTMLButtonElement | null = null;
  let editingIndex: number | null = null;

  let hue = 0;
  let sat = 1;
  let val = 1;
  let alpha = 1;

  const handleColorChange = (color: string): void => {
    selectedColor = color;
    hexInput.value = color;
    previewColor.style.backgroundColor = color;
    container.querySelectorAll('.color-circle').forEach(n => n.classList.remove('active'));
    if (editingCircle) {
      const prev = editingCircle.dataset.color ?? '';
      editingCircle.dataset.color = color;
      editingCircle.style.backgroundColor = color;
      editingCircle.classList.add('active');
      if (editingIndex !== null) {
        recentColors[editingIndex] = color;
      } else {
        const idx = recentColors.indexOf(prev);
        if (idx !== -1) recentColors[idx] = color;
      }
    } else {
      addRecentColor(color);
      const circle = recentSection.querySelector(`.color-circle[data-color="${color}"]`);
      if (circle) circle.classList.add('active');
    }
    onSelect(selectedColor);
  };

  function updateFromState(trigger = true): void {
    const color = hsvToHex(hue, sat, val, alpha);
    colorArea.style.backgroundColor = `hsl(${hue}, 100%, 50%)`;
    colorCursor.style.left = sat * 100 + '%';
    colorCursor.style.top = (1 - val) * 100 + '%';
    alphaSlider.style.background = `linear-gradient(to right, rgba(255,255,255,0), ${hsvToHex(hue, sat, val)})`;
    alphaSlider.style.backgroundSize = '100% 100%';
    previewColor.style.backgroundColor = color;
    hexInput.value = color;
    if (trigger) handleColorChange(color);
  }

  function setFromHex(hex: string, trigger = false): void {
    const { r, g, b, a } = hexToRgba(hex);
    const hsv = rgbToHsv(r, g, b);
    hue = hsv.h;
    sat = hsv.s;
    val = hsv.v;
    alpha = a;
    hueSlider.value = String(hue);
    alphaSlider.value = String(Math.round(alpha * 100));
    updateFromState(trigger);
  }

  setFromHex(selectedColor, false);

  hueSlider.addEventListener('input', () => {
    hue = Number(hueSlider.value);
    updateFromState();
  });
  alphaSlider.addEventListener('input', () => {
    alpha = Number(alphaSlider.value) / 100;
    updateFromState();
  });
  let dragging = false;
  const handleSV = (e: PointerEvent): void => {
    const rect = colorArea.getBoundingClientRect();
    let x = (e.clientX - rect.left) / rect.width;
    let y = (e.clientY - rect.top) / rect.height;
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
    sat = x;
    val = 1 - y;
    updateFromState();
  };
  colorArea.addEventListener('pointerdown', e => {
    dragging = true;
    colorArea.setPointerCapture(e.pointerId);
    handleSV(e);
  });
  colorArea.addEventListener('pointermove', e => {
    if (dragging) handleSV(e);
  });
  colorArea.addEventListener('pointerup', e => {
    dragging = false;
    colorArea.releasePointerCapture(e.pointerId);
  });

  hexInput.addEventListener('input', () => {
    const valInput = sanitize(hexInput.value.trim());
    if (valInput) setFromHex(valInput, true);
  });
  hexInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      hueWrapper.classList.add('hidden');
      editingCircle = null;
      editingIndex = null;
    }
  });

  container.appendChild(hueWrapper);

  const search = document.createElement('input');
  search.type = 'text';
  search.className = 'color-search';
  search.placeholder = 'Try "blue" or "#00c4cc"';
  const normalizeColor = (input: string): string | null => {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#000';
    ctx.fillStyle = input;
    const computed = ctx.fillStyle;
    if (/^#[0-9a-fA-F]{6}$/.test(computed)) return computed.toUpperCase();
    const match = computed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d*(?:\.\d+)?))?\)$/);
    if (match) {
      const r = Number(match[1]);
      const g = Number(match[2]);
      const b = Number(match[3]);
      const a = match[4] !== undefined ? parseFloat(match[4]) : 1;
      const toHex = (x: number): string => x.toString(16).padStart(2, '0');
      const alphaHex = a < 1 ? toHex(Math.round(a * 255)) : '';
      return `#${toHex(r)}${toHex(g)}${toHex(b)}${alphaHex}`.toUpperCase();
    }
    return null;
  };
  search.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const col = normalizeColor(search.value.trim());
      if (col) {
        handleColorChange(col);
        hueWrapper.classList.add('hidden');
        editingCircle = null;
        editingIndex = null;
        search.value = '';
      }
    }
  });
  container.appendChild(search);

  let recentHidden: HTMLButtonElement[] = [];
  let recentMoreBtn: HTMLButtonElement | null = null;
  function addRecentColor(color: string, { dedupe = true }: { dedupe?: boolean } = {}): void {
    if (!color) return;
    if (dedupe) {
      const idx = recentColors.indexOf(color);
      if (idx !== -1) {
        recentColors.splice(idx, 1);
        const existing = recentSection.querySelector(`.color-circle[data-color="${color}"]`);
        existing?.remove();
      }
    }
    recentColors.unshift(color);
    const circle = createCircle(color, true);
    if (!circle) return;
    const addBtn = recentSection.querySelector('.add-custom');
    if (recentSection.querySelectorAll('.color-circle').length <= 18) {
      if (addBtn) {
        recentSection.insertBefore(circle, addBtn.nextSibling);
      } else {
        recentSection.appendChild(circle);
      }
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
          recentMoreBtn?.remove();
          recentMoreBtn = null;
        });
        recentSection.parentElement?.appendChild(recentMoreBtn);
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
      addRecentColor(selectedColor, { dedupe: false });
      editingCircle = recentSection.querySelector(`.color-circle[data-color="${selectedColor}"]`) as HTMLButtonElement | null;
      editingIndex = recentColors.indexOf(selectedColor);
      container.querySelectorAll('.color-circle').forEach(n => n.classList.remove('active'));
      editingCircle?.classList.add('active');
      setFromHex(selectedColor, false);
      positionHueWrapper(editingCircle || addBtn);
      hueWrapper.classList.remove('hidden');
    });
    section.appendChild(addBtn);
    recentColors.slice(0, 18).forEach(c => {
      const circle = createCircle(c, true);
      if (circle) section.appendChild(circle);
    });
    if (recentColors.length > 18) {
      recentHidden.push(...recentColors.slice(18).map(c => createCircle(c, true)).filter((c): c is HTMLButtonElement => Boolean(c)));
      recentMoreBtn = document.createElement('button');
      recentMoreBtn.type = 'button';
      recentMoreBtn.className = 'show-more';
      recentMoreBtn.textContent = 'Mehr anzeigen';
      recentMoreBtn.addEventListener('click', () => {
        recentHidden.forEach(c => section.appendChild(c));
        recentHidden.length = 0;
        recentMoreBtn?.remove();
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

  function updateOptions(newOpts: ColorPickerOptions = {}): void {
    if (newOpts.onSelect) onSelect = newOpts.onSelect;
    if (newOpts.onClose) onClose = newOpts.onClose;
    if (newOpts.initialColor) {
      const hex = sanitize(newOpts.initialColor) || normalizeColor(newOpts.initialColor);
      selectedColor = hex || newOpts.initialColor;
      addRecentColor(selectedColor);
      const circles = Array.from(container.querySelectorAll<HTMLButtonElement>('.color-circle'));
      let found = false;
      circles.forEach(btn => {
        const match = btn.dataset.color === selectedColor;
        btn.classList.toggle('active', match);
        if (match) found = true;
      });
      if (!found) {
        circles.forEach(btn => btn.classList.remove('active'));
      }
      if (hex) {
        setFromHex(selectedColor, false);
      } else {
        previewColor.style.backgroundColor = selectedColor;
        hexInput.value = selectedColor;
      }
    }
    if (newOpts.documentColors) {
      documentColors.splice(0, documentColors.length, ...newOpts.documentColors);
      const docWrapper = container.querySelectorAll<HTMLElement>('.color-section')[1];
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
