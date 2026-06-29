/**
 * @jest-environment jsdom
 */

import { render } from '../ui/widgets/plainspace/public/basicwidgets/collectionArchiveWidget';

describe('collection archive public widget', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders manual page cards with a shared style source contract', async () => {
    const el = document.createElement('div');

    await render(el, {
      id: 'archive-1',
      instanceMetadata: {
        columns: 2,
        buttonLabel: 'Open page',
        items: [
          {
            id: 'page-a',
            title: 'First page',
            slug: 'first-page',
            meta: {
              seoDescription: 'First SEO description',
              featuredImage: '/media/first.jpg'
            }
          },
          {
            id: 'page-b',
            title: 'Second page',
            slug: 'second-page',
            meta: {
              seoDescription: 'Second SEO description'
            }
          }
        ]
      }
    });

    const cards = el.querySelectorAll<HTMLElement>('.bp-collection-archive__card');
    expect(cards).toHaveLength(2);
    expect(cards[0]?.id).toBe('collection-card-template-archive-1');
    expect(cards[0]?.dataset.styleSourceRole).toBe('source');
    expect(cards[1]?.dataset.styleSourceRole).toBe('follower');
    expect(cards[1]?.dataset.styleSourceId).toBe('collection-card-template-archive-1');
    expect(el.querySelector('.bp-collection-archive__title')?.textContent).toBe('First page');
    expect(el.querySelector('.bp-collection-archive__description')?.textContent).toBe('First SEO description');
    expect(el.querySelector<HTMLAnchorElement>('.bp-collection-archive__action')?.href).toContain('/first-page');
    expect(el.querySelector('.bp-collection-archive__action')?.textContent).toBe('Open page');
  });

  it('loads selected collection child pages through the public event bridge', async () => {
    const el = document.createElement('div');
    const emit = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'child-page',
          title: 'Child page',
          slug: 'child-page',
          meta: {
            seoDescription: 'Child SEO description'
          }
        }
      ]
    });

    await render(el, {
      id: 'archive-2',
      instanceMetadata: {
        collectionId: 'parent-page'
      },
      emit
    });

    expect(emit).toHaveBeenCalledWith('getChildPages', {
      parentId: 'parent-page',
      lane: 'public',
      moduleName: 'pagesManager',
      moduleType: 'core'
    });
    expect(el.querySelector('.bp-collection-archive__title')?.textContent).toBe('Child page');
    expect(el.querySelector('.bp-public-widget-message')).toBeNull();
  });
});
