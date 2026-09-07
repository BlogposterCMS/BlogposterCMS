/** @jest-environment jsdom */
const { firstSectionCapture } = require('../ui/shared/preview/sectionCapture');
test('captures first Section at untransformed dimensions and crops a tall section', () => {
  const root = document.createElement('div');
  root.innerHTML = '<section class="layout-section" data-section-id="first"></section><section class="layout-section" data-section-id="second"></section>';
  const section = root.firstElementChild;
  Object.defineProperty(section, 'offsetWidth', { value: 1440 });
  Object.defineProperty(section, 'scrollHeight', { value: 3000 });
  section.getBoundingClientRect = () => ({ width: 360, height: 750 });
  const result = firstSectionCapture(root);
  expect(result.target).toBe(section);
  expect(result.options).toMatchObject({ width: 1440, height: 810, canvasWidth: 960, canvasHeight: 540, style: { transform: 'none' } });
});
