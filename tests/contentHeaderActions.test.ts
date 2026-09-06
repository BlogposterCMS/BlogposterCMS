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

  it('hides layout controls for fixed tools and restores them on customizable dashboards', () => {
    document.body.innerHTML = '<main id="content" data-dashboard-layout="fixed"><div class="content-header"><button id="widgets-toggle-inline"></button><button id="edit-toggle"></button></div></main>';
    document.body.classList.add('dashboard-edit-mode');
    initContentHeader();
    expect(document.getElementById('widgets-toggle-inline')?.hidden).toBe(true);
    expect(document.getElementById('edit-toggle')?.hidden).toBe(true);
    expect(document.body.classList.contains('dashboard-edit-mode')).toBe(false);
    document.getElementById('content')!.dataset.dashboardLayout = 'custom';
    initContentHeader();
    expect(document.getElementById('widgets-toggle-inline')?.hidden).toBe(false);
    expect(document.getElementById('edit-toggle')?.hidden).toBe(false);
  });
});
