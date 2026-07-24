export const presetColors: string[] = [
  '#FF0000', '#FF4040', '#FFC0CB', '#FF00FF', '#800080', '#8A2BE2',
  '#00CED1', '#00FFFF', '#40E0D0', '#ADD8E6', '#4169E1', '#0047AB',
  '#008000', '#7CFC00', '#BFFF00', '#FFFF00', '#FFDAB9', '#FFA500',
  '#000000', '#A9A9A9', '#808080'
];

export interface SavedColorOption {
  id: string;
  name: string;
  value: string;
  cssValue?: string;
}

export interface ColorSelection {
  value: string;
  output: string;
  source: 'literal' | 'saved';
  linked: boolean;
  refId?: string;
  name?: string;
}

export interface ColorPickerOptions {
  presetColors?: string[];
  recentColors?: string[];
  userColors?: string[];
  documentColors?: string[];
  themeColors?: string[];
  savedColors?: SavedColorOption[];
  linkSavedColors?: boolean;
  initialColor?: string;
  onSelect?: (color: string, selection?: ColorSelection) => void;
  onClose?: () => void;
  onCreateSavedColor?: (input: { name: string; value: string }) => Promise<SavedColorOption | null | void>;
  onUpdateSavedColor?: (input: { id: string; name: string; value: string }) => Promise<SavedColorOption | null | void>;
  onDeleteSavedColor?: (id: string) => Promise<unknown>;
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
  const savedColors = [...(options.savedColors ?? [])];

  let selectedColor = options.initialColor || customPresets[0] || '#000000';
  let selectedOutput = selectedColor;
  let selectedSavedColorId: string | null = null;
  let linkSavedColors = options.linkSavedColors !== false;
  let onSelect = options.onSelect || (() => {});
  let onClose = options.onClose || (() => {});
  let onCreateSavedColor = options.onCreateSavedColor;
  let onUpdateSavedColor = options.onUpdateSavedColor;
  let onDeleteSavedColor = options.onDeleteSavedColor;
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
      selectedOutput = c;
      selectedSavedColorId = null;
      container.querySelectorAll('.color-circle').forEach(n => n.classList.remove('active'));
      container.querySelectorAll('.saved-color-item').forEach(n => n.classList.remove('active'));
      circle.classList.add('active');
      onSelect(selectedOutput, {
        value: selectedColor,
        output: selectedOutput,
        source: 'literal',
        linked: false
      });
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
    selectedOutput = color;
    selectedSavedColorId = null;
    hexInput.value = color;
    previewColor.style.backgroundColor = color;
    container.querySelectorAll('.color-circle').forEach(n => n.classList.remove('active'));
    container.querySelectorAll('.saved-color-item').forEach(n => n.classList.remove('active'));
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
    onSelect(selectedOutput, {
      value: selectedColor,
      output: selectedOutput,
      source: 'literal',
      linked: false
    });
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

  const libraryWrapper = document.createElement('section');
  libraryWrapper.className = 'saved-color-library';
  const libraryHeader = document.createElement('div');
  libraryHeader.className = 'saved-color-library__header';
  const libraryLabel = document.createElement('span');
  libraryLabel.className = 'color-section-label';
  libraryLabel.textContent = 'Color scheme';
  const linkLabel = document.createElement('label');
  linkLabel.className = 'saved-color-library__link';
  const linkToggle = document.createElement('input');
  linkToggle.type = 'checkbox';
  linkToggle.checked = linkSavedColors;
  const linkText = document.createElement('span');
  linkText.textContent = 'Linked';
  linkLabel.append(linkToggle, linkText);
  libraryHeader.append(libraryLabel, linkLabel);
  libraryWrapper.appendChild(libraryHeader);

  const savedColorList = document.createElement('div');
  savedColorList.className = 'saved-color-list';
  libraryWrapper.appendChild(savedColorList);

  const libraryError = document.createElement('p');
  libraryError.className = 'saved-color-library__error hidden';
  libraryError.setAttribute('role', 'alert');
  libraryWrapper.appendChild(libraryError);

