/**
 * @jest-environment jsdom
 */

import {
  applyRuntimePageTitle,
  exposeRuntimeWidgetRegistry,
  resolveRuntimePageContext
} from '../ui/runtime/main/runtimePageContext';

describe('runtimePageContext', () => {
  beforeEach(() => {
    document.title = '';
    delete window.PAGE_SLUG;
    delete window.DEBUG_RENDERER;
    delete window.ADMIN_BASE;
    delete window.availableWidgets;
  });

  it('resolves public route context from the pathname', () => {
    expect(resolveRuntimePageContext({ pathname: '/blog/news/latest' })).toEqual({
      lane: 'public',
      slug: 'blog-news-latest',
      debug: false
    });
  });

  it('strips the admin prefix and falls back to dashboard', () => {
    expect(resolveRuntimePageContext({ pathname: '/admin/settings' })).toMatchObject({
      lane: 'admin',
      slug: 'settings'
    });
    expect(resolveRuntimePageContext({ pathname: '/admin' })).toMatchObject({
      lane: 'admin',
      slug: 'dashboard'
    });
  });

  it('strips nested admin base paths when resolving admin page slugs', () => {
    window.ADMIN_BASE = '/cms/admin/';

    expect(resolveRuntimePageContext({ pathname: '/cms/admin/workspace-alpha/settings' })).toMatchObject({
      lane: 'admin',
      slug: 'workspace-alpha/settings'
    });

    expect(resolveRuntimePageContext({
      pathname: '/cms/admin',
      adminBase: '/cms/admin/'
    })).toMatchObject({
      lane: 'admin',
      slug: 'dashboard'
    });
  });

  it('does not classify admin-like public paths as admin lane pages', () => {
    expect(resolveRuntimePageContext({ pathname: '/administrator-guide' })).toMatchObject({
      lane: 'public',
      slug: 'administrator-guide'
    });
  });

  it('lets an explicit page slug and debug flag override globals', () => {
    window.PAGE_SLUG = 'from-window';
    window.DEBUG_RENDERER = true;

    expect(resolveRuntimePageContext({
      pathname: '/admin/ignored',
      pageSlug: 'from-input',
      debug: false
    })).toEqual({
      lane: 'admin',
      slug: 'from-input',
      debug: false
    });
  });

  it('uses the navigation pathname instead of stale window page slug during content-only admin navigation', () => {
    window.PAGE_SLUG = 'content';

    expect(resolveRuntimePageContext({
      pathname: '/admin/content/pages'
    })).toEqual({
      lane: 'admin',
      slug: 'content/pages',
      debug: false
    });
  });

  it('matches server admin detail routes by stripping trailing page identifiers', () => {
    expect(resolveRuntimePageContext({
      pathname: '/admin/pages/edit/1'
    })).toEqual({
      lane: 'admin',
      slug: 'pages/edit',
      debug: false
    });

    expect(resolveRuntimePageContext({
      pathname: '/admin/pages/edit/507f1f77bcf86cd799439011'
    })).toMatchObject({
      lane: 'admin',
      slug: 'pages/edit'
    });
  });

  it('applies admin page titles only for admin lane pages', () => {
    applyRuntimePageTitle({ title: 'Overview' }, 'public');
    expect(document.title).toBe('');

    applyRuntimePageTitle({ title: 'Overview' }, 'admin');
    expect(document.title).toBe('Overview - Admin');
  });

  it('exposes widget registry state through the browser global', () => {
    const widgets = [{ id: 'stats' }];
    exposeRuntimeWidgetRegistry(widgets);
    expect(window.availableWidgets).toBe(widgets);

    exposeRuntimeWidgetRegistry(null);
    expect(window.availableWidgets).toEqual([]);
  });
});
