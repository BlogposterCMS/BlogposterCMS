/**
 * @jest-environment jsdom
 */

jest.mock('/ui/runtime/main/script-utils.js', () => ({
  executeJs: jest.fn()
}));

import { addHitLayer } from '../ui/designer/app/utils.js';

describe('Designer widget hit layers', () => {
  it('keeps CanvasGrid items absolutely positioned for drag and resize math', () => {
    const widget = document.createElement('div');
    widget.className = 'canvas-item';
    widget.style.position = 'absolute';

    addHitLayer(widget);

    expect(widget.style.position).toBe('absolute');
    expect(widget.querySelector('.hit-layer')).toBeInstanceOf(HTMLElement);
  });

  it('still positions inner widget wrappers so the transparent shield is anchored', () => {
    const wrapper = document.createElement('div');

    addHitLayer(wrapper);

    expect(wrapper.style.position).toBe('relative');
    expect(wrapper.querySelector('.hit-layer')).toBeInstanceOf(HTMLElement);
  });
});
