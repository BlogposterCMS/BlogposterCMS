/**
 * @jest-environment jsdom
 */

import {
  applyRuntimeDesignStyles,
  getRuntimeDesignLayout,
  normalizeRuntimeDesignWidget
} from '../ui/runtime/main/runtimeDesignLayouts';

describe('runtimeDesignLayouts', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('normalizes designer widgets into runtime layout items', () => {
    expect(normalizeRuntimeDesignWidget({
      instance_id: 'hero-1',
      widget_id: 'hero',
      x_percent: 10,
      y_percent: '20',
      w_percent: 30,
      h_percent: '40',
      z_index: '5',
      rotation_deg: '12.5',
      metadata: '{"opacity":75,"cornerRadius":8,"sceneId":"scene-hero","effects":[{"id":"fadeIn"}]}',
      html: '<p>Hello</p>',
      css: '.hero{}',
      js: 'window.ok = true;'
    })).toEqual({
      id: 'hero-1',
      widgetId: 'hero',
      xPercent: 10,
      yPercent: '20',
      wPercent: 30,
      hPercent: '40',
      layer: 5,
      rotationDeg: 12.5,
      opacity: 75,
      radius: 8,
      elementName: undefined,
      behavior: undefined,
      sceneId: 'scene-hero',
      sceneTitle: undefined,
      sceneBackground: undefined,
      scrollStart: undefined,
      scrollEnd: undefined,
      effects: [{ id: 'fadeIn' }],
      zIndex: '5',
      code: {
        html: '<p>Hello</p>',
        css: '.hero{}',
        js: 'window.ok = true;',
        meta: {
          opacity: 75,
          cornerRadius: 8,
          sceneId: 'scene-hero',
          effects: [{ id: 'fadeIn' }]
        },
        metadata: '{"opacity":75,"cornerRadius":8,"sceneId":"scene-hero","effects":[{"id":"fadeIn"}]}'
      }
    });
  });

  it('extracts only valid runtime design layout items', () => {
    expect(getRuntimeDesignLayout({
      widgets: [
        null,
        { instanceId: 'a', widgetId: 'text' },
        'bad',
        { instance_id: 'b', widget_id: 'image' }
      ]
    }).map(item => item.id)).toEqual(['a', 'b']);
  });

  it('applies safe design surface styles', () => {
    const target = document.createElement('section');

    applyRuntimeDesignStyles(target, {
      bg_color: '#112233',
      bg_media_url: '/media/hero.jpg'
    });

    expect(target.style.backgroundColor).toBe('rgb(17, 34, 51)');
    expect(target.style.backgroundImage).toBe('url(/media/hero.jpg)');

    applyRuntimeDesignStyles(target, {
      bg_media_url: 'javascript:alert(1)'
    });

    expect(target.style.backgroundImage).toBe('url(/media/hero.jpg)');
  });
});
