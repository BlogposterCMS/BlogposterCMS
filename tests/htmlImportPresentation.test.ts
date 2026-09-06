/** @jest-environment jsdom */
import { applyHtmlImportPresentation } from '../ui/shared/layout/htmlImportPresentation';


test('captured page height follows the authored width and yields to an explicit Section resize', () => {
  const root = document.createElement('section');
  root.dataset.nodeId = 'html-import-ab12';
  root.dataset.layoutMinHeight = '320px';
  const widget = document.createElement('div');
  root.append(widget);
  let width = 390;
  Object.defineProperty(root, 'clientWidth', { get: () => width });
  let resize: () => void = () => {};
  const original = global.ResizeObserver;
  global.ResizeObserver = class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() {} unobserve() {} } as any;
  try {
    applyHtmlImportPresentation(widget, { page: { rootId: 'html-import-ab12', initialMinHeight: '320px', frames: [
      { minWidth: 320, maxWidth: 600, height: 4000 }, { minWidth: 601, maxWidth: 3840, height: 2000 }
    ] } });
    expect(root.style.minHeight).toBe('4000px');
    width = 1440;
    resize();
    expect(root.style.minHeight).toBe('2000px');
    root.dataset.layoutMinHeight = '2500px';
    root.style.minHeight = '2500px';
    width = 390;
    resize();
    expect(root.style.minHeight).toBe('2500px');
  } finally { global.ResizeObserver = original; }
});