  const libraryForm = document.createElement('form');
  libraryForm.className = 'saved-color-form hidden';
  const colorNameInput = document.createElement('input');
  colorNameInput.type = 'text';
  colorNameInput.maxLength = 80;
  colorNameInput.placeholder = 'Color name';
  colorNameInput.className = 'saved-color-form__name';
  colorNameInput.setAttribute('aria-label', 'Default color name');
  const colorValueInput = document.createElement('input');
  colorValueInput.type = 'text';
  colorValueInput.placeholder = '#000000';
  colorValueInput.className = 'saved-color-form__value';
  colorValueInput.setAttribute('aria-label', 'Saved color value');
  const formActions = document.createElement('div');
  formActions.className = 'saved-color-form__actions';
  const saveColorBtn = document.createElement('button');
  saveColorBtn.type = 'submit';
  saveColorBtn.className = 'saved-color-form__save';
  saveColorBtn.textContent = 'Save';
  const cancelColorBtn = document.createElement('button');
  cancelColorBtn.type = 'button';
  cancelColorBtn.className = 'saved-color-form__cancel';
  cancelColorBtn.textContent = 'Cancel';
  formActions.append(saveColorBtn, cancelColorBtn);
  libraryForm.append(colorNameInput, colorValueInput, formActions);
  libraryWrapper.appendChild(libraryForm);

  const addSavedColorBtn = document.createElement('button');
  addSavedColorBtn.type = 'button';
  addSavedColorBtn.className = 'saved-color-library__add';
  addSavedColorBtn.textContent = 'Add as next default';
  libraryWrapper.appendChild(addSavedColorBtn);
  container.appendChild(libraryWrapper);

  let editingSavedColorId: string | null = null;

  function savedColorOutput(color: SavedColorOption): string {
    return linkSavedColors && color.cssValue ? color.cssValue : color.value;
  }

