import { initPublishPanel } from './publishPanel';
import { initHeaderControls } from './headerControls.js';
import { createLogger } from '../utils/logger';
import { fetchPartial } from '../fetchPartial.js';
import { sanitizeHtml } from '../../../public/plainspace/sanitizer.js';

const headerLogger = createLogger('builder:header');
const HEADER_HEIGHT_VAR = '--builder-header-height';
const DEFAULT_HEADER_HEIGHT = 64;

function getAppScope(): HTMLElement {
  const scope = document.querySelector<HTMLElement>('.app-scope');
  return scope ?? document.body;
}

function setHeaderHeightVariable(height?: number) {
  const numericHeight = Number.isFinite(height) && height ? Number(height) : DEFAULT_HEADER_HEIGHT;
  document.body.style.setProperty(HEADER_HEIGHT_VAR, `${numericHeight}px`);
}

function buildFallbackHeader(): HTMLElement {
  const header = document.createElement('header');
  header.id = 'builder-header';
  header.className = 'builder-header';
  header.setAttribute('role', 'banner');

  const backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'builder-back-btn';
  backBtn.innerHTML = '<img src="/assets/icons/arrow-left.svg" alt="Back" class="icon" />';
  header.appendChild(backBtn);

  const nameInput = document.createElement('input');
  nameInput.id = 'layoutNameInput';
  nameInput.type = 'text';
  nameInput.className = 'layout-name-input';
  nameInput.placeholder = 'Layout name';
  nameInput.required = true;
  header.appendChild(nameInput);

  const headerActions = document.createElement('div');
  headerActions.className = 'header-actions';
  header.appendChild(headerActions);

  const createActionButton = ({
    id,
    className,
    icon,
    label,
    alt
  }: {
    id?: string | null;
    className: string;
    icon: string;
    label?: string;
    alt?: string;
  }) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = ['button', className].filter(Boolean).join(' ');
    if (id) button.id = id;
    const iconImg = document.createElement('img');
    iconImg.src = icon;
    iconImg.alt = alt || label || 'Icon';
    iconImg.className = 'icon';
    button.appendChild(iconImg);
    const accessibleLabel = label || alt;
    if (accessibleLabel) {
      button.setAttribute('aria-label', accessibleLabel);
      button.title = accessibleLabel;
    }
    if (label) {
      const textNode = document.createTextNode(` ${label}`);
      button.appendChild(textNode);
    }
    return button;
  };

  headerActions.appendChild(createActionButton({
    id: 'viewportControlBtn',
    className: 'builder-viewport-btn',
    icon: '/assets/icons/monitor.svg',
    alt: 'Viewport'
  }));
  headerActions.appendChild(createActionButton({
    id: 'publishLayoutBtn',
    className: 'builder-publish-btn',
    icon: '/assets/icons/upload.svg',
    label: 'Publish'
  }));
  headerActions.appendChild(createActionButton({
    id: 'saveLayoutBtn',
    className: 'builder-save-btn',
    icon: '/assets/icons/save.svg',
    label: 'Save'
  }));
  headerActions.appendChild(createActionButton({
    className: 'builder-menu-btn',
    icon: '/assets/icons/ellipsis-vertical.svg',
    alt: 'More actions'
  }));

  const viewportSlider = document.createElement('div');
  viewportSlider.className = 'viewport-slider';
  const range = document.createElement('input');
  range.type = 'range';
  range.className = 'viewport-range';
  range.min = '320';
  range.max = '3840';
  range.step = '10';
  range.setAttribute('aria-label', 'Viewport width');
  const valueDisplay = document.createElement('span');
  valueDisplay.className = 'viewport-value';
  viewportSlider.append(range, valueDisplay);
  header.appendChild(viewportSlider);

  const optionsMenu = document.createElement('div');
  optionsMenu.className = 'builder-options-menu';

  const undoBtn = document.createElement('button');
  undoBtn.type = 'button';
  undoBtn.className = 'menu-undo';
  undoBtn.innerHTML = '<img src="/assets/icons/rotate-ccw.svg" class="icon" alt="Undo" /> Undo';
  const redoBtn = document.createElement('button');
  redoBtn.type = 'button';
  redoBtn.className = 'menu-redo';
  redoBtn.innerHTML = '<img src="/assets/icons/rotate-cw.svg" class="icon" alt="Redo" /> Redo';
  const proLabel = document.createElement('label');
  proLabel.className = 'menu-pro';
  const proToggle = document.createElement('input');
  proToggle.type = 'checkbox';
  proToggle.className = 'pro-toggle';
  proToggle.checked = true;
  proToggle.setAttribute('aria-label', 'Toggle pro mode');
  proLabel.append(proToggle, document.createTextNode(' Pro Mode'));

  optionsMenu.append(undoBtn, redoBtn, proLabel);
  header.appendChild(optionsMenu);

  return header;
}

