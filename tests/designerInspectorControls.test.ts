/** @jest-environment jsdom */

jest.mock('/ui/shared/controls/customSelect.js', () => jest.requireActual('../ui/shared/controls/customSelect'), { virtual: true });
import { mountInspectorControls } from '../ui/designer/app/managers/inspectorControls.js';

test('organizes original Container controls into shared keyboard-accessible tabs', () => {
  document.body.dataset.customSelectScope = 'explicit';
  document.body.innerHTML = `<aside id="inspector">
    <div class="scene-inspector-modebar"></div>
    <section class="scene-section-settings" data-inspector-panel="content">
      <h3>Container</h3><label>Direction<select><option>Vertical</option><option>Horizontal</option></select></label>
      <div class="scene-container-position"><button>Sticky</button></div>
      <label><input class="scene-section-background" type="color"></label>
      <input data-container-border="borderRightWidth" value="1">
    </section>
  </aside>`;
  const inspector = document.querySelector('#inspector') as HTMLElement;
  const border = inspector.querySelector('[data-container-border]');
  const onModeChange = jest.fn();
  mountInspectorControls(inspector, onModeChange);
  expect(inspector.querySelector('[data-inspector-tab-panel="style"]')?.contains(border!)).toBe(true);
  expect(inspector.querySelector('[data-inspector-tab-panel="behavior"] .scene-container-position')).not.toBeNull();
  const first = inspector.querySelector<HTMLButtonElement>('[role="tab"]')!;
  expect(first.closest('.designer-ui-controls .app-scope')).not.toBeNull();
  first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  expect(onModeChange).toHaveBeenLastCalledWith('style');
  expect(inspector.querySelector('[data-inspector-tab-panel="style"]')?.hasAttribute('hidden')).toBe(false);
  expect(inspector.querySelector('[data-inspector-tab-panel="content"]')?.hasAttribute('hidden')).toBe(true);
  expect(inspector.querySelector('.custom-select')).not.toBeNull();
  delete document.body.dataset.customSelectScope;
});

