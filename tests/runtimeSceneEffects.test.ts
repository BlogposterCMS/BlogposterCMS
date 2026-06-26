/**
 * @jest-environment jsdom
 */

import {
  hasSceneMotion,
  registerSceneEffects
} from '../ui/runtime/main/runtimeSceneEffects';

describe('runtimeSceneEffects', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.requestAnimationFrame = callback => {
      callback(0);
      return 1;
    };
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: 100
    });
  });

  it('detects motion only for non-scroll behavior or effects', () => {
    const wrapper = document.createElement('div');
    wrapper.dataset.behavior = 'scroll';

    expect(hasSceneMotion(wrapper)).toBe(false);

    wrapper.dataset.behavior = 'pinned';
    expect(hasSceneMotion(wrapper)).toBe(true);

    wrapper.dataset.behavior = 'scroll';
    wrapper.dataset.effects = '[{"id":"fadeIn"}]';
    expect(hasSceneMotion(wrapper)).toBe(true);
  });

  it('registers connected scene items and applies effect progress on animation frames', () => {
    const wrapper = document.createElement('div');
    const content = document.createElement('div');
    content.className = 'canvas-item-content';
    wrapper.dataset.behavior = 'scroll';
    wrapper.dataset.effects = '[{"id":"fadeIn","start":0,"end":100}]';
    wrapper.getBoundingClientRect = jest.fn(() => ({
      width: 100,
      height: 0,
      top: 50,
      right: 100,
      bottom: 50,
      left: 0,
      x: 0,
      y: 50,
      toJSON: () => ({})
    }));
    wrapper.appendChild(content);
    document.body.appendChild(wrapper);

    registerSceneEffects(wrapper);

    expect(wrapper.dataset.effectProgress).toBe('50');
    expect(content.style.opacity).toBe('0.5');
    expect(content.style.transition).toContain('opacity 120ms linear');
  });
});
