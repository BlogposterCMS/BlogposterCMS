// public/assets/plainspace/editor/editor.js
// Lightweight global text editor for builder mode.
import { isValidTag } from '../allowedTags.js';
import { createColorPicker } from './colorPicker.js';

let toolbar = null;
let activeEl = null;
let initPromise = null;
let autoHandler = null;
let currentColor = '#000000';
let colorPicker = null;

// Command history for text edits
const textHistory = [];
const redoHistory = [];
const MAX_HISTORY = 50;

let toggleStyleInternal;
let applyFontInternal;
let applySizeInternal;
let applyColorInternal;

function pushCommand(command) {
  textHistory.push(command);
  if (textHistory.length > MAX_HISTORY) textHistory.shift();
  redoHistory.length = 0;
}

export function undoTextCommand() {
  const cmd = textHistory.pop();
  if (!cmd) return false;
  redoHistory.push(cmd);
  cmd.undo();
  return true;
}

export function redoTextCommand() {
  const cmd = redoHistory.pop();
  if (!cmd) return false;
  textHistory.push(cmd);
  cmd.execute();
  return true;
}

function recordChange(el, prevHtml) {
  const newHtml = el.innerHTML;
  pushCommand({
    execute() {
      el.innerHTML = newHtml;
      updateAndDispatch(el);
    },
    undo() {
      el.innerHTML = prevHtml;
      updateAndDispatch(el);
    }
  });
}

export function toggleStyle(prop, value) {
  if (!activeEl) return;
  const prev = activeEl.innerHTML;
  toggleStyleInternal(prop, value);
  recordChange(activeEl, prev);
}

export function applyFont(font) {
  if (!activeEl) return;
  const prev = activeEl.innerHTML;
  applyFontInternal(font);
  recordChange(activeEl, prev);
}

export function applySize(size) {
  if (!activeEl) return;
  const prev = activeEl.innerHTML;
  applySizeInternal(size);
  recordChange(activeEl, prev);
}

export function applyColor(color) {
  if (!activeEl) return;
  const prev = activeEl.innerHTML;
  applyColorInternal(color);
  recordChange(activeEl, prev);
}

function dispatchHtmlUpdate(el) {
  if (!el) return;
  const widget = findWidget(el);
  const instanceId = widget?.dataset.instanceId;
  if (!instanceId) return;
  const html = el.innerHTML.trim();
  console.log('[DEBUG] dispatchHtmlUpdate', instanceId, html);
  document.dispatchEvent(
    new CustomEvent('widgetHtmlUpdate', {
      detail: { instanceId, html }
    })
  );
}

function updateAndDispatch(el) {
  if (!el) return;
  const html = el.innerHTML.trim();
  el.__onSave?.(html);
  dispatchHtmlUpdate(el);
}

const editableMap = new WeakMap();


export function sanitizeHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  div.querySelectorAll('script, style').forEach(el => el.remove());
  div.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
      } else if (name === 'style') {
        const allowed = [
          'font-size',
          'font-family',
          'text-decoration',
          'font-weight',
          'font-style',
          'color',
          'background-color'
        ];
        const sanitized = attr.value
          .split(';')
          .map(s => s.trim())
          .filter(Boolean)
          .map(s => {
            const [prop, value] = s.split(':').map(p => p.trim());
            if (
              allowed.includes(prop.toLowerCase()) &&
              !/(expression|url\(|javascript)/i.test(value)
            ) {
              return `${prop}:${value}`;
            }
            return null;
          })
          .filter(Boolean)
          .join('; ');
        if (sanitized) {
          el.setAttribute('style', sanitized);
        } else {
          el.removeAttribute('style');
        }
      }
    });
  });
  return div.innerHTML;
}

function isEditableElement(el) {
  if (!el || el.nodeType !== 1) return false;
  const ignore = ['A', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'IMG', 'SVG', 'VIDEO', 'AUDIO', 'CANVAS'];
  if (ignore.includes(el.tagName)) return false;
  if (!el.textContent.trim()) return false;
  const tag = el.tagName.toLowerCase();
  if (isValidTag(tag)) return true;
  if (el.dataset.textEditable !== undefined) return true;
  return el.children.length === 0;
}

function withinGridItem(el) {
  let node = el;
  while (node && node !== document.body) {
    if (node.classList && node.classList.contains('canvas-item')) return true;
    node = node.parentElement || (node.getRootNode && node.getRootNode().host);
  }
  return false;
}

function findWidget(node) {
  let n = node;
  while (n && n !== document.body) {
    if (n.classList && n.classList.contains('canvas-item')) return n;
    n = n.parentElement || (n.getRootNode && n.getRootNode().host);
  }
  return null;
}

