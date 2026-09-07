/** @jest-environment jsdom */
import { renderPageDesignPreview } from '../ui/widgets/plainspace/admin/defaultwidgets/pageList/pageDesignPreview';

test('shows the attached page design ahead of its outer main design', () => {
  const host = document.createElement('div');
  renderPageDesignPreview(host, { sourcePage: {}, inherited: false, depth: 0, designId: '1', contentDesignId: '2' },
    [{ id: '2', title: 'Landing', thumbnail: '/media/landing.png' }], '/admin');
  expect(host.querySelector('a')?.getAttribute('href')).toBe('/admin/studio/design/2');
  expect(host.querySelector('img')?.getAttribute('src')).toBe('/media/landing.png');
  expect(host.textContent).toContain('Page design');
  host.querySelector('img')!.dispatchEvent(new Event('error'));
  expect(host.querySelector('img')?.getAttribute('src')).toBe('/assets/icons/file.svg');
});

test('labels inherited designs and clears stale preview when no design is attached', () => {
  const host = document.createElement('div');
  renderPageDesignPreview(host, { sourcePage: {}, inherited: true, depth: 1, designId: '3' }, [], '/admin');
  expect(host.textContent).toContain('Inherited design');
  renderPageDesignPreview(host, null, [], '/admin');
  expect(host.querySelector('.page-manager__design-preview')).toBeNull();
  expect(host.textContent).toContain('No design attached');
});

test('offers direct design editing and page-specific attachment shortcuts', () => {
  const host = document.createElement('div');
  document.body.append(host);
  renderPageDesignPreview(host, { sourcePage: { id: 'parent' }, inherited: true, depth: 1, designId: '14' }, [], '/admin', 'child');
  expect(host.querySelector('.button.primary')?.getAttribute('href')).toBe('/admin/studio/design/14');
  host.querySelector<HTMLButtonElement>('[aria-label="More page actions"]')!.click();
  const links = [...document.querySelectorAll<HTMLAnchorElement>('[role="menuitem"]')];
  expect(links.map(link => link.getAttribute('href'))).toEqual([
    '/admin/pages/edit/child#page-design', '/admin/pages/edit/child#page-html', '/admin/pages/edit/child#page-html-upload'
  ]);
  document.body.replaceChildren();
});
