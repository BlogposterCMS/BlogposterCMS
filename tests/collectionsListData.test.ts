/**
 * @jest-environment jsdom
 */

jest.mock('../ui/widgets/plainspace/admin/defaultwidgets/collectionsList/collectionsListData.js', () =>
  jest.requireActual('../ui/widgets/plainspace/admin/defaultwidgets/collectionsList/collectionsListData')
);

import {
  buildCollectionsPayload,
  deriveCollections,
  errorMessage,
  fetchCollections,
  getCollectionIndicator,
  toPages
} from '../ui/widgets/plainspace/admin/defaultwidgets/collectionsList/collectionsListData';
import {
  renderCollectionsList
} from '../ui/widgets/plainspace/admin/defaultwidgets/collectionsList/collectionsList';

describe('collectionsListData', () => {
  const pages = () => [
    { id: 1, title: 'Products', slug: 'products', status: 'published', lane: 'public', meta: { layoutTemplate: 'catalog' } },
    { id: 2, title: 'Bags', slug: 'products/bags', status: 'published', lane: 'public', parent_id: 1 },
    { id: 3, title: 'Archive', slug: 'archive', status: 'draft', lane: 'public', meta: { isCollection: true, designId: 'archive-design' } },
    { id: 4, title: 'Admin', slug: 'admin-only', status: 'published', lane: 'admin', parent_id: 1 },
    { id: 5, title: 'Deleted child', slug: 'products/deleted', status: 'deleted', lane: 'public', parent_id: 1 },
    { id: 6, title: 'Plain', slug: 'plain', status: 'published', lane: 'public' }
  ];

  it('normalizes page payloads and error messages defensively', () => {
    expect(toPages({ data: [{ id: 'a' }, null, 'bad'] })).toEqual([{ id: 'a' }]);
    expect(toPages([{ id: 'b' }, 42])).toEqual([{ id: 'b' }]);
    expect(toPages({ data: 'bad' })).toEqual([]);
    expect(errorMessage(new Error('boom'))).toBe('boom');
    expect(errorMessage('nope')).toBe('nope');
  });

  it('derives collections from public parent pages and explicit collection metadata', () => {
    const collections = deriveCollections(pages());

    expect(collections.map(collection => ({
      title: collection.title,
      childCount: collection.childCount,
      children: collection.children.map(child => child.title),
      indicator: collection.indicator,
      editUrl: collection.editUrl,
      publicUrl: collection.publicUrl
    }))).toEqual([
      {
        title: 'Archive',
        childCount: 0,
        children: [],
        indicator: 'Design: archive-design',
        editUrl: '/admin/pages/edit/3',
        publicUrl: '/archive'
      },
      {
        title: 'Products',
        childCount: 1,
        children: ['Bags'],
        indicator: 'Template: catalog',
        editUrl: '/admin/pages/edit/1',
        publicUrl: '/products'
      }
    ]);
  });

  it('reports layout indicators without taxonomy data', () => {
    expect(getCollectionIndicator({ meta: '{"template":"landing"}' })).toBe('Template: landing');
    expect(getCollectionIndicator({ meta: { layout: { rows: [] } } })).toBe('Layout: configured');
    expect(getCollectionIndicator({ meta: 'not-json' })).toBe('Default');
  });

  it('renders collections as a table instead of a design-only list', () => {
    const host = document.createElement('div');
    renderCollectionsList(host, deriveCollections(pages()));

    expect(host.querySelector('ul')).toBeNull();
    expect(host.querySelector('table.collections-list-table')).not.toBeNull();
    expect(Array.from(host.querySelectorAll('table.collections-list-table > thead th')).map(th => th.textContent)).toEqual([
      'Collection',
      'Slug',
      'Status',
      'Children',
      'Layout',
      'Actions'
    ]);
    expect(host.querySelectorAll('tbody tr.collections-list-row')).toHaveLength(2);
    expect(host.querySelectorAll('table.collections-list-table > tbody > tr.collections-list-row .collections-list-actions a')).toHaveLength(4);
  });

  it('expands collection rows to show child pages', () => {
    const host = document.createElement('div');
    renderCollectionsList(host, deriveCollections(pages()));

    const childRow = host.querySelector<HTMLTableRowElement>('.collections-list-child-row');
    const toggle = host.querySelector<HTMLButtonElement>('.collections-list-toggle');

    expect(childRow?.hidden).toBe(true);
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');

    toggle?.click();
    expect(toggle?.getAttribute('aria-expanded')).toBe('true');
    expect(childRow?.hidden).toBe(false);
    expect(childRow?.textContent).toContain('Bags');

    toggle?.click();
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(childRow?.hidden).toBe(true);
  });

  it('builds the pagesManager lane payload and fetches collections through meltdownEmit', async () => {
    const emit = jest.fn(async () => ({ data: pages() }));

    await expect(fetchCollections(emit, 'admin-token')).resolves.toHaveLength(2);
    expect(buildCollectionsPayload('admin-token')).toEqual({
      jwt: 'admin-token',
      moduleName: 'pagesManager',
      moduleType: 'core',
      lane: 'public'
    });
    expect(emit).toHaveBeenCalledWith('getPagesByLane', {
      jwt: 'admin-token',
      moduleName: 'pagesManager',
      moduleType: 'core',
      lane: 'public'
    });
  });

  it('fails with a searchable code when the emitter is unavailable', async () => {
    await expect(fetchCollections(undefined as never, 'admin-token'))
      .rejects.toThrow('PLAINSPACE_COLLECTIONS_EMITTER_UNAVAILABLE');
  });
});