function findEditable(target) {
  let t = target;
  while (t && t !== document.body) {
    if (isEditableElement(t) && withinGridItem(t)) {
      return t;
    }
    t = t.parentElement || (t.getRootNode && t.getRootNode().host);
  }
  return null;
}

function findEditableFromEvent(ev) {
  if (typeof ev.composedPath === 'function') {
    const path = ev.composedPath();
    for (const node of path) {
      if (node instanceof Element && isEditableElement(node) && withinGridItem(node)) {
        return node;
      }
    }
  }
  return findEditable(ev.target);
}

async function init() {
  console.log('[TBE] init() called');
  if (initPromise) {
    await initPromise;
    return;
  }
  initPromise = (async () => {
    try {
      // Ensure toolbar is a singleton to avoid duplicate event listeners
      toolbar =
        toolbar || document.body.querySelector('.text-block-editor-toolbar');
      if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.className = 'text-block-editor-toolbar';
        toolbar.style.display = 'none';
        toolbar.innerHTML = [
        '<div class="font-family-control">' +
          '<div class="ff-dropdown">' +
            '<button type="button" class="ff-btn"><span class="ff-label">Font</span></button>' +
            '<div class="ff-options"></div>' +
          '</div>' +
        '</div>',
        '<button type="button" class="tb-btn" data-cmd="bold">' + window.featherIcon('bold') + '</button>',
        '<button type="button" class="tb-btn" data-cmd="italic">' + window.featherIcon('italic') + '</button>',
        '<button type="button" class="tb-btn" data-cmd="underline">' + window.featherIcon('underline') + '</button>',
        '<select class="heading-select" style="display:none">' +
          ['h1','h2','h3','h4','h5','h6'].map(h => `<option value="${h}">${h.toUpperCase()}</option>`).join('') +
        '</select>',
        '<div class="font-size-control">' +
          '<button type="button" class="tb-btn fs-dec">-</button>' +
          '<div class="fs-dropdown">' +
            '<button type="button" class="fs-btn"><span>' +
              '<input type="number" class="fs-input" value="16" min="1" max="800" step="0.1" pattern="\\d*" tabindex="-1" placeholder="--" />' +
            '</span></button>' +
            '<div class="fs-options">' +
              [12,14,16,18,24,36].map(s => `<span data-size="${s}">${s}</span>`).join('') +
            '</div>' +
          '</div>' +
          '<button type="button" class="tb-btn fs-inc">+</button>' +
        '</div>'
      ].join('');
        document.body.appendChild(toolbar);
      }
      toolbar.style.display = 'none';
    toolbar.addEventListener('mousedown', e => e.stopPropagation());
    toolbar.addEventListener('click', e => e.stopPropagation());

    toggleStyleInternal = (prop, value) => {
      if (!activeEl) return;
      const sel = window.getSelection();

      // 1. Range‑Selektion => Inline‑Spans setzen/entfernen
      if (sel && !sel.isCollapsed &&
          activeEl.contains(sel.anchorNode) && activeEl.contains(sel.focusNode)) {
        const range = sel.getRangeAt(0).cloneRange();
        const span = document.createElement('span');
        span.style[prop] = value;
        span.appendChild(range.extractContents());
        range.deleteContents();

        /* Wenn der markierte Text bereits homogen formatiert ist,
           entfernen wir den Stil statt ihn zu stapeln. */
        const tmp = span.cloneNode(true);
        const everyHasStyle = [...tmp.querySelectorAll('*')].every(
          n => (n.style[prop] || '') === String(value)
        );
        if (everyHasStyle) {
          tmp.querySelectorAll('*').forEach(n => n.style[prop] = '');
          range.insertNode(tmp);
        } else {
          range.insertNode(span);
        }
        sel.removeAllRanges();
        sel.addRange(range);
      }
      // 2. Keine Range oder Box‑Level‑Modus => Toggle am Block selbst
      else {
        const cur = activeEl.style[prop];
        activeEl.style[prop] = cur === value ? '' : value;
      }

      /* Undo/Redo‑Stack */
      recordChange(activeEl, activeEl.innerHTML);
      updateAndDispatch(activeEl);
      activeEl.focus();
    };

    toolbar.addEventListener('click', ev => {
      const btn = ev.target.closest('button[data-cmd]');
      if (!btn) return;
      ev.preventDefault();
      if (!activeEl || !document.body.contains(activeEl)) {
        const w = document.querySelector('.canvas-item.selected');
        activeEl = w ? getRegisteredEditable(w) : null;
      }
      if (!activeEl) return;
      const cmd = btn.dataset.cmd;
      if (cmd === 'bold') toggleStyle('fontWeight', 'bold');
      if (cmd === 'italic') toggleStyle('fontStyle', 'italic');
      if (cmd === 'underline') toggleStyle('textDecoration', 'underline');
    });

    const colorWrapper = document.createElement('div');
    colorWrapper.className = 'text-color-picker';
    const colorBtn = document.createElement('button');
    colorBtn.type = 'button';
    colorBtn.className = 'color-picker-toggle tb-btn';
    const colorIcon = document.createElement('span');
    colorIcon.className = 'color-icon';
    colorIcon.textContent = 'A';
    colorIcon.style.textDecorationColor = currentColor;
    colorBtn.appendChild(colorIcon);
    const themeColor = getComputedStyle(document.documentElement)
      .getPropertyValue('--accent-color')
      .trim();
    colorPicker = createColorPicker({
      presetColors: [
        '#FF0000', '#FF4040', '#FFC0CB', '#FF00FF', '#800080', '#8A2BE2',
        '#00CED1', '#00FFFF', '#40E0D0', '#ADD8E6', '#4169E1', '#0047AB',
        '#008000', '#7CFC00', '#BFFF00', '#FFFF00', '#FFDAB9', '#FFA500',
        '#000000', '#A9A9A9', '#808080'
      ],
      themeColors: themeColor ? [themeColor] : [],
      initialColor: currentColor,
      onSelect: c => {
        applyColor(c);
        colorIcon.style.textDecorationColor = c;
        /* Picker offen lassen – schließen erst über X/Widgetwechsel */
      },
      onClose: () => colorBtn.focus()
    });
    colorPicker.el.classList.add('floating', 'hidden');
    document.body.appendChild(colorPicker.el);
    colorBtn.addEventListener('click', () => {
      if (colorPicker.el.classList.contains('hidden')) {
        const rect = colorBtn.getBoundingClientRect();
        colorPicker.showAt(
          rect.left + window.scrollX,
          rect.bottom + window.scrollY
        );
      } else {
        colorPicker.hide();
      }
    });
    /* Picker nur schließen, wenn X gedrückt oder Widget gewechselt */
    document.addEventListener('widgetSelected', () => colorPicker.hide());
    colorWrapper.appendChild(colorBtn);
    toolbar.appendChild(colorWrapper);

    const ffControl = toolbar.querySelector('.font-family-control');
    const ffDropdown = toolbar.querySelector('.ff-dropdown');
    const ffOptions = toolbar.querySelector('.ff-options');
    const ffBtn = toolbar.querySelector('.ff-btn');
    const ffLabel = toolbar.querySelector('.ff-label');
    const fsInput = toolbar.querySelector('.fs-input');
    const fsDropdown = toolbar.querySelector('.fs-dropdown');
    const fsOptions = toolbar.querySelector('.fs-options');
    const fsBtn = toolbar.querySelector('.fs-btn');

    const populateFonts = () => {
      const fonts = Array.isArray(window.AVAILABLE_FONTS) ? window.AVAILABLE_FONTS : [];
      ffOptions.innerHTML = fonts
        .map(f => `<span data-font="${f}" style="font-family:'${f}'">${f}</span>`)
        .join('');
      if (fonts.length) ffLabel.textContent = fonts[0];
    };
    populateFonts();
    document.addEventListener('fontsUpdated', populateFonts);

    applyFontInternal = font => {
      if (!font || !activeEl) return;
      ffLabel.textContent = font;
      const sel = window.getSelection();
      if (
        sel &&
        !sel.isCollapsed &&
        activeEl.contains(sel.anchorNode) &&
        activeEl.contains(sel.focusNode)
      ) {
        try {
          const range = sel.getRangeAt(0).cloneRange();
          const span = document.createElement('span');
          span.style.fontFamily = `'${font}'`;
          span.appendChild(range.extractContents());
          range.insertNode(span);
          sel.removeAllRanges();
          const newRange = document.createRange();
          newRange.selectNodeContents(span);
          sel.addRange(newRange);
        } catch (err) {
          activeEl.style.fontFamily = `'${font}'`;
        }
      } else {
        activeEl.style.fontFamily = `'${font}'`;
      }
      updateAndDispatch(activeEl);
      activeEl.focus();
    };
    applySizeInternal = size => {
      const val = parseFloat(size);
      if (!val || !activeEl) return;
      fsInput.value = val;

      const sel = window.getSelection();
      if (
        sel &&
        !sel.isCollapsed &&
        activeEl.contains(sel.anchorNode) &&
        activeEl.contains(sel.focusNode)
      ) {
        try {
          const range = sel.getRangeAt(0).cloneRange();
          const span = document.createElement('span');
          span.style.fontSize = val + 'px';
          span.appendChild(range.extractContents());
          range.insertNode(span);
          sel.removeAllRanges();
          const newRange = document.createRange();
          newRange.selectNodeContents(span);
          sel.addRange(newRange);
        } catch (err) {
          activeEl.style.fontSize = val + 'px';
        }
      } else {
        activeEl.style.fontSize = val + 'px';
      }
      updateAndDispatch(activeEl);
      activeEl.focus();
    };

    const sanitizeColor = c => {
      c = String(c || '').trim();
      if (/^#[0-9a-fA-F]{3,8}$/.test(c)) return c;
      const tmp = document.createElement('div');
      tmp.style.color = c;
      return tmp.style.color ? c : '#000000';
    };

    applyColorInternal = color => {
      const val = sanitizeColor(color);
      currentColor = val;
      if (!activeEl) return;
      const sel = window.getSelection();
      if (
        sel &&
        !sel.isCollapsed &&
        activeEl.contains(sel.anchorNode) &&
        activeEl.contains(sel.focusNode)
      ) {
        try {
          const range = sel.getRangeAt(0).cloneRange();
          const span = document.createElement('span');
          span.style.color = val;
          span.appendChild(range.extractContents());
          range.insertNode(span);
          sel.removeAllRanges();
          const newRange = document.createRange();
          newRange.selectNodeContents(span);
          sel.addRange(newRange);
        } catch (err) {
          activeEl.style.color = val;
        }
      } else {
        activeEl.style.color = val;
      }
      activeEl.focus();
      updateAndDispatch(activeEl);
    };
    toolbar.querySelector('.fs-inc').addEventListener('click', () => {
      applySize((parseFloat(fsInput.value) || 16) + 1);
    });
    toolbar.querySelector('.fs-dec').addEventListener('click', () => {
      applySize((parseFloat(fsInput.value) || 16) - 1);
    });
    const filterOptions = val => {
      fsOptions.querySelectorAll('span[data-size]').forEach(span => {
        span.style.display = !val || span.textContent.startsWith(val) ? 'block' : 'none';
      });
    };

    fsBtn.addEventListener('click', () => {
      fsDropdown.classList.toggle('open');
      fsInput.focus();
    });

    ffBtn.addEventListener('click', () => {
      ffControl.classList.toggle('open');
    });

    document.addEventListener('click', ev => {
      if (!ffControl.contains(ev.target)) ffControl.classList.remove('open');
    });

    ffOptions.addEventListener('click', ev => {
      const opt = ev.target.closest('span[data-font]');
      if (!opt) return;
      applyFont(opt.dataset.font);
      ffControl.classList.remove('open');
    });

    ['pointerdown', 'click'].forEach(evt => {
      fsInput.addEventListener(evt, ev => ev.stopPropagation());
    });

    fsInput.addEventListener('focus', () => {
      fsDropdown.classList.add('open');
      filterOptions(fsInput.value);
    });
    fsInput.addEventListener('input', () => {
      fsDropdown.classList.add('open');
      filterOptions(fsInput.value);
    });
    fsInput.addEventListener('change', () => applySize(fsInput.value));
    fsInput.addEventListener('blur', () => {
      setTimeout(() => fsDropdown.classList.remove('open'), 150);
    });

    fsOptions.addEventListener('click', ev => {
      const opt = ev.target.closest('span[data-size]');
      if (!opt) return;
      applySize(opt.dataset.size);
      fsDropdown.classList.remove('open');
    });

    toolbar.addEventListener('input', e => {
      const target = e.target;
      if (!activeEl) return;
      if (target.matches('.fs-input')) {
        if (activeEl.getAttribute('contenteditable') !== 'true') {
          applyToolbarChange(activeEl, 'fontSize', target.value + 'px');
        }
      }
    });
      console.log('[TBE] init() finished OK');
    } catch (err) {
      console.error('[TBE] init() failed', err);
      throw err;
    }
  })();
  await initPromise;
}


