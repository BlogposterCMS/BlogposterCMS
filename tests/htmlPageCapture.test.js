/** @jest-environment jsdom */
const { captureHtmlPage } = require('../tools/html-import/capture');

test('splits page-wide decoration into its semantic Sections', async () => {
  document.body.innerHTML = '<main style="background-color: white"><section><h1>First</h1></section><section><p>Second</p></section></main>';
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
  Object.defineProperty(document.body, 'scrollHeight', { configurable: true, value: 600 });
  global.requestAnimationFrame = callback => callback();
  const originalStyle = window.getComputedStyle;
  const rect = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    const second = this === document.querySelectorAll('section')[1] || this.tagName === 'P';
    return { x: 0, y: second ? 300 : 0, width: 400, height: this.tagName === 'MAIN' ? 600 : 300 };
  });
  const style = jest.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => pseudo ? { content: 'none' } : originalStyle(el));
  try {
    const capture = await captureHtmlPage();
    const backgrounds = capture.elements.filter(el => el.id.startsWith('node-1-decoration'));
    expect(backgrounds).toHaveLength(2);
    expect(backgrounds.map(el => el.rect.h)).toEqual([300, 300]);
    expect(backgrounds.map(el => el.parentId)).toEqual(capture.structure.sections.map(section => section.id));
  } finally { rect.mockRestore(); style.mockRestore(); }
});

test('capture excludes measurable children of transparent ancestors', async () => {
  document.body.innerHTML = '<div style="opacity:0"><p>Hidden menu</p></div><h1>Visible heading</h1>';
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
  global.requestAnimationFrame = callback => callback();
  const originalStyle = window.getComputedStyle;
  // jsdom has no layout or pseudo-element rendering; provide only those browser boundaries.
  const rect = jest.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, width: 200, height: 40 });
  const style = jest.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) =>
    pseudo ? { content: 'none' } : originalStyle(element));
  try {
    const capture = await captureHtmlPage();
    expect(capture.elements.some(element => element.html.includes('Hidden menu'))).toBe(false);
    expect(capture.elements.some(element => element.html.includes('Visible heading'))).toBe(true);
  } finally { rect.mockRestore(); style.mockRestore(); }
});
