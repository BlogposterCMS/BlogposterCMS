/**
 * @jest-environment jsdom
 */

import { initContentHeader } from '../ui/shell/dashboard/contentHeaderActions';

function breadcrumbLabels(): Array<string | null> {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('#content-breadcrumb a'))
    .map(link => link.textContent);
}

function breadcrumbPathnames(): string[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('#content-breadcrumb a'))
    .map(link => new URL(link.href).pathname);
}

describe('contentHeaderActions', () => {
  beforeEach(() => {
    delete (window as any).ADMIN_BASE;
    document.body.innerHTML = '<div class="content-header"><div id="content-breadcrumb"></div></div>';
    window.history.pushState({}, '', '/admin/pages/edit/1');
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete (window as any).ADMIN_BASE;
  });

  it('rebuilds the breadcrumb when the content header initializes more than once', () => {
    initContentHeader();
    initContentHeader();

    expect(breadcrumbLabels()).toEqual(['pages', 'edit', '1']);
    expect(document.querySelectorAll('#content-breadcrumb .breadcrumb-segment')).toHaveLength(3);
    expect(document.querySelector('#content-breadcrumb .breadcrumb-segment.current a')?.textContent).toBe('1');
  });

  it('builds breadcrumb links from the configured admin base', () => {
    (window as any).ADMIN_BASE = '/cms/admin/';
    window.history.pushState({}, '', '/cms/admin/pages/edit/1');

    initContentHeader();

    expect(breadcrumbPathnames()).toEqual([
      '/cms/admin/pages',
      '/cms/admin/pages/edit',
      '/cms/admin/pages/edit/1'
    ]);
  });
});