function setCaretFromEvent(el, ev) {
  if (!el || !ev) return;
  let range = null;
  if (document.caretRangeFromPoint) {
    range = document.caretRangeFromPoint(ev.clientX, ev.clientY);
  } else if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(ev.clientX, ev.clientY);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
    }
  }
  if (range) {
    range.collapse(true);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
}

export function editElement(el, onSave, clickEvent = null) {
  const widget = el.closest('.canvas-item');
  if (!widget) return;

  const getHitLayer = w =>
    w.querySelector('.hit-layer') ||
    w.querySelector('.canvas-item-content .hit-layer') ||
    null;

  const hitLayer = getHitLayer(widget);

  const prevLayer = +widget.dataset.layer || 0;
  widget.dataset.layer = 9999;
  widget.style.zIndex = '9999';
  widget.classList.add('editing');

  //lock the widget to prevent moving/resizing while editing
  widget.setAttribute('gs-locked', 'true');
  const grid = widget.closest('.canvas-grid')?.__grid;
  grid?.update(widget, { locked: true, noMove: true, noResize: true });

  if (hitLayer) hitLayer.style.pointerEvents = 'none';

  el.setAttribute('contenteditable', 'true');
  el.focus();
  if (clickEvent) {
    setCaretFromEvent(el, clickEvent);
  }
  activeEl = el;

  const inputHandler = () => dispatchHtmlUpdate(el);
  el.addEventListener('input', inputHandler);
  el.__inputHandler = inputHandler;

  showToolbar();

  function finish(save) {
    if (save) {
      el.innerHTML = sanitizeHtml(el.innerHTML.trim());
      updateAndDispatch(el);
    }
    activeEl = null;

    el.removeAttribute('contenteditable');

    widget.dataset.layer = prevLayer;
    widget.style.zIndex = String(prevLayer);
    widget.setAttribute('gs-locked', 'false');
    grid?.update(widget, { locked: false, noMove: false, noResize: false });
    if (el.__inputHandler) {
      el.removeEventListener('input', el.__inputHandler);
      delete el.__inputHandler;
    }

    if (hitLayer) hitLayer.style.pointerEvents = 'auto';

    widget.classList.remove('editing');
    if (widget.classList.contains('selected')) {
      showToolbar();
    } else {
      hideToolbar();
    }
    document.removeEventListener('mousedown', outsideClick, true);
  }

  // Finish editing when clicking outside the widget, its bounding box or the toolbar
  const outsideClick = ev => {
    if (
      widget.contains(ev.target) ||
      grid?.bbox?.contains(ev.target) ||
      toolbar?.contains(ev.target)
    ) return;
    finish(true);
  };
  document.addEventListener('mousedown', outsideClick, true);
  el.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
}

