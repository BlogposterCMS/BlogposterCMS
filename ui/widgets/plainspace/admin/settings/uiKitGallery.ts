import { createColorPicker } from '/ui/shared/controls/colorPicker.js';
import enhanceSelects from '/ui/shared/controls/customSelect.js';
import { bpDialog } from '/ui/shared/dialogs/bpDialog.js';
import { bpToast } from '/ui/shared/feedback/toast.js';
import {
  createLoader,
  createProgress,
  setButtonLoading
} from '/ui/shared/feedback/loading.js';
import {
  createFormActions,
  createFormChoice,
  createFormField,
  createFormSwitch
} from '/ui/shared/forms/formField.js';
import { createTabSystem } from '/ui/shared/navigation/tabs.js';
import { bpPopover, type BpPopoverHandle } from '/ui/shared/overlays/popover.js';

type SectionSize = 'default' | 'wide';

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = ''
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function createIcon(name: string, alt = ''): HTMLImageElement {
  const icon = document.createElement('img');
  icon.src = `/assets/icons/${name}.svg`;
  icon.alt = alt;
  if (!alt) icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function createButton(
  label: string,
  variant = 'ghost',
  onClick?: (button: HTMLButtonElement) => void
): HTMLButtonElement {
  const button = createElement('button', `button ${variant}`, label);
  button.type = 'button';
  if (onClick) button.addEventListener('click', () => onClick(button));
  return button;
}

function createIconButton(iconName: string, label: string): HTMLButtonElement {
  const button = createElement('button', 'icon-button');
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.appendChild(createIcon(iconName));
  return button;
}

function createSection(
  id: string,
  title: string,
  description: string,
  size: SectionSize = 'default'
): { section: HTMLElement; body: HTMLElement } {
  const section = createElement(
    'section',
    `ui-kit__section${size === 'wide' ? ' ui-kit__section--wide' : ''}`
  );
  section.id = `ui-kit-${id}`;
  section.dataset.uiKitSection = id;

  const header = createElement('header', 'ui-kit__section-header');
  header.append(
    createElement('h2', '', title),
    createElement('p', '', description)
  );
  const body = createElement('div', 'ui-kit__stack');
  section.append(header, body);
  return { section, body };
}

function createSpecimen(caption: string): { root: HTMLElement; content: HTMLElement } {
  const root = createElement('div', 'ui-kit__specimen');
  const content = createElement('div', 'ui-kit__stack');
  root.append(content, createElement('p', 'ui-kit__caption', caption));
  return { root, content };
}

function createFoundationsSection(): HTMLElement {
  const { section, body } = createSection(
    'foundations',
    'Foundations & icons',
    'The same Studio tokens and bundled Lucide SVG assets used by the admin shell.',
    'wide'
  );

  const tokens = createElement('div', 'ui-kit__token-row');
  [
    ['Canvas', 'var(--studio-canvas)'],
    ['Surface', 'var(--studio-surface-solid)'],
    ['Muted', 'var(--studio-surface-muted)'],
    ['Accent', 'var(--user-color)']
  ].forEach(([label, color]) => {
    const token = createElement('div', 'ui-kit__token');
    const swatch = createElement('span', 'ui-kit__token-swatch');
    swatch.style.setProperty('--ui-kit-token-color', color || 'transparent');
    token.append(swatch, createElement('span', '', `${label} · ${color}`));
    tokens.appendChild(token);
  });

  const icons = createElement('div', 'ui-kit__icon-grid');
  [
    'component', 'settings', 'bell', 'circle-check', 'triangle-alert', 'circle-x',
    'search', 'pencil-line', 'trash-2', 'external-link', 'layers', 'sparkles'
  ].forEach(name => {
    const tile = createElement('div', 'ui-kit__icon-tile');
    tile.append(createIcon(name), createElement('span', '', name));
    icons.appendChild(tile);
  });

  body.append(tokens, icons);
  return section;
}

function createButtonsSection(): HTMLElement {
  const { section, body } = createSection(
    'buttons',
    'Buttons',
    'Variants, sizes, icon actions, disabled and asynchronous states.'
  );
  const specimen = createSpecimen('.button · .icon-button · .is-loading');
  const variants = createElement('div', 'ui-kit__row');
  variants.append(
    createButton('Primary', 'primary'),
    createButton('Secondary', 'secondary'),
    createButton('Ghost', 'ghost'),
    createButton('Outline', 'outline'),
    createButton('Text action', 'text'),
    createButton('Delete', 'danger')
  );
  const states = createElement('div', 'ui-kit__row');
  const disabled = createButton('Disabled', 'primary');
  disabled.disabled = true;
  const asyncButton = createButton('Save changes', 'primary', button => {
    setButtonLoading(button, true, 'Saving changes');
    window.setTimeout(() => {
      setButtonLoading(button, false);
      bpToast.success('Changes saved.', { title: 'Button state' });
    }, 1300);
  });
  states.append(
    createButton('Small', 'ghost sm'),
    createButton('Large', 'ghost lg'),
    disabled,
    asyncButton,
    createIconButton('pencil-line', 'Edit'),
    createIconButton('trash-2', 'Delete')
  );
  specimen.content.append(variants, states);
  body.appendChild(specimen.root);
  return section;
}

function createFieldsSection(): HTMLElement {
  const { section, body } = createSection(
    'fields',
    'Form controls',
    'Labels, help, validation, text areas, choices and switches share one field contract.',
    'wide'
  );
  const specimen = createSpecimen('.form-field · .form-choice · .form-switch · .form-actions');
  const form = createElement('form', 'ui-kit__form');
  form.noValidate = true;
  form.addEventListener('submit', event => event.preventDefault());

  const grid = createElement('div', 'ui-kit__field-grid');
  const name = createElement('input');
  name.type = 'text';
  name.placeholder = 'Homepage headline';
  const email = createElement('input');
  email.type = 'email';
  email.value = 'editor@blogposter.local';
  const password = createElement('input');
  password.type = 'password';
  password.value = 'component-kit';
  const search = createElement('input');
  search.type = 'search';
  search.placeholder = 'Search components';
  const number = createElement('input');
  number.type = 'number';
  number.value = '12';
  const readonly = createElement('input');
  readonly.type = 'text';
  readonly.value = 'Generated automatically';
  readonly.readOnly = true;
  const invalid = createElement('input');
  invalid.type = 'url';
  invalid.value = 'not-a-valid-url';
  const textarea = createElement('textarea');
  textarea.placeholder = 'Write a short description…';

  grid.append(
    createFormField('Text input', name, { hint: 'Use a concise, descriptive value.' }),
    createFormField('Email', email),
    createFormField('Password', password),
    createFormField('Search', search),
    createFormField('Number', number),
    createFormField('Read-only value', readonly),
    createFormField('Invalid URL', invalid, { error: 'BP_FORM_URL_INVALID: Enter a complete URL.' }),
    createFormField('Textarea', textarea, {
      hint: 'Longer content keeps the same label and validation rhythm.',
      className: 'form-field--wide'
    })
  );

  const choices = createElement('div', 'ui-kit__choice-group');
  const checkbox = createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = true;
  const radioA = createElement('input');
  radioA.type = 'radio';
  radioA.name = 'ui-kit-density';
  radioA.checked = true;
  const radioB = createElement('input');
  radioB.type = 'radio';
  radioB.name = 'ui-kit-density';
  const switchInput = createElement('input');
  switchInput.checked = true;
  choices.append(
    createFormChoice('Checkbox', checkbox),
    createFormChoice('Comfortable', radioA),
    createFormChoice('Compact', radioB),
    createFormSwitch('Live preview', switchInput)
  );

  form.append(
    grid,
    choices,
    createFormActions(
      createButton('Save form', 'primary', () => bpToast.success('Form example submitted.')),
      createButton('Cancel', 'ghost')
    )
  );
  specimen.content.appendChild(form);
  body.appendChild(specimen.root);
  return section;
}

function createPickerSection(): HTMLElement {
  const { section, body } = createSection(
    'pickers',
    'Dropdowns & color picker',
    'Single-selects are upgraded to the shared keyboard-accessible control; no browser-native dropdown is shown.',
    'wide'
  );
  const layout = createElement('div', 'ui-kit__field-grid');

  const selectSpecimen = createSpecimen('select → shared .custom-select');
  const select = createElement('select');
  select.dataset.enhance = 'dropdown';
  [
    ['draft', 'Draft'],
    ['review', 'In review'],
    ['published', 'Published'],
    ['archived', 'Archived']
  ].forEach(([value, label]) => {
    const option = createElement('option', '', label);
    option.value = value || '';
    select.appendChild(option);
  });
  selectSpecimen.content.appendChild(createFormField('Publishing status', select));

  const colorSpecimen = createSpecimen('createColorPicker()');
  const selectedColor = createElement('p', 'form-status', 'Selected color: #21B5B5');
  const pickerHost = createElement('div', 'ui-kit__color-picker');
  const picker = createColorPicker({
    initialColor: '#21B5B5',
    recentColors: ['#21B5B5', '#2563EB', '#16835A'],
    themeColors: ['#FFFFFF', '#F6F7F8', '#1F2933'],
    onSelect: color => {
      selectedColor.textContent = `Selected color: ${color}`;
    }
  });
  pickerHost.appendChild(picker.el);
  colorSpecimen.content.append(selectedColor, pickerHost);
  layout.append(selectSpecimen.root, colorSpecimen.root);
  body.appendChild(layout);
  return section;
}

function createPopoverMenu(onSelect: (label: string) => void): HTMLElement {
  const menu = createElement('div', 'bp-popover__menu');
  [
    ['pencil-line', 'Edit page'],
    ['copy', 'Duplicate'],
    ['archive', 'Archive']
  ].forEach(([iconName, label]) => {
    const item = createElement('button', 'bp-popover__item');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.append(createIcon(iconName || 'component'), createElement('span', '', label));
    item.addEventListener('click', () => onSelect(label || 'Action'));
    menu.appendChild(item);
  });
  return menu;
}

function createOverlaysSection(): HTMLElement {
  const { section, body } = createSection(
    'overlays',
    'Dialogs, prompts & popover',
    'Every example uses the shared overlay APIs with focus restoration, Escape and safe text rendering.'
  );
  const specimen = createSpecimen('bpDialog · bpPopover');
  const actions = createElement('div', 'ui-kit__row');

  actions.append(
    createButton('Alert', 'ghost', () => {
      void bpDialog.alert('The preview is ready to inspect.', { title: 'Preview ready' });
    }),
    createButton('Confirm', 'ghost', () => {
      void bpDialog.confirm('Publish this page now?', { title: 'Publish page' }).then(confirmed => {
        bpToast.info(confirmed ? 'Publish confirmed.' : 'Publish cancelled.');
      });
    }),
    createButton('Prompt', 'ghost', () => {
      void bpDialog.prompt('Choose a page title.', 'New article', {
        title: 'Page title',
        prompt: { label: 'Title', required: true }
      }).then(value => {
        if (value) bpToast.success(`Title set to “${value}”.`);
      });
    }),
    createButton('Multiline prompt', 'ghost', () => {
      void bpDialog.prompt('Add an internal note.', '', {
        title: 'Editorial note',
        prompt: { label: 'Note', multiline: true, placeholder: 'Write a note…' }
      });
    }),
    createButton('Custom modal', 'primary', () => {
      const customBody = createElement('div', 'bp-alert bp-alert--warning');
      customBody.append(
        createIcon('triangle-alert'),
        createElement('p', '', 'This action only demonstrates the destructive modal variant.')
      );
      void bpDialog.open({
        title: 'Delete component example?',
        message: 'The gallery data is temporary and nothing will be removed.',
        body: customBody,
        actions: [
          { id: 'cancel', label: 'Cancel', variant: 'ghost' },
          { id: 'delete', label: 'Delete example', variant: 'danger', autofocus: true }
        ]
      });
    })
  );

  const popoverRow = createElement('div', 'ui-kit__row');
  const popoverButton = createButton('Open action popover', 'secondary');
  popoverButton.classList.add('ui-kit__popover-anchor');
  popoverButton.setAttribute('aria-haspopup', 'menu');
  let handle: BpPopoverHandle | null = null;
  popoverButton.addEventListener('click', () => {
    if (handle) {
      handle.close();
      handle = null;
      return;
    }
    const menu = createPopoverMenu(label => {
      bpToast.info(`${label} selected.`);
      handle?.close();
      handle = null;
    });
    handle = bpPopover.open(popoverButton, {
      content: menu,
      role: 'menu',
      ariaLabel: 'Page actions',
      autoFocus: true,
      onClose: () => { handle = null; }
    });
  });
  popoverRow.append(popoverButton, createElement('span', 'settings-hint', 'Closes on outside click or Escape.'));
  specimen.content.append(actions, popoverRow);
  body.appendChild(specimen.root);
  return section;
}

function createAlert(tone: 'info' | 'success' | 'warning' | 'error', title: string, message: string): HTMLElement {
  const iconNames = {
    info: 'info',
    success: 'circle-check',
    warning: 'triangle-alert',
    error: 'circle-x'
  } as const;
  const alert = createElement('div', `bp-alert bp-alert--${tone}`);
  alert.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  const content = createElement('div', 'bp-alert__content');
  content.append(createElement('strong', '', title), createElement('p', '', message));
  alert.append(createIcon(iconNames[tone]), content);
  return alert;
}

function createFeedbackSection(): HTMLElement {
  const { section, body } = createSection(
    'feedback',
    'Toasts, alerts & status',
    'Transient feedback and persistent inline messages use the same semantic tones.'
  );
  const toastSpecimen = createSpecimen('bpToast.info/success/warning/error');
  const toastActions = createElement('div', 'ui-kit__row');
  toastActions.append(
    createButton('Info toast', 'ghost', () => bpToast.info('A neutral update is available.', { title: 'Information' })),
    createButton('Success toast', 'ghost', () => bpToast.success('Page saved successfully.', { title: 'Saved' })),
    createButton('Warning toast', 'ghost', () => bpToast.warning('Two fields still need review.', { title: 'Review needed' })),
    createButton('Error toast', 'ghost', () => bpToast.error('The request could not be completed.', { title: 'Save failed' })),
    createButton('Toast with action', 'secondary', () => bpToast.info('The draft was moved.', {
      title: 'Draft moved',
      duration: 7000,
      action: {
        label: 'Undo',
        onClick: () => {
          bpToast.success('Move undone.');
        }
      }
    }))
  );
  toastSpecimen.content.appendChild(toastActions);

  const alerts = createElement('div', 'ui-kit__alerts');
  alerts.append(
    createAlert('info', 'Information', 'Use for helpful context that does not block the task.'),
    createAlert('success', 'Complete', 'The operation finished and no further action is required.'),
    createAlert('warning', 'Check this', 'The operation can continue after a quick review.'),
    createAlert('error', 'Could not save', 'BP_UI_KIT_DEMO_ERROR: Try the action again.')
  );
  body.append(toastSpecimen.root, alerts);
  return section;
}

function createLoadingSection(): HTMLElement {
  const { section, body } = createSection(
    'loading',
    'Loading & progress',
    'Inline, spinner, skeleton, overlay, progress and button-loading states are reusable across admin modules.',
    'wide'
  );
  const specimen = createSpecimen('createLoader() · createProgress() · setButtonLoading()');
  const grid = createElement('div', 'ui-kit__loading-grid');
  const small = createElement('div', 'bp-card ui-kit__stack');
  small.append(
    createLoader({ variant: 'inline', label: 'Loading settings…' }),
    createLoader({ variant: 'spinner', label: 'Loading' })
  );
  const progress = createProgress('Publishing assets', 68);
  small.appendChild(progress.element);
  const skeleton = createLoader({ variant: 'skeleton', label: 'Loading content preview', lines: 5 });
  const overlay = createLoader({ variant: 'overlay', label: 'Preparing preview…' });
  grid.append(small, skeleton, overlay);
  specimen.content.appendChild(grid);
  body.appendChild(specimen.root);
  return section;
}

function createDataSection(): HTMLElement {
  const { section, body } = createSection(
    'data',
    'Tabs, badges, cards & table',
    'Reusable navigation and data-display patterns complete the everyday admin surface.',
    'wide'
  );
  const badgeRow = createElement('div', 'ui-kit__row');
  [
    ['Neutral', ''],
    ['Information', 'info'],
    ['Published', 'success'],
    ['Review', 'warning'],
    ['Failed', 'error']
  ].forEach(([label, tone]) => {
    badgeRow.appendChild(createElement('span', `bp-badge${tone ? ` bp-badge--${tone}` : ''}`, label));
  });

  const tabSpecimen = createSpecimen('createTabSystem() · Arrow keys, Home and End supported');
  const tabsRoot = createElement('div', 'ui-kit__data-tabs');
  const tabsHost = createElement('nav');
  tabsHost.setAttribute('aria-label', 'Example content states');
  const panelsHost = createElement('div');
  const tabs = createTabSystem(panelsHost, tabsHost);
  tabs.addTab('Overview').appendChild(createElement('p', 'settings-hint', 'Overview panel content.'));
  tabs.addTab('Activity').appendChild(createElement('p', 'settings-hint', 'Activity panel content.'));
  tabs.addTab('Permissions').appendChild(createElement('p', 'settings-hint', 'Permissions panel content.'));
  tabsRoot.append(tabsHost, panelsHost);
  tabSpecimen.content.appendChild(tabsRoot);

  const tableWrap = createElement('div', 'bp-table-wrap');
  const table = createElement('table', 'bp-table');
  const caption = createElement('caption', 'bp-sr-only', 'Example pages');
  const head = createElement('thead');
  const headRow = createElement('tr');
  ['Page', 'Status', 'Updated', 'Owner'].forEach(label => headRow.appendChild(createElement('th', '', label)));
  head.appendChild(headRow);
  const tbody = createElement('tbody');
  [
    ['Landing page', 'Published', '2 min ago', 'Matteo'],
    ['Release notes', 'Review', '1 hour ago', 'Editorial'],
    ['Documentation', 'Draft', 'Yesterday', 'Team']
  ].forEach(row => {
    const tr = createElement('tr');
    row.forEach(value => tr.appendChild(createElement('td', '', value)));
    tbody.appendChild(tr);
  });
  table.append(caption, head, tbody);
  tableWrap.appendChild(table);

  const footer = createElement('div', 'ui-kit__row');
  const pagination = createElement('nav', 'bp-pagination');
  pagination.setAttribute('aria-label', 'Example pagination');
  ['1', '2', '3'].forEach((label, index) => {
    const page = createElement('button', '', label);
    page.type = 'button';
    page.setAttribute('aria-label', `Page ${label}`);
    if (index === 0) page.setAttribute('aria-current', 'page');
    pagination.appendChild(page);
  });
  footer.append(pagination);

  const empty = createElement('div', 'bp-empty-state');
  empty.append(
    createIcon('inbox'),
    createElement('strong', '', 'Nothing here yet'),
    createElement('p', '', 'Create the first item or adjust the current filters.'),
    createButton('Create item', 'primary')
  );
  body.append(badgeRow, tabSpecimen.root, tableWrap, footer, empty);
  return section;
}

function createJumpNavigation(sections: HTMLElement[]): HTMLElement {
  const navigation = createElement('nav', 'ui-kit__jump-nav');
  navigation.setAttribute('aria-label', 'UI Kit sections');
  sections.forEach(section => {
    const title = section.querySelector('h2')?.textContent || section.dataset.uiKitSection || 'Section';
    const button = createButton(title, 'ghost sm', () => {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    navigation.appendChild(button);
  });
  return navigation;
}

export function renderUiKitGallery(target: HTMLElement): void {
  if (!target) {
    throw new Error('BP_UI_KIT_TARGET_MISSING: A gallery target is required.');
  }

  const root = createElement('section', 'settings-surface page-list-card ui-kit');
  root.dataset.uiKitGallery = 'true';
  const header = createElement('header', 'settings-surface-header page-title-bar ui-kit__header');
  const copy = createElement('div', 'ui-kit__header-copy');
  copy.append(
    createElement('h1', 'page-title', 'Blogposter UI Kit'),
    createElement('p', 'settings-hint', 'Interactive reference for the canonical admin components and their states.')
  );
  header.append(copy, createElement('span', 'bp-badge bp-badge--success', 'Live components'));

  const sections = [
    createFoundationsSection(),
    createButtonsSection(),
    createFieldsSection(),
    createPickerSection(),
    createOverlaysSection(),
    createFeedbackSection(),
    createLoadingSection(),
    createDataSection()
  ];
  const sectionGrid = createElement('div', 'ui-kit__sections');
  sectionGrid.append(...sections);
  root.append(header, createJumpNavigation(sections), sectionGrid);
  target.replaceChildren(root);

  // Settings can render inside the admin widget ShadowRoot; explicitly bind
  // that root so the example never falls back to a browser-native select.
  enhanceSelects(root);
}
