import { createTabSystem } from '/ui/shared/navigation/tabs.js';
import enhanceSelects from '/ui/shared/controls/customSelect.js';

/** Reuse the shared tabs; existing field nodes keep their delegated handlers. */
export function mountInspectorControls(inspector, onModeChange) {
  inspector.classList.add('designer-ui-controls');
  const layout = inspector.querySelector('.scene-section-settings');
  layout.dataset.containerPanel = 'layout';
  const appearance = document.createElement('section');
  appearance.className = 'scene-inspector-group';
  appearance.dataset.inspectorPanel = 'style';
  appearance.dataset.containerPanel = 'appearance';
  appearance.innerHTML = '<h3>Appearance</h3>';
  let moveAppearance = false;
  Array.from(layout.children).forEach(child => {
    if (child.querySelector('.scene-section-background')) moveAppearance = true;
    if (moveAppearance) appearance.appendChild(child);
  });
  const behavior = document.createElement('section');
  behavior.className = 'scene-inspector-group';
  behavior.dataset.inspectorPanel = 'behavior';
  behavior.dataset.containerPanel = 'behavior';
  behavior.innerHTML = '<h3>Scroll position</h3>';
  behavior.appendChild(layout.querySelector('.scene-container-position'));
  inspector.append(appearance, behavior);
  // Background is edited at its owning canvas toolbar. Keep field nodes for
  // existing synchronization hooks, without presenting duplicate controls.
  inspector.querySelectorAll('.scene-section-background, .scene-section-transparent')
    .forEach(field => { field.closest('label').hidden = true; });

  const groups = Array.from(inspector.querySelectorAll(':scope > [data-inspector-panel]'));
  const tabsHost = inspector.querySelector('.scene-inspector-modebar');
  // Shared button styles require an app scope inside the isolated chrome root.
  tabsHost.classList.add('app-scope');
  tabsHost.replaceChildren();
  const panels = document.createElement('div');
  panels.className = 'scene-inspector-panels';
  inspector.appendChild(panels);
  const modes = ['content', 'style', 'behavior'];
  const tabs = createTabSystem(panels, tabsHost, {
    onSelect: index => {
      onModeChange(modes[index]);
      enhanceSelects(inspector);
    }
  });
  ['Content', 'Appearance', 'Behavior'].forEach((label, index) => {
    const panel = tabs.addTab(label);
    const mode = modes[index];
    panel.dataset.inspectorTabPanel = mode;
    tabsHost.children[index].dataset.inspectorMode = mode;
    groups.filter(group => group.dataset.inspectorPanel === mode).forEach(group => panel.appendChild(group));
  });
  enhanceSelects(inspector);
  return { selectMode: mode => tabs.select(modes.indexOf(mode)) };
}
