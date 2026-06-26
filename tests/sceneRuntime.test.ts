/**
 * @jest-environment jsdom
 */

import {
  applyItemAppearance,
  applySceneMetadata,
  getSceneMetadata,
  mergeSceneMetaIntoCode,
  normalizeEffects,
  normalizeRuntimeOpacity
} from '../ui/runtime/main/sceneRuntime';

describe('sceneRuntime', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('merges scene metadata from code and item sources with item values winning', () => {
    const meta = getSceneMetadata({
      code: {
        metadata: '{"sceneId":"from-code-metadata","sceneTitle":"Code metadata"}',
        meta: { sceneId: 'from-code-meta', sceneBackground: '/hero.jpg' }
      },
      metadata: '{"sceneTitle":"Item metadata"}',
      meta: { sceneId: 'from-item-meta' }
    });

    expect(meta).toEqual({
      sceneId: 'from-item-meta',
      sceneTitle: 'Item metadata',
      sceneBackground: '/hero.jpg'
    });
  });

  it('applies scene datasets, normalized behavior, effects, and opacity', () => {
    const wrapper = document.createElement('div');

    applySceneMetadata(wrapper, {
      behavior: 'sticky',
      scene_id: 'hero',
      code: {
        meta: {
          sceneTitle: 'Hero',
          effects: [{ id: 'fadeIn', start: 0, end: 40 }]
        }
      },
      opacity: '75',
      corner_radius: 12
    });

    expect(wrapper.dataset.behavior).toBe('sticky');
    expect(wrapper.dataset.sceneId).toBe('hero');
    expect(wrapper.dataset.sceneTitle).toBe('Hero');
    expect(wrapper.dataset.opacity).toBe('75');
    expect(wrapper.dataset.radius).toBe('12');
    expect(wrapper.style.opacity).toBe('0.75');
    expect(wrapper.classList.contains('scene-runtime-item--sticky')).toBe(true);
    expect(wrapper.classList.contains('scene-runtime-item--with-effects')).toBe(true);
    expect(normalizeEffects(wrapper.dataset.effects)).toEqual([
      { id: 'fadeIn', start: 0, end: 40 }
    ]);
  });

  it('merges scene metadata into custom widget code before rendering', () => {
    const merged = mergeSceneMetaIntoCode(
      { html: '<p>Hello</p>', meta: '{"sceneId":"from-code"}' },
      {
        sceneId: 'from-item',
        sceneTitle: 'Merged',
        effects: '[{"id":"moveY","distance":32}]'
      }
    );

    expect(merged).toEqual({
      html: '<p>Hello</p>',
      meta: {
        sceneId: 'from-item',
        sceneTitle: 'Merged',
        effects: [{ id: 'moveY', distance: 32 }]
      }
    });
  });

  it('applies runtime opacity and radius to rendered item content', () => {
    const wrapper = document.createElement('div');
    wrapper.dataset.opacity = '40';
    wrapper.dataset.radius = '12.345';
    const content = document.createElement('div');
    content.className = 'canvas-item-content';
    wrapper.appendChild(content);

    applyItemAppearance(wrapper);

    expect(wrapper.style.opacity).toBe('0.4');
    expect(content.style.borderRadius).toBe('12.35px');
    expect(normalizeRuntimeOpacity(150)).toBe(1);
    expect(normalizeRuntimeOpacity(-1)).toBe(0);
  });
});
