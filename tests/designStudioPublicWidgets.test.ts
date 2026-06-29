/**
 * @jest-environment jsdom
 */

import { render as renderBreadcrumb } from '../ui/widgets/plainspace/public/basicwidgets/breadcrumbWidget';
import { render as renderButton } from '../ui/widgets/plainspace/public/basicwidgets/buttonWidget';
import { render as renderGallery } from '../ui/widgets/plainspace/public/basicwidgets/galleryWidget';
import { render as renderMedia } from '../ui/widgets/plainspace/public/basicwidgets/mediaWidget';
import { render as renderNavigation } from '../ui/widgets/plainspace/public/basicwidgets/navigationMenuWidget';
import { render as renderTextBox } from '../ui/widgets/plainspace/public/basicwidgets/textBoxWidget';

describe('Design Studio public widgets', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.pushState({}, '', '/work/projects/demo');
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (globalThis as typeof globalThis & { fetch?: unknown }).fetch;
  });

  it('renders rich text through the existing textBox widget id', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);

    await renderTextBox(host, {
      id: 'copy-1',
      instanceMetadata: {
        heading: 'Studio heading',
        body: 'Human readable copy'
      }
    });

    expect(host.querySelector('.widget-rich-text h2')?.textContent).toBe('Studio heading');
    expect(host.querySelector('.widget-rich-text p')?.textContent).toBe('Human readable copy');
    expect(host.querySelector('.hit-layer')).toBeNull();
  });

  it('renders media and blocks unsafe media URLs', () => {
    const host = document.createElement('div');
    renderMedia(host, {
      instanceMetadata: {
        src: '/media/hero.jpg',
        alt: 'Hero media',
        caption: 'Hero caption',
        aspectRatio: '16/9'
      }
    });

    expect(host.querySelector('img')?.getAttribute('src')).toBe('/media/hero.jpg');
    expect(host.querySelector('img')?.getAttribute('alt')).toBe('Hero media');
    expect(host.querySelector('figcaption')?.textContent).toBe('Hero caption');

    renderMedia(host, { instanceMetadata: { src: 'javascript:alert(1)' } });
    expect(host.querySelector('[data-error-code="BP_WIDGET_MEDIA_EMPTY"]')).not.toBeNull();
  });

  it('renders safe button links and reports unsafe ones', () => {
    const host = document.createElement('div');
    renderButton(host, {
      instanceMetadata: {
        label: 'Read more',
        href: '/about',
        variant: 'secondary'
      }
    });

    const link = host.querySelector('a') as HTMLAnchorElement | null;
    expect(link?.textContent).toBe('Read more');
    expect(link?.getAttribute('href')).toBe('/about');
    expect(link?.className).toContain('bp-button-widget--secondary');

    renderButton(host, { instanceMetadata: { href: 'javascript:alert(1)' } });
    expect(host.querySelector('[data-error-code="BP_WIDGET_BUTTON_UNSAFE_URL"]')).not.toBeNull();
  });

  it('renders navigation from the public navigation API', async () => {
    const host = document.createElement('div');
    (globalThis as typeof globalThis & { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tree: [
          { label: 'Home', url: '/' },
          {
            id: 'work',
            label: 'Work',
            url: '/work',
            target: '_blank',
            rel: 'noopener',
            meta: {
              icon: 'menu',
              visibility: { mobile: false },
              mega: { enabled: true, layoutId: 'mega-work', layoutTitle: 'Work panel' }
            },
            children: [{ label: 'Demo', url: '/work/demo' }]
          }
        ]
      })
    });

    await renderNavigation(host, {
      instanceMetadata: {
        locationKey: 'primary',
        maxDepth: 2
      }
    });

    expect(globalThis.fetch).toHaveBeenCalledWith('/api/public/navigation/primary', {
      headers: { Accept: 'application/json' }
    });
    expect(Array.from(host.querySelectorAll('a')).map(link => link.textContent)).toEqual([
      'Home',
      'Work',
      'Demo'
    ]);
    const work = host.querySelector('[data-item-id="work"]') as HTMLElement | null;
    expect(work?.classList.contains('bp-navigation-widget__item--has-mega')).toBe(true);
    expect(work?.classList.contains('bp-navigation-widget__item--mobile-hidden')).toBe(true);
    expect(work?.dataset.megaLayoutId).toBe('mega-work');
    expect(host.querySelector('[data-layout-id="mega-work"]')?.textContent).toContain('Work panel');
    expect(host.querySelector('a[target="_blank"]')?.getAttribute('rel')).toBe('noopener');
  });

  it('renders breadcrumb fallback items from the current path', () => {
    const host = document.createElement('div');
    renderBreadcrumb(host, { instanceMetadata: { homeLabel: 'Start' } });

    expect(Array.from(host.querySelectorAll('li')).map(item => item.textContent)).toEqual([
      'Start',
      '/Work',
      '/Projects',
      '/Demo'
    ]);
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe('Demo');
  });

  it('renders gallery grids and carousel controls from media items', () => {
    const host = document.createElement('div');
    renderGallery(host, {
      instanceMetadata: {
        mode: 'carousel',
        items: [
          { src: '/media/one.jpg', alt: 'One', caption: 'First' },
          { src: '/media/two.jpg', alt: 'Two' }
        ]
      }
    });

    expect(host.querySelectorAll('img')).toHaveLength(2);
    expect(host.querySelector('.bp-gallery-widget--carousel')).not.toBeNull();
    expect(Array.from(host.querySelectorAll('.bp-gallery-widget__controls button')).map(button => button.textContent)).toEqual([
      'Prev',
      'Next'
    ]);
  });

  it('renders gallery layout, fit, focus and slider settings from metadata', () => {
    const host = document.createElement('div');
    renderGallery(host, {
      instanceMetadata: {
        mode: 'masonry',
        columns: 4,
        rows: 2,
        heightMode: 'largest',
        fit: 'contain',
        focalX: 40,
        focalY: 60,
        items: [
          { src: '/media/one.jpg', alt: 'One', fit: 'cover', focalX: 20, focalY: 80 },
          { src: '/media/two.jpg', alt: 'Two' }
        ]
      }
    });

    const root = host.querySelector('.bp-gallery-widget') as HTMLElement | null;
    const images = Array.from(host.querySelectorAll('img')) as HTMLImageElement[];

    expect(root?.classList.contains('bp-gallery-widget--masonry')).toBe(true);
    expect(root?.dataset.heightMode).toBe('largest');
    expect(root?.style.getPropertyValue('--bp-gallery-columns')).toBe('4');
    expect(images[0].style.objectFit).toBe('cover');
    expect(images[0].style.objectPosition).toBe('20% 80%');
    expect(images[1].style.objectFit).toBe('contain');
    expect(images[1].style.objectPosition).toBe('40% 60%');
  });

  it('renders carousel animation, slide count and dots from slider metadata', () => {
    const host = document.createElement('div');
    renderGallery(host, {
      instanceMetadata: {
        mode: 'carousel',
        sliderAnimation: 'fade',
        animationSpeed: 750,
        autoplay: false,
        showDots: true,
        slidesToShow: 2,
        items: [
          { src: '/media/one.jpg', alt: 'One' },
          { src: '/media/two.jpg', alt: 'Two' },
          { src: '/media/three.jpg', alt: 'Three' }
        ]
      }
    });

    const root = host.querySelector('.bp-gallery-widget') as HTMLElement | null;
    expect(root?.classList.contains('bp-gallery-widget--carousel')).toBe(true);
    expect(root?.dataset.animation).toBe('fade');
    expect(root?.style.getPropertyValue('--bp-gallery-duration')).toBe('750ms');
    expect(host.querySelectorAll('.bp-gallery-widget__dots button')).toHaveLength(3);
    expect(host.querySelectorAll('.bp-gallery-widget__controls button')).toHaveLength(2);
  });
});
