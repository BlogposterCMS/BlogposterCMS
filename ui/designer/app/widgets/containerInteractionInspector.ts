import { normalizeContainerInteraction, type ContainerInteraction } from '../../../shared/layout/containerInteractionModel.js';

type Selection = { id: string; interaction?: ContainerInteraction };
type Target = { id: string; label: string };
type Options = {
  read: () => Selection | null;
  targets: () => Target[];
  apply: (interaction: ContainerInteraction | null) => void;
};
const conditions = {
  always: undefined,
  query: { ref: 'state.query', operator: 'notEmpty' },
  loading: { ref: 'data.articles.status', operator: 'equals', value: 'loading' },
  ready: { ref: 'data.articles.status', operator: 'equals', value: 'ready' },
  results: { ref: 'data.articles.result.items', operator: 'notEmpty' },
  error: { ref: 'data.articles.status', operator: 'equals', value: 'error' }
} as const;

/** Edits canonical container settings. The canvas stays editable; live preview runs the rules. */
export function createContainerInteractionInspector(inspector: HTMLElement, options: Options) {
  const group = document.createElement('section');
  group.className = 'scene-inspector-group';
  group.dataset.inspectorPanel = 'behavior';
  group.dataset.containerPanel = 'true';
  group.dataset.containerInteractions = 'true';
  (inspector.querySelector('[data-inspector-tab-panel="behavior"]') || inspector).append(group);
  let selectedId = '';

  function apply(patch: Partial<ContainerInteraction>) {
    const current = options.read();
    if (!current || current.id !== selectedId) return;
    try {
      const value = normalizeContainerInteraction({ version: 1, presentation: 'normal', ...current.interaction, ...patch });
      options.apply(value || null);
      sync();
    } catch (error) {
      const warning = document.createElement('p'); warning.setAttribute('role', 'alert');
      warning.textContent = `Check the interaction settings. ${(error as Error).message}`;
      group.append(warning);
    }
  }

  function select(label: string, key: string, value: string, choices: Array<[string, string]>, change: (value: string) => void) {
    const wrapper = document.createElement('label'); wrapper.className = 'scene-select-field';
    const caption = document.createElement('span'); caption.textContent = label;
    const input = document.createElement('select'); input.dataset.interactionField = key; input.id = `designer-container-${key}`;
    choices.forEach(([id, title]) => input.add(new Option(title, id)));
    if (value && !choices.some(([id]) => id === value)) input.add(new Option(`Missing target: ${value}`, value));
    input.value = value;
    input.addEventListener('change', () => change(input.value));
    wrapper.append(caption, input); group.append(wrapper);
  }

  function sync() {
    const current = options.read();
    group.hidden = !current; group.replaceChildren();
    if (!current) { selectedId = ''; return; }
    selectedId = current.id;
    const heading = document.createElement('h3'); heading.textContent = 'Events & data'; group.append(heading);
    select('Behavior', 'enabled', current.interaction ? 'yes' : 'no', [['no', 'Static container'], ['yes', 'Interactive container']], value => {
      if (value === 'yes') apply({ presentation: 'normal' }); else { options.apply(null); sync(); }
    });
    const settings = current.interaction;
    if (!settings) return;
    const targets: Array<[string, string]> = [['', 'Select an element…'], ...options.targets().filter(target => target.id !== current.id).map(target => [target.id, target.label] as [string, string])];
    select('Show as', 'presentation', settings.presentation, [['normal', 'Container in page'], ['popover', 'Popover by trigger'], ['dialog', 'Modal dialog'], ['drawer', 'Side drawer']], value => apply({ presentation: value as ContainerInteraction['presentation'] }));
    select('When this element', 'triggerId', settings.triggerId || '', targets, value => apply({ triggerId: value || undefined }));
    select('Receives', 'triggerEvent', settings.triggerEvent || 'click', [['click', 'Click'], ['input', 'Text input'], ['focus', 'Focus']], value => apply({ triggerEvent: value as ContainerInteraction['triggerEvent'] }));
    select('Data source', 'source', settings.source || '', [['', 'No data request'], ['sampleArticles', 'Example articles (no request)'], ['publishedArticles', 'Published articles']], value => apply({ source: (value || undefined) as ContainerInteraction['source'] }));
    if (settings.source) {
      select('Search text from', 'queryId', settings.queryId || settings.triggerId || '', targets, value => apply({ queryId: value || undefined }));
      select('Display field', 'labelField', settings.labelField || 'title', [['title', 'Article title'], ['excerpt', 'Article excerpt'], ['path', 'Article path']], value => apply({ labelField: value }));
      select('On result click', 'linkField', settings.linkField || '', [['', 'Display text'], ['path', 'Open article path']], value => apply({ linkField: value || undefined }));
    }
    const selectedCondition = Object.entries(conditions).find(([, condition]) => JSON.stringify(condition) === JSON.stringify(settings.when))?.[0] || 'custom';
    select('Visible when', 'when', selectedCondition, [['always', 'Always / while opened'], ['query', 'Search text is not empty'], ['loading', 'Data is loading'], ['ready', 'Data loaded successfully'], ['results', 'Results are not empty'], ['error', 'Data request failed'], ...(selectedCondition === 'custom' ? [['custom', 'Custom saved condition'] as [string, string]] : [])], value => {
      if (value !== 'custom') apply({ when: conditions[value as keyof typeof conditions] });
    });
    const hint = document.createElement('small');
    hint.textContent = 'Arrange and style the contents here. Use Live preview to run the interaction; sample articles never contact a module.';
    group.append(hint);
  }
  return { sync };
}
