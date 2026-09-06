/** @jest-environment jsdom */
import { render } from '../ui/widgets/plainspace/public/basicwidgets/galleryWidget';

describe('gallery navigation', () => {
  const items = [{ src: '/a.jpg' }, { src: '/b.jpg' }, { src: '/c.jpg' }];

  it('clips slides without clipping controls and disables unavailable directions', () => {
    const host = document.createElement('div');
    render(host, { instanceMetadata: { items, mode: 'carousel', loop: false } });
    expect(host.querySelector('.bp-gallery-widget__viewport .bp-gallery-widget__items')).not.toBeNull();
    expect(host.querySelector('.bp-gallery-widget__viewport .bp-gallery-widget__controls')).toBeNull();
    const [previous, next] = Array.from(host.querySelectorAll<HTMLButtonElement>('.bp-gallery-widget__controls button'));
    expect(previous!.disabled).toBe(true);
    next!.click(); next!.click();
    expect(next!.disabled).toBe(true);
    expect(previous!.disabled).toBe(false);
    expect(host.querySelectorAll('[aria-current="true"]')).toHaveLength(1);
  });

  it('moves by the slide distance rather than the page offset', () => {
    const host = document.createElement('div');
    render(host, { instanceMetadata: { items, mode: 'carousel' } });
    host.querySelectorAll('.bp-gallery-widget__item').forEach((item, i) => {
      Object.defineProperty(item, 'offsetLeft', { value: 200 + i * 100 });
    });
    host.querySelectorAll<HTMLButtonElement>('.bp-gallery-widget__controls button')[1]!.click();
    expect(host.querySelector<HTMLElement>('.bp-gallery-widget__items')!.style.transform).toBe('translate3d(-100px, 0, 0)');
  });

  it('keeps hidden fade slides out of keyboard navigation', () => {
    const host = document.createElement('div');
    render(host, { instanceMetadata: { items, mode: 'carousel', animation: 'fade' } });
    const slides = host.querySelectorAll<HTMLElement>('.bp-gallery-widget__item');
    expect(slides[0]!.inert).toBe(false);
    expect(slides[1]!.inert).toBe(true);
    host.querySelectorAll<HTMLButtonElement>('.bp-gallery-widget__controls button')[1]!.click();
    expect(slides[0]!.inert).toBe(true);
    expect(slides[1]!.inert).toBe(false);
  });
});
