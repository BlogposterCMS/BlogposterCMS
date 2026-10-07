/** @jest-environment jsdom */
'use strict';

const { toSvg } = require('../ui/shared/vendor/html-to-img');

test('DOM capture keeps textarea closing tags and executable-looking markup as literal text', async () => {
  const original = window.getComputedStyle;
  const originalSvgImage = global.SVGImageElement;
  // jsdom lacks this native browser class used by the capture dependency.
  global.SVGImageElement = class extends SVGElement {};
  window.getComputedStyle = element => original(element);
  const field = document.createElement('textarea');
  field.value = '</textarea><img src=x onerror=alert(1)><script>bad()</script>';
  document.body.append(field);
  try {
    const result = await toSvg(field, { width: 240, height: 80, skipFonts: true });
    const svg = new DOMParser().parseFromString(decodeURIComponent(result.split(',')[1]), 'image/svg+xml');
    expect(svg.querySelector('textarea').textContent).toBe(field.value);
    expect(svg.querySelector('script,img')).toBeNull();
  } finally {
    field.remove(); window.getComputedStyle = original;
    if (originalSvgImage === undefined) delete global.SVGImageElement; else global.SVGImageElement = originalSvgImage;
  }
});
