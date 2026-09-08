/** @jest-environment jsdom */
import fs from 'fs';
import path from 'path';
import { ADMIN_LOADING_TIMEOUT_MS, beginAdminRegion, finishAdminRegion, initializeAdminShellLoading } from '../ui/shared/feedback/adminShellLoading';

describe('admin shell loading', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });

  it('ships real skeleton markup before any scripts execute', () => {
    const html = fs.readFileSync(path.join(__dirname, '../public/admin.html'), 'utf8');
    document.documentElement.innerHTML = html;
    for (const id of ['top-header', 'main-header', 'sidebar', 'content']) {
      const region = document.getElementById(id)!;
      expect(region.getAttribute('aria-busy')).toBe('true');
      expect(region.querySelector('.bp-loader--skeleton [role="status"]') || region.querySelector('.bp-loader[role="status"]')).not.toBeNull();
      expect(region.querySelectorAll('.bp-loader__skeleton-line')).toHaveLength(3);
      expect(region.querySelector<HTMLAnchorElement>('.admin-shell-error a')?.target).toBe('_top');
    }
    expect(html.indexOf('/ui/shell/entries/adminShellLoading.js')).toBeLessThan(html.indexOf('/build/pageRenderer.js'));
  });

  it('times out independently of renderer boot and leaves ready regions untouched', () => {
    document.body.innerHTML = '<div class="admin-panel"><header id="top-header" data-admin-loading="loading"></header><section id="content" data-admin-loading="loading"></section></div>';
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    initializeAdminShellLoading();
    const content = document.getElementById('content')!;
    const header = document.getElementById('top-header')!;
    finishAdminRegion(header);
    header.textContent = 'Ready header';
    jest.advanceTimersByTime(ADMIN_LOADING_TIMEOUT_MS);
    expect(content.dataset.adminLoading).toBe('error');
    expect(content.dataset.adminLoadingError).toBe('ADMIN_SHELL_LOAD_TIMEOUT');
    expect(content.getAttribute('aria-busy')).toBe('false');
    expect(content.textContent).toContain('Erneut versuchen');
    expect(header.textContent).toBe('Ready header');
    expect(header.dataset.adminLoading).toBe('ready');
  });

  it('adopts an active region once and clears its timeout on completion', () => {
    const region = document.createElement('section');
    beginAdminRegion(region);
    beginAdminRegion(region);
    expect(jest.getTimerCount()).toBe(1);
    expect(region.querySelectorAll('.admin-shell-feedback')).toHaveLength(1);
    finishAdminRegion(region);
    expect(jest.getTimerCount()).toBe(0);
    expect(region.querySelector('.admin-shell-feedback')).toBeNull();
  });
});