  function showLibraryError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error || 'Unable to update saved colors.');
    libraryError.textContent = message;
    libraryError.classList.remove('hidden');
  }

  function clearLibraryError(): void {
    libraryError.textContent = '';
    libraryError.classList.add('hidden');
  }

  function closeLibraryForm(): void {
    editingSavedColorId = null;
    libraryForm.classList.add('hidden');
    addSavedColorBtn.classList.remove('hidden');
    colorNameInput.value = '';
    colorValueInput.value = '';
    clearLibraryError();
  }

  function openLibraryForm(color?: SavedColorOption): void {
    editingSavedColorId = color?.id || null;
    colorNameInput.value = color?.name || '';
    colorValueInput.value = color?.value || selectedColor;
    saveColorBtn.textContent = color ? 'Update' : 'Save';
    addSavedColorBtn.classList.add('hidden');
    libraryForm.classList.remove('hidden');
    clearLibraryError();
    colorNameInput.focus();
  }

  function selectSavedColor(color: SavedColorOption): void {
    selectedColor = color.value;
    selectedOutput = savedColorOutput(color);
    selectedSavedColorId = color.id;
    setFromHex(color.value, false);
    container.querySelectorAll('.color-circle').forEach(node => node.classList.remove('active'));
    container.querySelectorAll('.saved-color-item').forEach(node => {
      node.classList.toggle('active', (node as HTMLElement).dataset.colorId === color.id);
    });
    onSelect(selectedOutput, {
      value: color.value,
      output: selectedOutput,
      source: 'saved',
      linked: selectedOutput !== color.value,
      refId: color.id,
      name: color.name
    });
  }

  function renderSavedColors(): void {
    savedColorList.replaceChildren();
    if (!savedColors.length) {
      const empty = document.createElement('p');
      empty.className = 'saved-color-library__empty';
      empty.textContent = 'This scheme has no Default colors.';
      savedColorList.appendChild(empty);
      return;
    }
    savedColors.forEach((color, index) => {
      const row = document.createElement('div');
      row.className = 'saved-color-row';
      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.className = 'saved-color-item';
      selectBtn.dataset.colorId = color.id;
      selectBtn.classList.toggle('active', selectedSavedColorId === color.id);
      selectBtn.title = `${color.name} · ${color.value}`;
      const swatch = document.createElement('span');
      swatch.className = 'saved-color-item__swatch';
      swatch.style.backgroundColor = color.value;
      const text = document.createElement('span');
      text.className = 'saved-color-item__text';
      const name = document.createElement('strong');
      name.textContent = `Default ${index + 1} · ${color.name}`;
      const value = document.createElement('small');
      value.textContent = color.value;
      text.append(name, value);
      selectBtn.append(swatch, text);
      selectBtn.addEventListener('click', () => selectSavedColor(color));
      row.appendChild(selectBtn);

      if (onUpdateSavedColor || onDeleteSavedColor) {
        const actions = document.createElement('div');
        actions.className = 'saved-color-row__actions';
        if (onUpdateSavedColor) {
          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.textContent = 'Edit';
          editBtn.setAttribute('aria-label', `Edit ${color.name}`);
          editBtn.addEventListener('click', () => openLibraryForm(color));
          actions.appendChild(editBtn);
        }
        if (onDeleteSavedColor) {
          const deleteBtn = document.createElement('button');
          deleteBtn.type = 'button';
          deleteBtn.textContent = 'Delete';
          deleteBtn.setAttribute('aria-label', `Delete ${color.name}`);
          deleteBtn.addEventListener('click', async () => {
            if (!window.confirm(`Delete "${color.name}"? Linked uses will keep their fallback color.`)) return;
            clearLibraryError();
            deleteBtn.disabled = true;
            try {
              await onDeleteSavedColor?.(color.id);
              const index = savedColors.findIndex(entry => entry.id === color.id);
              if (index >= 0) savedColors.splice(index, 1);
              if (selectedSavedColorId === color.id) selectedSavedColorId = null;
              renderSavedColors();
            } catch (error) {
              showLibraryError(error);
            } finally {
              deleteBtn.disabled = false;
            }
          });
          actions.appendChild(deleteBtn);
        }
        row.appendChild(actions);
      }
      savedColorList.appendChild(row);
    });
  }

  linkToggle.addEventListener('change', () => {
    linkSavedColors = linkToggle.checked;
    const selected = savedColors.find(color => color.id === selectedSavedColorId);
    if (selected) selectSavedColor(selected);
  });
  addSavedColorBtn.addEventListener('click', () => openLibraryForm());
  cancelColorBtn.addEventListener('click', closeLibraryForm);
  libraryForm.addEventListener('submit', async event => {
    event.preventDefault();
    clearLibraryError();
    saveColorBtn.disabled = true;
    const input = {
      name: colorNameInput.value,
      value: colorValueInput.value
    };
    try {
      if (editingSavedColorId && onUpdateSavedColor) {
        const updated = await onUpdateSavedColor({ id: editingSavedColorId, ...input });
        if (updated) {
          const index = savedColors.findIndex(color => color.id === updated.id);
          if (index >= 0) savedColors[index] = updated;
          else savedColors.push(updated);
          renderSavedColors();
        }
      } else if (onCreateSavedColor) {
        const created = await onCreateSavedColor(input);
        if (created && !savedColors.some(color => color.id === created.id)) {
          savedColors.push(created);
          renderSavedColors();
        }
      }
      closeLibraryForm();
    } catch (error) {
      showLibraryError(error);
    } finally {
      saveColorBtn.disabled = false;
    }
  });

  addSavedColorBtn.classList.toggle('hidden', !onCreateSavedColor);
  renderSavedColors();

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
    lbl.textContent = 'Recent & custom';
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

  createSection(documentColors, 'Document colors');
  createSection(customPresets, 'Quick colors');
  createSection(themeColors, 'Interface colors');

  function updateOptions(newOpts: ColorPickerOptions = {}): void {
    if (newOpts.onSelect) onSelect = newOpts.onSelect;
    if (newOpts.onClose) onClose = newOpts.onClose;
    if (Object.prototype.hasOwnProperty.call(newOpts, 'onCreateSavedColor')) {
      onCreateSavedColor = newOpts.onCreateSavedColor;
    }
    if (Object.prototype.hasOwnProperty.call(newOpts, 'onUpdateSavedColor')) {
      onUpdateSavedColor = newOpts.onUpdateSavedColor;
    }
    if (Object.prototype.hasOwnProperty.call(newOpts, 'onDeleteSavedColor')) {
      onDeleteSavedColor = newOpts.onDeleteSavedColor;
    }
    if (typeof newOpts.linkSavedColors === 'boolean') {
      linkSavedColors = newOpts.linkSavedColors;
      linkToggle.checked = linkSavedColors;
    }
    if (newOpts.savedColors) {
      savedColors.splice(0, savedColors.length, ...newOpts.savedColors);
      renderSavedColors();
    }
    addSavedColorBtn.classList.toggle('hidden', !onCreateSavedColor);
    if (newOpts.initialColor) {
      const linkedMatch = newOpts.initialColor.match(
        /^var\(\s*--bp-color-([a-z0-9-]+)\s*,\s*(#[0-9a-f]{6}(?:[0-9a-f]{2})?)\s*\)$/i
      );
      const linked = linkedMatch
        ? savedColors.find(color => color.id === linkedMatch[1])
        : null;
      const initialValue = linked?.value || linkedMatch?.[2] || newOpts.initialColor;
      const hex = sanitize(initialValue) || normalizeColor(initialValue);
      selectedColor = hex || initialValue;
      selectedOutput = linked ? savedColorOutput(linked) : newOpts.initialColor;
      selectedSavedColorId = linked?.id || null;
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
      container.querySelectorAll<HTMLElement>('.saved-color-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.colorId === selectedSavedColorId);
      });
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
      return selectedOutput;
    },
    showAt,
    hide,
    updateOptions
  };
}