function ensureHeaderMount(): HTMLElement {
  const existing = document.getElementById('builder-header');
  if (existing instanceof HTMLElement) {
    return existing;
  }
  const appScope = getAppScope();
  const fallback = buildFallbackHeader();
  appScope.prepend(fallback);
  return fallback;
}

async function loadHeaderPartial(existing?: HTMLElement) {
  const appScope = getAppScope();
  try {
    const markup = await fetchPartial('builder-header');
    const sanitized = sanitizeHtml(markup.trim());
    if (!sanitized) throw new Error('Empty header markup');
    const tpl = document.createElement('template');
    tpl.innerHTML = sanitized;
    const headerEl = tpl.content.firstElementChild;
    if (!(headerEl instanceof HTMLElement)) throw new Error('Missing builder header root element');
    headerEl.id = headerEl.id || 'builder-header';
    headerEl.classList.add('builder-header');
    headerEl.setAttribute('role', 'banner');
    if (existing?.isConnected) {
      existing.replaceWith(headerEl);
    } else {
      appScope.prepend(headerEl);
    }
    return headerEl;
  } catch (err) {
    headerLogger.warn('Failed to load builder-header.html, falling back to JS header shell', err);
    return existing ?? ensureHeaderMount();
  }
}

export function createBuilderHeader({
  initialLayoutName,
  layoutNameParam,
  pageData,
  gridEl,
  viewportSizeEl,
  grid,
  saveDesign,
  getCurrentLayoutForLayer,
  getActiveLayer,
  ensureCodeMap,
  capturePreview,
  updateAllWidgetContents,
  getAdminUserId,
  pageId,
  layoutRoot,
  state,
  startAutosave,
  showPreviewHeader,
  hidePreviewHeader,
  undo,
  redo
}) {
  let topBar = null;
  let layoutName = initialLayoutName;
  let headerResizeObserver: ResizeObserver | null = null;

  setHeaderHeightVariable(DEFAULT_HEADER_HEIGHT);

  function observeHeader(el: HTMLElement) {
    headerResizeObserver?.disconnect();
    headerResizeObserver = null;
    const updateVar = (height?: number) => setHeaderHeightVariable(height);
    updateVar(el.offsetHeight);
    if (typeof ResizeObserver === 'function') {
      headerResizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          const boxSize = Array.isArray(entry.borderBoxSize) && entry.borderBoxSize.length
            ? entry.borderBoxSize[0].blockSize
            : entry.contentRect?.height;
          updateVar(boxSize || el.offsetHeight);
        }
      });
      headerResizeObserver.observe(el);
    }
  }

  async function renderHeader({ reload = false } = {}) {
    try {
      const mount = ensureHeaderMount();
      if (reload) {
        headerResizeObserver?.disconnect();
        headerResizeObserver = null;
        if (mount) {
          const oldInput = mount.querySelector('#layoutNameInput');
          if (oldInput) layoutName = oldInput.value;
        }
      }
      setHeaderHeightVariable(DEFAULT_HEADER_HEIGHT);
      topBar = await loadHeaderPartial(mount);
      if (topBar instanceof HTMLElement) {
        observeHeader(topBar);
      } else {
        setHeaderHeightVariable();
      }
      const backBtn = topBar.querySelector('.builder-back-btn');
      if (backBtn) backBtn.addEventListener('click', () => {
        try {
          const ref = document.referrer;
          if (ref) {
            const url = new URL(ref, location.href);
            if (url.origin === location.origin && !url.pathname.startsWith('/login')) {
              history.back();
              return;
            }
          }
        } catch { /* ignore malformed referrer */ }
        window.location.href = '/';
      });

      const nameInput = topBar.querySelector('#layoutNameInput');
      if (!layoutName) {
        layoutName = layoutNameParam || pageData?.meta?.layoutTemplate || pageData?.title || nameInput?.placeholder || 'layout-title';
      }
      if (nameInput) {
        try { nameInput.value = layoutName; } catch {}
        nameInput.addEventListener('input', () => {
          layoutName = nameInput.value;
        });
      }

      const headerActions = topBar.querySelector('.header-actions') || topBar;
      const saveBtn = topBar.querySelector('#saveLayoutBtn');
      const previewBtn = topBar.querySelector('#previewLayoutBtn');
      const publishBtn = topBar.querySelector('#publishLayoutBtn');

      const saveWrapper = document.createElement('div');
      saveWrapper.className = 'builder-save-wrapper';
      if (saveBtn) {
        headerActions.insertBefore(saveWrapper, saveBtn);
        saveWrapper.appendChild(saveBtn);
      } else {
        headerActions.appendChild(saveWrapper);
      }

      const saveMenuBtn = document.createElement('button');
      saveMenuBtn.className = 'builder-save-dropdown-toggle';
      saveMenuBtn.innerHTML = window.featherIcon
        ? window.featherIcon('chevron-down')
        : '<img src="/assets/icons/chevron-down.svg" alt="more" />';
      saveWrapper.appendChild(saveMenuBtn);

      const saveDropdown = document.createElement('div');
      saveDropdown.className = 'builder-save-dropdown';
      saveDropdown.innerHTML = '<label class="autosave-option"><input type="checkbox" class="autosave-toggle" checked /> Autosave</label>';
      saveWrapper.appendChild(saveDropdown);

      initHeaderControls(topBar, gridEl, viewportSizeEl, grid, {
        undo,
        redo
      });

      saveMenuBtn.addEventListener('click', e => {
        e.stopPropagation();
        if (saveDropdown.style.display === 'block') { hideSaveDropdown(); return; }
        saveDropdown.style.display = 'block';
        document.addEventListener('click', outsideSaveHandler);
      });

      function hideSaveDropdown() {
        saveDropdown.style.display = 'none';
        document.removeEventListener('click', outsideSaveHandler);
      }

      function outsideSaveHandler(e) {
        if (!saveWrapper.contains(e.target)) hideSaveDropdown();
      }

      const autosaveToggle = saveDropdown.querySelector('.autosave-toggle');
      autosaveToggle.checked = state.autosaveEnabled;
      autosaveToggle.addEventListener('change', () => {
        state.autosaveEnabled = autosaveToggle.checked;
        startAutosave();
      });

      startAutosave();

      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          try {
            await saveDesign({
              name: nameInput?.value?.trim() || layoutName,
              gridEl,
              layoutRoot,
              getCurrentLayoutForLayer,
              getActiveLayer,
              ensureCodeMap,
              capturePreview,
              updateAllWidgetContents,
              ownerId: getAdminUserId(),
              pageId,
              isLayout: getActiveLayer() === 0,
              isGlobal: getActiveLayer() === 0
            });
            alert(getActiveLayer() === 0 ? 'Layout template saved' : 'Design saved');
          } catch (err) {
            alert('Save failed: ' + err.message);
          }
        });
      }

      if (previewBtn) {
        previewBtn.addEventListener('click', () => {
          const active = document.body.classList.toggle('preview-mode');
          if (window.featherIcon) {
            previewBtn.innerHTML = window.featherIcon(active ? 'eye-off' : 'eye');
          } else {
            const icon = active ? 'eye-off' : 'eye';
            previewBtn.innerHTML = `<img src="/assets/icons/${icon}.svg" alt="Preview" />`;
          }
          if (active) {
            showPreviewHeader();
          } else {
            hidePreviewHeader();
          }
        });
      }

      if (getActiveLayer() === 0 && publishBtn) {
        publishBtn.remove();
      } else if (publishBtn) {
        initPublishPanel({
          publishBtn,
          nameInput,
          gridEl,
          layoutRoot,
          updateAllWidgetContents,
          getAdminUserId,
          getCurrentLayoutForLayer,
          getActiveLayer,
          ensureCodeMap,
          capturePreview,
          pageId,
          saveDesign
        });
      }
    } catch (err) {
      headerLogger.error('failed to render header', err);
    }
  }

  return {
    renderHeader,
    getLayoutName: () => layoutName,
    setLayoutName: value => { layoutName = value; },
    getTopBar: () => topBar
  };
}
