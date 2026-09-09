import { acceptsMedia, mediaEntries, mediaSize, publicMediaUrl, visibleMediaEntries } from '../ui/shared/media/mediaExplorerEntries';
import { toFolderListing } from '../ui/shared/media/mediaLibraryData';

describe('Explorer file records', () => {
  it('does not map a private remote object onto the local public folder', () => {
    const listing = toFolderListing({ folders: [], files: ['private.png'], details: [{ name: 'private.png', url: '' }] });
    expect(publicMediaUrl(mediaEntries(listing, 'public')[0]!)).toBe('');
  });
  it('retains old name-only listings and safely reads optional file metadata', () => {
    const listing = toFolderListing({ folders: ['docs'], files: ['empty.txt', 'unknown.txt'], details: [
      { name: 'empty.txt', size: 0, modifiedAt: '2026-09-05T10:00:00Z' },
      { name: 'unknown.txt', size: -100, modifiedAt: null }, null
    ] });
    const records = mediaEntries(listing, 'public');
    expect(records[1]).toMatchObject({ size: 0, path: 'public/empty.txt' });
    expect(records[2]).toMatchObject({ size: null, modifiedAt: '' });
    expect(mediaSize(0)).toBe('0 B');
    expect(mediaSize(null)).toBe('—');
  });

  it('keeps folders first for descending sorts and uses natural filename order', () => {
    const entries = mediaEntries({ folders: ['docs'], files: ['file10.txt', 'file2.txt'], currentPath: '', parentPath: '' }, '');
    expect(visibleMediaEntries(entries, '', 'name', false).map(item => item.name)).toEqual(['docs', 'file2.txt', 'file10.txt']);
    expect(visibleMediaEntries(entries, '', 'name', true).map(item => item.name)).toEqual(['docs', 'file10.txt', 'file2.txt']);
    expect(visibleMediaEntries(entries, ' FILE2 ', 'name', false)).toHaveLength(1);
  });

  it('never derives preview URLs outside the public library and respects picker types', () => {
    const image = mediaEntries({ folders: [], files: ['hero #1.png'], currentPath: '', parentPath: '' }, 'public')[0];
    expect(publicMediaUrl(image)).toBe('/media/hero%20%231.png');
    expect(publicMediaUrl({ ...image, path: 'users/private.png' })).toBe('');
    expect(publicMediaUrl({ ...image, path: 'public/../secret.png' })).toBe('');
    expect(publicMediaUrl({ ...image, path: 'public/..\\secret.png' })).toBe('');
    expect(acceptsMedia(image, 'image/*')).toBe(true);
    expect(acceptsMedia(image, '.jpg,.png')).toBe(true);
    expect(acceptsMedia(image, 'application/pdf')).toBe(false);
  });
});
