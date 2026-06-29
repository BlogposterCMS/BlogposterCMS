/**
 * @jest-environment jsdom
 */

import {
  applyWidgetStyleSources,
  followWidgetStyleSource,
  markWidgetStyleSource,
  unlinkWidgetStyleSource
} from '../ui/designer/app/widgets/styleSourceSync';

describe('designer widget style source sync', () => {
  function canvasItem(instanceId: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'canvas-item';
    el.dataset.instanceId = instanceId;
    const content = document.createElement('div');
    content.className = 'canvas-item-content';
    el.appendChild(content);
    return el;
  }

  it('marks a widget as source and lets followers copy style without content', () => {
    const source = canvasItem('leader');
    const follower = canvasItem('follower');
    source.setAttribute('gs-w', '6');
    source.setAttribute('gs-h', '4');
    source.dataset.opacity = '0.7';
    source.dataset.radius = '16';
    source.textContent = 'Leader content';
    follower.textContent = 'Follower content';

    expect(followWidgetStyleSource(follower, source)).toBe(true);

    expect(source.dataset.styleSourceRole).toBe('source');
    expect(follower.dataset.styleSourceRole).toBe('follower');
    expect(follower.dataset.styleSourceId).toBe('leader');
    expect(follower.getAttribute('gs-w')).toBe('6');
    expect(follower.getAttribute('gs-h')).toBe('4');
    expect(follower.dataset.opacity).toBe('0.7');
    expect(follower.dataset.radius).toBe('16');
    expect(follower.textContent).toBe('Follower content');
  });

  it('syncs active followers when the source design changes', () => {
    const root = document.createElement('section');
    const source = canvasItem('leader');
    const follower = canvasItem('follower');
    root.append(source, follower);
    followWidgetStyleSource(follower, source);

    source.setAttribute('gs-w', '9');
    source.dataset.opacity = '0.5';
    source.dataset.radius = '20';
    source.dataset.effects = JSON.stringify([{ id: 'fade', enabled: true, start: 10, end: 90 }]);

    const onFollower = jest.fn();
    expect(applyWidgetStyleSources(root, source, { onFollower })).toBe(1);

    expect(follower.getAttribute('gs-w')).toBe('9');
    expect(follower.dataset.opacity).toBe('0.5');
    expect(follower.dataset.radius).toBe('20');
    expect(follower.dataset.effects).toContain('fade');
    expect(onFollower).toHaveBeenCalledWith(follower, source);
  });

  it('does not update unlinked followers', () => {
    const root = document.createElement('section');
    const source = canvasItem('leader');
    const follower = canvasItem('follower');
    root.append(source, follower);
    followWidgetStyleSource(follower, source);
    unlinkWidgetStyleSource(follower);
    source.dataset.radius = '24';

    expect(applyWidgetStyleSources(root, source)).toBe(0);
    expect(follower.dataset.radius).not.toBe('24');
  });

  it('can explicitly mark a source without creating a follower', () => {
    const source = canvasItem('leader');

    markWidgetStyleSource(source);

    expect(source.dataset.styleSourceEnabled).toBe('true');
    expect(source.dataset.styleSourceRole).toBe('source');
    expect(source.dataset.styleSourceId).toBeUndefined();
  });
});