export function registerElement(editable, onSave) {
  if (!editable) return;
  if (!editable.id || (document.getElementById(editable.id) && document.getElementById(editable.id) !== editable)) {
    editable.id = `editable-${Math.random().toString(36).slice(2,8)}`;
  }
  if (editable.__registered) return;
  editable.__registered = true;
  editable.__onSave = onSave;
  const widget = findWidget(editable);
  if (widget) {
    editableMap.set(widget, editable);
  }
  console.log('[DEBUG] registerElement:', editable, 'for widget:', widget);
}

export function getRegisteredEditable(widget) {
  return editableMap.get(widget) || null;
}

export function enableAutoEdit() {
  if (autoHandler) return;
  autoHandler = ev => {
    if (!document.body.classList.contains('builder-mode')) return;
    if (toolbar && toolbar.contains(ev.target)) return;
    const widget = findWidget(ev.target);
    if (!widget || !widget.classList.contains('selected')) return;
    let el = findEditableFromEvent(ev);
    if (!el) {
      el = getRegisteredEditable(widget);
    }
    if (!el) return;
    ev.stopPropagation();
    ev.preventDefault();
    editElement(el, el.__onSave, ev);
  };
  document.addEventListener('dblclick', autoHandler, true);
}

export async function initTextEditor() {
  await init().catch(err => console.error('[globalTextEditor] init failed', err));
  enableAutoEdit();
}

export function setActiveElement(el) {
  activeEl = el;
  if (activeEl) {
    console.log('[DEBUG] activeEl set to:', activeEl);
  }
}

export function applyToolbarChange(el, styleProp, value) {
  if (!el) return;
  console.log('[DEBUG] Applying toolbar style:', styleProp, value, 'to element:', el);
  el.style[styleProp] = value;
  updateAndDispatch(el);
}

function showToolbar() {
  if (!toolbar) return;
  toolbar.style.display = 'flex';
}

function hideToolbar() {
  if (!toolbar) return;
  toolbar.style.display = 'none';
  const headingSelect = toolbar.querySelector('.heading-select');
  if (headingSelect) {
    headingSelect.style.display = 'none';
    headingSelect.onchange = null;
  }
}

document.addEventListener('widgetSelected', () => hideToolbar());

export { showToolbar, hideToolbar };

if (document.body.classList.contains('builder-mode')) {
  initTextEditor();
}
